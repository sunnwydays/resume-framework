"use client";

import { useRef, useState } from "react";
import { GmailError, alertQuery, fetchMessages, type ScanProgress } from "@/lib/tracker/email/gmail";
import { messageHtml, parseGmailMessage } from "@/lib/tracker/email/parse";
import { scanStart } from "@/lib/tracker/email/scan";
import { buttonCls, inputCls, primaryButtonCls, type JobPosting } from "@/lib/tracker/format";
import { isJobrightAlert, parseJobrightAlert, type ParsedPosting } from "@/lib/tracker/postings/parse";
import { dedupePostings, defaultPostingScanFrom, summarizePostingScan, toPostingRow } from "@/lib/tracker/postings/scan";
import type { PostingsStore } from "@/lib/tracker/usePostings";

interface Props {
  store: PostingsStore;
  postings: JobPosting[];
  now: number;
}

// "Scan alerts": reads Jobright's instant-alert emails from the chosen date
// with a read-only Gmail token, turns each card into a posting, and stores the
// new ones. Nothing is applied to the tracker from here.
export default function PostingsScan({ store, postings, now }: Props) {
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  function start() {
    setSince(defaultPostingScanFrom(postings, now));
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
      const result = await fetchMessages(alertQuery(scanStart(since)), { onProgress: setProgress, signal: abort.current.signal });
      const parsed: ParsedPosting[] = [];
      let alerts = 0;
      let unreadable = result.failed;
      for (const message of result.messages) {
        try {
          const facts = parseGmailMessage(message);
          if (!isJobrightAlert(facts.fromAddress, facts.subject)) continue;
          alerts++;
          parsed.push(...parseJobrightAlert(messageHtml(message), facts.receivedAt, facts.gmailId));
        } catch {
          unreadable++;
        }
      }
      const unique = dedupePostings(parsed);
      const saved = await store.savePostings(unique.map(toPostingRow));
      if ("error" in saved) {
        setError(`Couldn't save the postings: ${saved.error}`);
        return;
      }
      // The title seldom names the term or length; the posting page does.
      // Covers older postings that were never read, too. A failure here
      // doesn't undo the scan.
      const details = await store.readDetails([...postings, ...saved.rows], (done, total) => setReading({ done, total }));
      const detailsNote = "error" in details ? ` · couldn't read posting pages: ${details.error}` : details.read ? ` · read ${details.read} posting pages for term and length` : "";
      const capped = result.capped ? ` · stopped at ${result.listed}; scan again from a later date for the rest` : "";
      const failed = unreadable ? ` · ${unreadable} couldn't be read` : "";
      setSummary(`${summarizePostingScan({ alerts, postings: unique.length, saved: saved.saved })}${failed}${detailsNote}${capped}`);
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
    <>
      <button type="button" onClick={start} className={buttonCls}>
        Scan alerts
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
          <div className="w-full max-w-lg space-y-4 rounded-lg bg-surface p-5 shadow-xl">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">Scan job alerts</h2>
              {!running && (
                <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500 underline">
                  {summary ? "Close" : "Cancel"}
                </button>
              )}
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Reads your Jobright instant alerts with read-only Gmail access (Google asks first; nothing is kept after you
              reload) and lists each posting once, however many alerts it showed up in. Nothing changes in the tracker until
              you mark one applied.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Scan from
                <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className={`${inputCls} w-40`} disabled={running} />
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
              {postings.length > 0
                ? "Starts a day before the newest posting you have; postings already saved, applied or dismissed are skipped."
                : "First scan: starts two weeks back."}
            </p>
            <div aria-live="polite" className="text-sm">
              {running &&
                (reading
                  ? `Reading posting pages… ${reading.done} of ${reading.total}`
                  : progress
                  ? progress.phase === "listing"
                    ? `Finding alerts… ${progress.done}`
                    : `Reading ${progress.done} of ${progress.total} alerts…`
                  : "Waiting for Google…")}
              {summary && <p>{summary}</p>}
              {error && <p className="text-red-700 dark:text-red-400">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
