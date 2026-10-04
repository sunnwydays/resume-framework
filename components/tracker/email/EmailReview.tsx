"use client";

import { useEffect, useRef, useState } from "react";
import Chip from "@/components/tracker/Chip";
import EmailJobCard from "@/components/tracker/email/EmailJobCard";
import { muteValue } from "@/lib/tracker/email/mute";
import { buildPayload, defaultTicks, newAppDefaults, type EmailJobPayload } from "@/lib/tracker/email/payload";
import { category, countByCategory, REVIEW_FILTERS, type Review, type ReviewFilter } from "@/lib/tracker/email/review";
import { MUTE_KINDS, buttonCls, type MuteKind } from "@/lib/tracker/format";
import type { Tracker } from "@/lib/tracker/useTracker";

interface Props {
  tracker: Tracker;
  review: Review;
}

const PAGE = 40;

// The "From Gmail" tab: one card per job, newest activity first.
export default function EmailReview({ tracker, review }: Props) {
  const { applications, assessments, statusChanges, gmail } = tracker;
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [shown, setShown] = useState(PAGE);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showMutes, setShowMutes] = useState(false);

  // Bulk accept re-reads the cards after every accept (a new row can change
  // what later cards match), so it needs the latest review, not a stale one.
  const latest = useRef(review);
  useEffect(() => {
    latest.current = review;
  });

  const rowIdOf = (gmailId: string) => review.rowIdOf.get(gmailId)!;
  const counts = countByCategory(review.groups);
  const visible = review.groups.filter((g) => filter === "all" || category(g) === filter);
  const ready = review.groups.filter((g) => g.ready && !g.nothingToDo);
  const nothing = review.groups.filter((g) => category(g) === "nothing");

  async function accept(payload: EmailJobPayload, label: string): Promise<string | null> {
    const error = await tracker.applyEmailJob(payload);
    setMessage(error ? null : `Saved ${label}.`);
    return error;
  }

  async function acceptReady() {
    const keys = ready.map((g) => g.key);
    if (!window.confirm(`Accept ${keys.length} card${keys.length === 1 ? "" : "s"} as suggested? Check them over first; each can be undone from its application afterwards.`)) return;
    setMessage(null);
    let done = 0;
    for (const key of keys) {
      setBulk({ done, total: keys.length });
      const g = latest.current.groups.find((x) => x.key === key);
      if (!g || !g.ready || g.nothingToDo) continue;
      const rowId = (gmailId: string) => latest.current.rowIdOf.get(gmailId)!;
      const error = await tracker.applyEmailJob(buildPayload(g, defaultTicks(g), rowId, g.target.type === "new" ? newAppDefaults(g) : undefined));
      if (error) {
        setMessage(`Stopped after ${done}: ${error}`);
        setBulk(null);
        return;
      }
      done++;
      // Let the reload render, so the next card is re-matched against it.
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    }
    setBulk(null);
    setMessage(`Accepted ${done} card${done === 1 ? "" : "s"}.`);
  }

  function dismissNothing() {
    tracker.dismissEmails(nothing.flatMap((g) => g.emails.map((e) => rowIdOf(e.facts.gmailId))));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(REVIEW_FILTERS) as ReviewFilter[]).map((f) => (
          <Chip
            key={f}
            active={filter === f}
            onClick={() => {
              setFilter(f);
              setShown(PAGE);
            }}
            label={REVIEW_FILTERS[f]}
            count={counts[f]}
          />
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {ready.length > 0 && (
            <button type="button" className={buttonCls} onClick={acceptReady} disabled={bulk !== null}>
              {bulk ? `Accepting ${bulk.done + 1} of ${bulk.total}…` : `Accept ${ready.length} ready`}
            </button>
          )}
          {nothing.length > 0 && (
            <button type="button" className={buttonCls} onClick={dismissNothing} disabled={bulk !== null}>
              Dismiss {nothing.length} with nothing to do
            </button>
          )}
          {gmail.mutes.length > 0 && (
            <div className="relative">
              <button type="button" className={buttonCls} onClick={() => setShowMutes((v) => !v)} aria-expanded={showMutes}>
                Muted {gmail.mutes.length}
                {review.muted > 0 && <span className="text-neutral-500"> · hiding {review.muted}</span>}
              </button>
              {showMutes && (
                <ul className="absolute right-0 z-10 mt-1 w-72 space-y-0.5 rounded-md border border-neutral-200 bg-surface p-1 shadow-lg dark:border-neutral-800">
                  {gmail.mutes.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="text-xs text-neutral-500">{MUTE_KINDS[m.kind as MuteKind] ?? m.kind}:</span> {m.value}
                      </span>
                      <button type="button" className="shrink-0 text-xs underline" onClick={() => tracker.removeMute(m.id)}>
                        Unmute
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {message && <p className="text-sm text-neutral-600 dark:text-neutral-400">{message}</p>}

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">Nothing here.</p>
      ) : (
        <div className="space-y-3">
          {visible.slice(0, shown).map((g) => (
            <EmailJobCard
              key={g.key}
              group={g}
              applications={applications}
              assessments={assessments}
              statusChanges={statusChanges}
              rowIdOf={rowIdOf}
              onAccept={accept}
              onDismiss={tracker.dismissEmails}
              onMute={(kind, value) => tracker.addMute(kind, muteValue(kind, value))}
            />
          ))}
          {visible.length > shown && (
            <button type="button" className={buttonCls} onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, visible.length - shown)} more of {visible.length - shown}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
