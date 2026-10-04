"use client";

import { useEffect, useRef, useState } from "react";
import Chip from "@/components/tracker/Chip";
import EmailJobCard from "@/components/tracker/email/EmailJobCard";
import { muteValue } from "@/lib/tracker/email/mute";
import { buildPayload, defaultTicks, newAppDefaults, type EmailJobPayload } from "@/lib/tracker/email/payload";
import { category, countByCategory, REVIEW_FILTERS, type Review, type ReviewFilter } from "@/lib/tracker/email/review";
import { emailTrail } from "@/lib/tracker/email/trail";
import { MUTE_KINDS, buttonCls, type MuteKind } from "@/lib/tracker/format";
import { DEFAULT_TRIMS, TRIM_LABELS, trimsFromString, trimsToString, type RoleTrimOptions } from "@/lib/tracker/trimRole";
import { useLocalSetting } from "@/lib/tracker/useLocalSetting";
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
  const [last, setLast] = useState<{ applicationId: string; label: string } | null>(null);
  // How new cards tidy the role from the emails (same options as the add form).
  const [trimSetting, setTrimSetting] = useLocalSetting("tracker.gmail.trims", trimsToString(DEFAULT_TRIMS));
  const trims = trimsFromString(trimSetting);
  const toggleTrim = (key: keyof RoleTrimOptions) => setTrimSetting(trimsToString({ ...trims, [key]: !trims[key] }));

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
    const result = await tracker.applyEmailJob(payload);
    if ("error" in result) return result.error;
    setMessage(null);
    setLast({ applicationId: result.applicationId, label });
    return null;
  }

  // Undo for the card just accepted, while it's still the newest change on
  // its row (the same check the database makes).
  const lastApp = last ? applications.find((a) => a.id === last.applicationId) : undefined;
  const lastTrail = lastApp ? emailTrail(lastApp, gmail.emails, gmail.accepts) : null;

  async function undoLast() {
    if (!last || !lastTrail?.accept) return;
    const what = lastTrail.accept.created_application
      ? `Delete ${last.label} and everything this card added? Its emails go back to review.`
      : `Revert what this card changed on ${last.label}? Its emails go back to review.`;
    if (!window.confirm(what)) return;
    const error = await tracker.undoEmailJob(lastTrail.accept.id);
    setLast(null);
    setMessage(error ? `Couldn't undo: ${error}` : `Undid the change to ${last.label}.`);
  }

  async function acceptReady() {
    const keys = ready.map((g) => g.key);
    if (!window.confirm(`Accept ${keys.length} card${keys.length === 1 ? "" : "s"} as suggested? Check them over first; each can be undone from its application afterwards.`)) return;
    setMessage(null);
    setLast(null);
    let done = 0;
    for (const key of keys) {
      setBulk({ done, total: keys.length });
      const g = latest.current.groups.find((x) => x.key === key);
      if (!g || !g.ready || g.nothingToDo) continue;
      const rowId = (gmailId: string) => latest.current.rowIdOf.get(gmailId)!;
      const result = await tracker.applyEmailJob(buildPayload(g, defaultTicks(g), rowId, g.target.type === "new" ? newAppDefaults(g, trims) : undefined));
      if ("error" in result) {
        setMessage(`Stopped after ${done}: ${result.error}`);
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
        <span>Roles on new applications:</span>
        {(Object.keys(TRIM_LABELS) as (keyof RoleTrimOptions)[]).map((key) => (
          <label key={key} className="flex items-center gap-1">
            <input type="checkbox" checked={trims[key]} onChange={() => toggleTrim(key)} />
            {TRIM_LABELS[key]}
          </label>
        ))}
      </div>
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
      {last && lastTrail && (
        <p className="flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Saved {last.label}.
          {lastTrail.undoable && (
            <button type="button" className="underline" onClick={undoLast}>
              Undo
            </button>
          )}
          <button type="button" className="ml-auto text-xs underline opacity-70" onClick={() => setLast(null)}>
            Hide
          </button>
        </p>
      )}

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          {review.groups.length === 0 ? "All caught up: nothing from Gmail is waiting for review." : "Nothing here."}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.slice(0, shown).map((g) => (
            <EmailJobCard
              key={g.key}
              group={g}
              applications={applications}
              assessments={assessments}
              statusChanges={statusChanges}
              trims={trims}
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
