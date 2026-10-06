"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonCls, kindLabel, primaryButtonCls, todayISO } from "@/lib/tracker/format";
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

const headingCls = "text-xs font-semibold uppercase tracking-wide text-neutral-500";
const rowCls =
  "block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800";

// What needs you right now. Opens on its own the first time you visit each
// day and stays open until "Done for now"; after that it's a one-line summary
// you can reopen. When nothing needs you it is only that line.
export default function TodayCard({ brief, now, onScan, onOpenAssessment, onReviewEmails }: Props) {
  const [dismissedDay, setDismissedDay] = useLocalSetting("tracker.today.dismissed", "");
  // null: follow the daily rule; otherwise the user's last choice this visit.
  const [pinned, setPinned] = useState<boolean | null>(null);
  const expanded = !brief.empty && (pinned ?? showsToday(dismissedDay, now));

  const scanLine = (
    <span className={brief.scan.stale ? "text-amber-700 dark:text-amber-400" : undefined}>{brief.scan.text}</span>
  );

  if (!expanded) {
    return (
      <section
        aria-label="Today"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-neutral-200 bg-surface px-3 py-2 text-sm dark:border-neutral-800"
      >
        <h2 className="font-semibold">Today</h2>
        <span className="min-w-0 flex-1 text-neutral-600 dark:text-neutral-400">
          {brief.summary} · <span className="text-xs">{scanLine}</span>
        </span>
        {!brief.empty && (
          <button type="button" onClick={() => setPinned(true)} className="text-xs text-neutral-500 underline">
            Show
          </button>
        )}
        <button type="button" onClick={onScan} className={buttonCls}>
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
    <section aria-label="Today" className="space-y-3 rounded-lg border border-neutral-200 bg-surface p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold">Today</h2>
          <span className="text-xs text-neutral-500">
            {new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onScan} className={primaryButtonCls}>
            Scan Gmail
          </button>
          <button type="button" onClick={done} className={buttonCls}>
            Done for now
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {brief.assessments.length > 0 && (
          <div className="space-y-1">
            <h3 className={headingCls}>Do first</h3>
            <ul>
              {brief.assessments.map(({ assessment: a, application, reason }) => (
                <li key={a.id}>
                  <button type="button" onClick={() => onOpenAssessment(a.id)} className={rowCls}>
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
              <p className="px-2 text-xs text-neutral-500">and {brief.moreAssessments} more in Assessments &amp; interviews</p>
            )}
          </div>
        )}

        {brief.steps.length > 0 && (
          <div className="space-y-1">
            <h3 className={headingCls}>People</h3>
            <ul>
              {brief.steps.map((s) => (
                <li key={`${s.kind}-${s.moveId}`}>
                  <Link href="/tracker/arbitrage" className={rowCls}>
                    <div className="truncate font-medium">{s.text}</div>
                    {s.detail && <div className="truncate text-xs text-neutral-500">{s.detail}</div>}
                  </Link>
                </li>
              ))}
            </ul>
            {brief.moreSteps > 0 && (
              <p className="px-2 text-xs text-neutral-500">
                and {brief.moreSteps} more on{" "}
                <Link href="/tracker/arbitrage" className="underline">
                  Arbitrage
                </Link>
              </p>
            )}
          </div>
        )}

        {(brief.pendingEmails > 0 || brief.newPostings > 0) && (
          <div className="space-y-1">
            <h3 className={headingCls}>Inbox</h3>
            <ul>
              {brief.pendingEmails > 0 && (
                <li>
                  <button type="button" onClick={onReviewEmails} className={rowCls}>
                    <span className="font-medium">{plural(brief.pendingEmails, "email")} to review</span>
                    <span className="block text-xs text-neutral-500">Suggested tracker updates from Gmail</span>
                  </button>
                </li>
              )}
              {brief.newPostings > 0 && (
                <li>
                  <Link href="/tracker/postings" className={rowCls}>
                    <span className="font-medium">{plural(brief.newPostings, "new posting")}</span>
                    <span className="block text-xs text-neutral-500">From Jobright alerts you haven&rsquo;t looked at</span>
                  </Link>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      <p className="text-xs text-neutral-500">{scanLine}</p>
    </section>
  );
}
