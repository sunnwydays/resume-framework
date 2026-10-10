"use client";

import { useRef, useState } from "react";
import { GmailError, type ScanProgress } from "@/lib/tracker/email/gmail";
import { MARK_READ_KEY, scanStart } from "@/lib/tracker/email/scan";
import ModalBackdrop from "@/components/tracker/ModalBackdrop";
import { buttonCls, inputCls, primaryButtonCls, type JobPosting } from "@/lib/tracker/format";
import { defaultPostingScanFrom } from "@/lib/tracker/postings/scan";
import type { PostingsStore } from "@/lib/tracker/usePostings";
import { useLocalSetting } from "@/lib/tracker/useLocalSetting";

interface Props {
  store: PostingsStore;
  postings: JobPosting[];
  now: number;
}

// "Scan alerts": reads Jobright's instant-alert emails from the chosen date,
// turns each card into a posting, stores the new ones, and marks the alerts
// read in Gmail (the box is shared with "Scan Gmail"). Nothing is applied to
// the tracker from here.
export default function PostingsScan({ store, postings, now }: Props) {
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [markReadSetting, setMarkReadSetting] = useLocalSetting(MARK_READ_KEY, "1");
  const markRead = markReadSetting === "1";

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
      const result = await store.scanAlerts(scanStart(since), {
        onProgress: setProgress,
        onReading: (done, total) => setReading({ done, total }),
        signal: abort.current.signal,
        markRead,
      });
      if ("error" in result) setError(result.error);
      else setSummary(result.summary);
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
        <ModalBackdrop onDismiss={running ? undefined : () => setOpen(false)}>
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
              Reads your Jobright instant alerts from Gmail (Google asks first; nothing is kept after you reload) and
              lists each posting once, however many alerts it showed up in. Nothing changes in the tracker until
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
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={markRead}
                onChange={(e) => setMarkReadSetting(e.target.checked ? "1" : "0")}
                disabled={running}
                className="mt-0.5"
              />
              <span>
                Mark the alerts read in Gmail
                <span className="block text-xs text-neutral-500">Unticked, the scan only asks Google for read-only access.</span>
              </span>
            </label>
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
        </ModalBackdrop>
      )}
    </>
  );
}
