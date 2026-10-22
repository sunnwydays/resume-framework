"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Chip from "@/components/tracker/Chip";
import DismissedEmails from "@/components/tracker/email/DismissedEmails";
import ReasonChips from "@/components/tracker/feedback/ReasonChips";
import EmailJobCard from "@/components/tracker/email/EmailJobCard";
import type { JobGroup } from "@/lib/tracker/email/group";
import { muteValue } from "@/lib/tracker/email/mute";
import { EMAIL_DISMISS_REASONS, emailAcceptFeedback, emailDismissFeedback, emailMuteFeedback } from "@/lib/tracker/feedback/email";
import { markFeedbackUndone, recordFeedback } from "@/lib/tracker/feedback/client";
import type { FeedbackInsert } from "@/lib/tracker/feedback/events";
import { buildPayload, defaultTicks, newAppDefaults, type EmailJobPayload } from "@/lib/tracker/email/payload";
import {
  category,
  countByCategory,
  countByStatus,
  dismissedEmails,
  emailStatus,
  REVIEW_FILTERS,
  splitByAction,
  STATUS_FILTERS,
  type Review,
  type ReviewFilter,
  type StatusFilter,
} from "@/lib/tracker/email/review";
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
const bannerCls =
  "flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 shadow-lg ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800";

// The "Gmail Updates" tab: one card per job, newest activity first.
export default function EmailReview({ tracker, review }: Props) {
  const { applications, assessments, statusChanges, gmail } = tracker;
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [shown, setShown] = useState(PAGE);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showMutes, setShowMutes] = useState(false);
  const [last, setLast] = useState<{ applicationId: string; label: string; feedbackId?: string | null } | null>(null);
  // The latest dismiss, for its "why?" chips.
  const [dismissed, setDismissed] = useState<{ count: number; ids: string[]; bulk: boolean; feedbackId?: string | null } | null>(null);
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
  // Each row's counts hold the other row's filter, so a chip says what it would show.
  const byStatus = review.groups.filter((g) => statusFilter === "all" || emailStatus(g) === statusFilter);
  const byCategory = review.groups.filter((g) => filter === "all" || category(g) === filter);
  const counts = countByCategory(byStatus);
  const statusCounts = countByStatus(byCategory);
  const split = splitByAction(byCategory.filter((g) => statusFilter === "all" || emailStatus(g) === statusFilter));
  const visible = [...split.action, ...split.nothing];
  const ready = review.groups.filter((g) => g.ready && !g.nothingToDo);
  const nothing = review.groups.filter((g) => category(g) === "nothing");

  async function accept(payload: EmailJobPayload, label: string, feedback: FeedbackInsert): Promise<string | null> {
    const result = await tracker.applyEmailJob(payload);
    if ("error" in result) return result.error;
    setMessage(null);
    setDismissed(null);
    setLast({ applicationId: result.applicationId, label });
    const feedbackId = await recordFeedback(feedback);
    setLast((cur) => (cur && cur.applicationId === result.applicationId ? { ...cur, feedbackId } : cur));
    return null;
  }

  // Dismisses cards' emails and records it, then offers Undo (and the reason
  // chips for a single card; one reason can't cover a bulk dismiss).
  async function dismiss(groups: JobGroup[], bulk: boolean) {
    const ids = groups.flatMap((g) => g.emails.map((e) => rowIdOf(e.facts.gmailId)));
    tracker.dismissEmails(ids);
    setLast(null);
    setDismissed({ count: groups.length, ids, bulk });
    const feedbackId = await recordFeedback(emailDismissFeedback(groups, bulk));
    setDismissed((cur) => (cur && cur.ids === ids ? { ...cur, feedbackId } : cur));
  }

  function undoDismiss() {
    if (!dismissed) return;
    tracker.restoreEmails(dismissed.ids);
    markFeedbackUndone(dismissed.feedbackId);
    setDismissed(null);
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
    if (!error) markFeedbackUndone(last.feedbackId);
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
      const defaults = newAppDefaults(g, trims);
      const ticks = defaultTicks(g);
      const payload = buildPayload(g, ticks, rowId, g.target.type === "new" ? defaults : undefined);
      const result = await tracker.applyEmailJob(payload);
      if ("error" in result) {
        setMessage(`Stopped after ${done}: ${result.error}`);
        setBulk(null);
        return;
      }
      recordFeedback(emailAcceptFeedback({ group: g, card: g, defaultTicks: ticks, ticks, defaults, inputs: defaults, payload, bulk: true }));
      done++;
      // Let the reload render, so the next card is re-matched against it.
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    }
    setBulk(null);
    setMessage(`Accepted ${done} card${done === 1 ? "" : "s"}.`);
  }

  function dismissNothing() {
    dismiss(nothing, true);
  }

  function dismissAll() {
    if (!window.confirm(`Dismiss ${visible.length} card${visible.length === 1 ? "" : "s"}? Their emails won't come back on later scans.`)) return;
    dismiss(visible, true);
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
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(STATUS_FILTERS) as StatusFilter[]).map((f) => (
          <Chip
            key={f}
            active={statusFilter === f}
            onClick={() => {
              setStatusFilter(f);
              setShown(PAGE);
            }}
            label={STATUS_FILTERS[f]}
            count={statusCounts[f]}
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
          {visible.length > 0 && (
            <button type="button" className={buttonCls} onClick={dismissAll} disabled={bulk !== null}>
              Dismiss all {visible.length}
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
        <p className="py-8 text-center text-sm text-neutral-500">
          {review.groups.length === 0 ? "All caught up: nothing from Gmail is waiting for review." : "Nothing here."}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.slice(0, shown).map((g, i) => (
            <Fragment key={g.key}>
              {i === split.action.length && i > 0 && (
                <div className="flex items-center gap-3 pt-3 text-xs font-medium text-neutral-500">
                  <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                  {split.nothing.length} already reflected in the tracker
                  <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                </div>
              )}
              <EmailJobCard
                group={g}
                applications={applications}
                assessments={assessments}
                statusChanges={statusChanges}
                trims={trims}
                rowIdOf={rowIdOf}
                onAccept={accept}
                onDismiss={(group) => dismiss([group], false)}
                onMute={(kind, value, group) => {
                  tracker.addMute(kind, muteValue(kind, value));
                  recordFeedback(emailMuteFeedback(kind, value, group));
                }}
              />
            </Fragment>
          ))}
          {visible.length > shown && (
            <button type="button" className={buttonCls} onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, visible.length - shown)} more of {visible.length - shown}
            </button>
          )}
        </div>
      )}
      <DismissedEmails emails={dismissedEmails(gmail.emails)} onRestore={tracker.restoreEmails} />

      {/* Last in the page and sticky to the bottom of the screen, so they're in
          reach wherever in a long list the card was accepted or dismissed. One
          wrapper so the two don't pile on top of each other. */}
      {((last && lastTrail) || dismissed) && (
        <div className="sticky bottom-4 z-30 mx-4 space-y-2">
          {last && lastTrail && (
            <p className={bannerCls}>
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
          {dismissed && (
            <p className={bannerCls}>
              Dismissed {dismissed.count} card{dismissed.count === 1 ? "" : "s"}.
              <button type="button" className="underline" onClick={undoDismiss}>
                Undo
              </button>
              {!dismissed.bulk && (
                <ReasonChips key={dismissed.feedbackId ?? "pending"} reasons={EMAIL_DISMISS_REASONS} feedbackId={dismissed.feedbackId} />
              )}
              <button type="button" className="ml-auto text-xs underline opacity-70" onClick={() => setDismissed(null)}>
                Hide
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
