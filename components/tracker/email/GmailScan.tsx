"use client";

import { useRef, useState } from "react";
import { GmailError, scanGmail, type ScanProgress } from "@/lib/tracker/email/gmail";
import { analyze } from "@/lib/tracker/email/group";
import { isMuted } from "@/lib/tracker/email/mute";
import { toRow } from "@/lib/tracker/email/rows";
import { defaultScanFrom, scanNudge, scanStart, summarizeScan } from "@/lib/tracker/email/scan";
import ModalBackdrop from "@/components/tracker/ModalBackdrop";
import { buttonCls, inputCls, primaryButtonCls } from "@/lib/tracker/format";
import type { TablesInsert } from "@/lib/tracker/database.types";
import { defaultPostingScanFrom } from "@/lib/tracker/postings/scan";
import type { PostingsStore } from "@/lib/tracker/usePostings";
import type { Tracker } from "@/lib/tracker/useTracker";

interface Props {
  tracker: Tracker;
  postings: PostingsStore;
  pending: number; // cards waiting in the review tab
  now: number;
  onScanned: () => void; // e.g. switch to the review tab
}

// "Scan Gmail": reads the inbox from the chosen date with a read-only token,
// keeps what the rules recognize (minus mutes) for review, and records the
// scan. Then, unless unticked, runs the Postings page's Jobright alert scan
// on the same token. Nothing is applied to the tracker from here.
export default function GmailScan({ tracker, postings, pending, now, onScanned }: Props) {
  const { gmail, applications } = tracker;
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [withAlerts, setWithAlerts] = useState(true);
  const [stage, setStage] = useState<"mail" | "alerts">("mail");
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [alertsLine, setAlertsLine] = useState<{ text: string; failed: boolean } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const nudge = scanNudge(gmail.lastScan?.scanned_at ?? null, pending, now);
  // Alerts keep their own start (a day before the newest posting): they arrive
  // ~7 a day, so sharing the mail's earlier date would flood the scan cap.
  const alertsStart = scanStart(defaultPostingScanFrom(postings.postings, now));

  function start() {
    setSince(defaultScanFrom(gmail.lastScan, applications));
    setError(null);
    setSummary(null);
    setAlertsLine(null);
    setOpen(true);
  }

  // The second leg of the scan. The mail is already saved by now, so a problem
  // here is reported on its own line instead of failing the whole scan.
  async function runAlerts() {
    setStage("alerts");
    setProgress(null);
    try {
      const result = await postings.scanAlerts(alertsStart, {
        onProgress: setProgress,
        onReading: (done, total) => setReading({ done, total }),
        signal: abort.current?.signal,
      });
      setAlertsLine("error" in result ? { text: result.error, failed: true } : { text: result.summary, failed: false });
    } catch (e) {
      const text =
        (e as Error).name === "AbortError"
          ? "Cancelled before the job alerts were scanned. The mail above was saved."
          : e instanceof GmailError
            ? e.message
            : `Unexpected error: ${(e as Error).message}`;
      setAlertsLine({ text, failed: true });
    }
  }

  async function run() {
    setRunning(true);
    setError(null);
    setSummary(null);
    setAlertsLine(null);
    setStage("mail");
    abort.current = new AbortController();
    try {
      const result = await scanGmail({ since: scanStart(since), mode: "rules", onProgress: setProgress, signal: abort.current.signal });
      const analyzed = result.facts.map(analyze);
      const rows: TablesInsert<"email_messages">[] = [];
      let muted = 0;
      for (const a of analyzed) {
        if (!a.kind) continue;
        if (isMuted(a, gmail.mutes)) muted++;
        else rows.push(toRow(a)!);
      }
      const saved = await tracker.saveEmails(rows);
      if ("error" in saved) {
        setError(`Couldn't save the emails: ${saved.error}`);
        return;
      }
      await tracker.recordScan({ since: scanStart(since).toISOString(), fetched: result.listed, saved: saved.saved });
      const capped = result.capped ? ` · stopped at ${result.listed}; scan again from a later date for the rest` : "";
      const failed = result.failed ? ` · ${result.failed} couldn't be read` : "";
      setSummary(`${summarizeScan({ analyzed, muted, saved: saved.saved, updated: saved.updated })}${failed}${capped}`);
      if (saved.saved > 0 || saved.updated > 0) onScanned();
      if (withAlerts) await runAlerts();
    } catch (e) {
      if ((e as Error).name === "AbortError") setError("Cancelled. Nothing from this scan was saved.");
      // Closing Google's popup is a change of mind, not a failure.
      else if (e instanceof GmailError && e.code === "denied") setOpen(false);
      else setError(e instanceof GmailError ? e.message : `Unexpected error: ${(e as Error).message}`);
    } finally {
      setRunning(false);
      setProgress(null);
      setReading(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={start} className={buttonCls}>
        Scan Gmail
      </button>
      <span className={`text-xs ${nudge.stale ? "text-amber-700 dark:text-amber-400" : "text-neutral-500"}`}>{nudge.text}</span>

      {open && (
        <ModalBackdrop onDismiss={running ? undefined : () => setOpen(false)}>
          <div className="w-full max-w-lg space-y-4 rounded-lg bg-surface p-5 shadow-xl">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">Scan Gmail</h2>
              {!running && (
                <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500 underline">
                  {summary ? "Close" : "Cancel"}
                </button>
              )}
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Reads your inbox with read-only access (Google asks first; nothing is kept after you reload) and looks for
              application confirmations, rejections, and OA and interview invites. They show up under <em>From Gmail</em> as
              suggestions; nothing changes in the tracker until you accept one.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Scan from
                <input
                  type="date"
                  value={since}
                  onChange={(e) => setSince(e.target.value)}
                  className={`${inputCls} w-40`}
                  disabled={running}
                />
              </label>
              {running ? (
                <button type="button" className={buttonCls} onClick={() => abort.current?.abort()}>
                  Stop
                </button>
              ) : (
                <button type="button" className={primaryButtonCls} onClick={run} disabled={!since}>
                  {summary ? "Scan again" : "Scan"}
                </button>
              )}
            </div>
            <p className="text-xs text-neutral-500">
              {gmail.lastScan
                ? "Starts a little before your last scan; emails already accepted or dismissed are skipped, and ones still waiting for review are re-read with the current rules."
                : "First scan: starts at your earliest tracked application."}
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={withAlerts} onChange={(e) => setWithAlerts(e.target.checked)} disabled={running} className="mt-0.5" />
              <span>
                Also scan Jobright job alerts
                <span className="block text-xs text-neutral-500">
                  New postings go to the Postings page. Starts{" "}
                  {postings.postings.length > 0 ? "a day before the newest posting you have" : "two weeks back"} (
                  {alertsStart.toLocaleDateString()}), separately from the date above.
                </span>
              </span>
            </label>
            <div aria-live="polite" className="text-sm">
              {running &&
                (stage === "alerts" && reading
                  ? `Reading posting pages… ${reading.done} of ${reading.total}`
                  : progress
                    ? progress.phase === "listing"
                      ? `Finding ${stage === "alerts" ? "alerts" : "emails"}… ${progress.done}`
                      : `Reading ${progress.done} of ${progress.total} ${stage === "alerts" ? "alerts" : "emails"}…`
                    : "Waiting for Google…")}
              {summary && <p>{summary}</p>}
              {alertsLine && <p className={alertsLine.failed ? "text-red-700 dark:text-red-400" : undefined}>{alertsLine.text}</p>}
              {error && <p className="text-red-700 dark:text-red-400">{error}</p>}
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
