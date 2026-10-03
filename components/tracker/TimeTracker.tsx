"use client";

import { useState } from "react";
import { useNow } from "@/lib/tracker/useTracker";
import { useTimeLog } from "@/lib/tracker/useTimeLog";
import {
  buttonCls,
  formatClock,
  formatHours,
  inputCls,
  parseDuration,
  primaryButtonCls,
  todayISO,
} from "@/lib/tracker/format";

const QUICK_ADD_MIN = [1, 5, 15];

export default function TimeTracker() {
  const log = useTimeLog();
  const running = log.startedAt !== null;
  const now = useNow(running ? 1000 : 60_000);
  const [draft, setDraft] = useState<string | null>(null);

  const elapsed = log.startedAt !== null ? Math.max(0, Math.floor((now - log.startedAt) / 1000)) : 0;
  const today = (log.days[todayISO(now)] ?? 0) + elapsed;
  const total = Object.values(log.days).reduce((sum, s) => sum + s, 0) + elapsed;
  const parsed = draft === null ? null : parseDuration(draft);

  function saveDraft(e: React.FormEvent) {
    e.preventDefault();
    if (parsed === null) return;
    log.setToday(parsed);
    setDraft(null);
  }

  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-surface px-4 py-3">
      <button
        type="button"
        onClick={running ? log.stop : log.start}
        className={`${running ? buttonCls : primaryButtonCls} w-24`}
      >
        {running ? "Stop" : "Start timer"}
      </button>

      {draft === null ? (
        <div className="flex items-baseline gap-2">
          {running && <span className="h-2 w-2 self-center rounded-full bg-red-500 animate-pulse" />}
          <span className="font-mono text-xl tabular-nums">{formatClock(today)}</span>
          <span className="text-xs text-neutral-500">
            today · <span className="tabular-nums">{formatHours(total)}</span> total
          </span>
        </div>
      ) : (
        <form onSubmit={saveDraft} className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setDraft(null)}
            placeholder="1:30 or 45m"
            aria-label="Time spent today"
            className={`${inputCls} w-32 font-mono ${parsed === null && draft.trim() ? "border-red-400!" : ""}`}
          />
          <button type="submit" disabled={parsed === null} className={buttonCls}>
            Set today
          </button>
          <button type="button" onClick={() => setDraft(null)} className={buttonCls}>
            Cancel
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-1.5 sm:ml-auto">
        {QUICK_ADD_MIN.map((m) => (
          <button key={m} type="button" onClick={() => log.add(m * 60)} className={buttonCls}>
            +{m}m
          </button>
        ))}
        {draft === null && (
          <button type="button" onClick={() => setDraft(formatClock(today))} className={buttonCls}>
            Set…
          </button>
        )}
      </div>

      {log.error && (
        <p className="w-full text-xs text-red-600 dark:text-red-400">
          {log.error}{" "}
          <button type="button" onClick={log.clearError} className="underline">
            Dismiss
          </button>
        </p>
      )}
    </section>
  );
}
