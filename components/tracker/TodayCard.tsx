"use client";

import Link from "next/link";
import { useState } from "react";
import { kindLabel, todayISO } from "@/lib/tracker/format";
import { plural } from "@/lib/tracker/stats";
import { showsToday, type TodayBrief } from "@/lib/tracker/today";
import { useLocalSetting } from "@/lib/tracker/useLocalSetting";

interface Props {
  brief: TodayBrief;
  now: number;
  onScan: () => void;
  onOpenAssessment: (id: string) => void;
  onReviewEmails: () => void;
}

// Styled as a notification so it stands apart from the neutral panels around
// it: a muted purple (the `today-*` tokens in globals.css), rounder corners, a
// bell, and white tiles inside. With nothing to do it drops the colour.
const headingCls = "text-xs font-semibold uppercase tracking-wide text-today-ink-soft";
const softTextCls = "text-xs text-today-ink-soft";
const tileCls =
  "block w-full rounded-xl bg-white/80 px-3 py-2 text-left text-sm shadow-sm ring-1 ring-today-ring transition hover:bg-white hover:ring-today-ring-hover dark:bg-white/5 dark:hover:bg-white/10";
const scanBtnCls =
  "rounded-full bg-today-accent px-4 py-1.5 text-sm font-medium text-today-on-accent shadow-sm transition-colors hover:bg-today-accent-hover";
const quietBtnCls = "rounded-full px-3 py-1.5 text-sm font-medium text-today-ink transition-colors hover:bg-today-ring";
const neutralBtnCls =
  "rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800";

function Bell({ active }: { active: boolean }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
        active ? "bg-today-accent text-today-on-accent" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    </span>
  );
}

// What needs you right now. Opens on its own the first time you visit each
// day and stays open until "Done for now"; after that it's a one-line summary
// you can reopen. When nothing needs you it is only that line.
export default function TodayCard({ brief, now, onScan, onOpenAssessment, onReviewEmails }: Props) {
  const [dismissedDay, setDismissedDay] = useLocalSetting("tracker.today.dismissed", "");
  // null: follow the daily rule; otherwise the user's last choice this visit.
  const [pinned, setPinned] = useState<boolean | null>(null);
  const expanded = !brief.empty && (pinned ?? showsToday(dismissedDay, now));

  const scanLine = (
    <span className={brief.scan.stale ? "font-medium text-amber-700 dark:text-amber-400" : undefined}>{brief.scan.text}</span>
  );

  if (!expanded) {
    return (
      <section
        aria-label="Today"
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-full border py-2 pl-2.5 pr-3 text-sm ${
          brief.empty ? "border-neutral-200 bg-surface dark:border-neutral-800" : "border-today-border bg-today-bg shadow-sm"
        }`}
      >
        <Bell active={!brief.empty} />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">Today</span>
          <span className="text-neutral-600 dark:text-neutral-400">
            {" · "}
            {brief.summary} · <span className="text-xs">{scanLine}</span>
          </span>
        </span>
        {!brief.empty && (
          <button type="button" onClick={() => setPinned(true)} className={quietBtnCls}>
            Show
          </button>
        )}
        <button type="button" onClick={onScan} className={brief.empty ? neutralBtnCls : scanBtnCls}>
          Scan Gmail
        </button>
      </section>
    );
  }

  function done() {
    setDismissedDay(todayISO(now));
    setPinned(false);
  }

  return (
    // A flex column with gap, not space-y: space-y would put a bottom margin on
    // the absolutely-positioned bar and stop it short of the bottom edge.
    <section
      aria-label="Today"
      className="relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-today-border bg-today-bg py-4 pl-6 pr-4 shadow-lg shadow-today-accent/10 dark:shadow-none sm:pr-5"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-2 bg-today-accent" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bell active />
          <div>
            <h2 className="text-lg font-semibold leading-tight text-today-ink">Today</h2>
            <p className={softTextCls}>
              {new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={done} className={quietBtnCls}>
            Done for now
          </button>
          <button type="button" onClick={onScan} className={scanBtnCls}>
            Scan Gmail
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {brief.assessments.length > 0 && (
          <div className="space-y-2">
            <h3 className={headingCls}>Do first</h3>
            <ul className="space-y-2">
              {brief.assessments.map(({ assessment: a, application, reason }) => (
                <li key={a.id}>
                  <button type="button" onClick={() => onOpenAssessment(a.id)} className={tileCls}>
                    <div className="truncate font-medium">
                      {a.important && <span className="text-amber-500">★ </span>}
                      {application?.company ?? "?"} · {kindLabel(a.kind)}
                    </div>
                    <div className="truncate text-xs text-neutral-500">{reason}</div>
                  </button>
                </li>
              ))}
            </ul>
            {brief.moreAssessments > 0 && (
              <p className={`px-1 ${softTextCls}`}>and {brief.moreAssessments} more in Assessments &amp; interviews</p>
            )}
          </div>
        )}

        {brief.steps.length > 0 && (
          <div className="space-y-2">
            <h3 className={headingCls}>People</h3>
            <ul className="space-y-2">
              {brief.steps.map((s) => (
                <li key={`${s.kind}-${s.moveId}`}>
                  <Link href="/tracker/arbitrage" className={tileCls}>
                    <div className="truncate font-medium">{s.text}</div>
                    {s.detail && <div className="truncate text-xs text-neutral-500">{s.detail}</div>}
                  </Link>
                </li>
              ))}
            </ul>
            {brief.moreSteps > 0 && (
              <p className={`px-1 ${softTextCls}`}>
                and {brief.moreSteps} more on{" "}
                <Link href="/tracker/arbitrage" className="underline">
                  Arbitrage
                </Link>
              </p>
            )}
          </div>
        )}

        {(brief.pendingEmails > 0 || brief.newPostings > 0) && (
          <div className="space-y-2">
            <h3 className={headingCls}>Inbox</h3>
            <ul className="space-y-2">
              {brief.pendingEmails > 0 && (
                <li>
                  <button type="button" onClick={onReviewEmails} className={tileCls}>
                    <span className="font-medium">{plural(brief.pendingEmails, "email")} to review</span>
                    <span className="block text-xs text-neutral-500">Suggested tracker updates from Gmail</span>
                  </button>
                </li>
              )}
              {brief.newPostings > 0 && (
                <li>
                  <Link href="/tracker/postings" className={tileCls}>
                    <span className="font-medium">{plural(brief.newPostings, "new posting")}</span>
                    <span className="block text-xs text-neutral-500">From Jobright alerts you haven&rsquo;t looked at</span>
                  </Link>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      <p className={softTextCls}>{scanLine}</p>
    </section>
  );
}
