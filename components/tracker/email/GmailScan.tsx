"use client";

import { useRef, useState } from "react";
import { GmailError, scanGmail, type ScanProgress } from "@/lib/tracker/email/gmail";
import { analyze } from "@/lib/tracker/email/group";
import { isMuted } from "@/lib/tracker/email/mute";
import { toRow } from "@/lib/tracker/email/rows";
import { defaultScanFrom, scanNudge, scanStart, summarizeScan } from "@/lib/tracker/email/scan";
import { buttonCls, inputCls, primaryButtonCls } from "@/lib/tracker/format";
import type { TablesInsert } from "@/lib/tracker/database.types";
import type { Tracker } from "@/lib/tracker/useTracker";

interface Props {
  tracker: Tracker;
  pending: number; // cards waiting in the review tab
  now: number;
  onScanned: () => void; // e.g. switch to the review tab
}

// "Scan Gmail": reads the inbox from the chosen date with a read-only token,
// keeps what the rules recognize (minus mutes) for review, and records the
// scan. Nothing is applied to the tracker from here.
export default function GmailScan({ tracker, pending, now, onScanned }: Props) {
  const { gmail, applications } = tracker;
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const nudge = scanNudge(gmail.lastScan?.scanned_at ?? null, pending, now);

  function start() {
    setSince(defaultScanFrom(gmail.lastScan, applications));
    setError(null);
    setSummary(null);
    setOpen(true);
  }

  async function run() {
    setRunning(true);
    setError(null);
    setSummary(null);
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
    } catch (e) {
      if ((e as Error).name === "AbortError") setError("Cancelled. Nothing from this scan was saved.");
      // Closing Google's popup is a change of mind, not a failure.
      else if (e instanceof GmailError && e.code === "denied") setOpen(false);
      else setError(e instanceof GmailError ? e.message : `Unexpected error: ${(e as Error).message}`);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={start} className={buttonCls}>
        Scan Gmail
      </button>
      <span className={`text-xs ${nudge.stale ? "text-amber-700 dark:text-amber-400" : "text-neutral-500"}`}>{nudge.text}</span>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
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
            <div aria-live="polite" className="text-sm">
              {running &&
                (progress
                  ? progress.phase === "listing"
                    ? `Finding emails… ${progress.done}`
                    : `Reading ${progress.done} of ${progress.total} emails…`
                  : "Waiting for Google…")}
              {summary && <p>{summary}</p>}
              {error && <p className="text-red-700 dark:text-red-400">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
