"use client";

import type { FunnelStep, WeekSummary } from "@/lib/tracker/arbitrage";
import { MOVE_STAGE_META } from "@/lib/tracker/format";

interface Props {
  steps: FunnelStep[];
  week: WeekSummary;
  weeklyTarget: number;
  onWeeklyTarget: (n: number) => void;
}

// Outreach funnel: how many messages went out and how far they got. Bars are
// scaled to the number sent; the small % is the share of the previous step.
export default function Funnel({ steps, week, weeklyTarget, onWeeklyTarget }: Props) {
  const sent = steps[0]?.count ?? 0;
  const progress = weeklyTarget > 0 ? Math.min(1, week.sent / weeklyTarget) : 1;

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 bg-surface p-4 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">Your outreach</h2>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {steps.map((s, i) => (
          <li
            key={s.stage}
            title={MOVE_STAGE_META[s.stage].hint}
            className="rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-neutral-500">{MOVE_STAGE_META[s.stage].label}</span>
              {i > 0 && <span className="text-xs tabular-nums text-neutral-400">{s.stepRate}</span>}
            </div>
            <p className="text-2xl font-semibold tabular-nums">{s.count}</p>
            <div className="mt-1 h-1 rounded-full bg-(--viz-grid)">
              <div
                className="h-1 rounded-full bg-(--viz-1)"
                style={{ width: `${sent ? Math.round((s.count / sent) * 100) : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span>
          This week: <span className="font-medium tabular-nums">{week.sent}</span> sent ·{" "}
          <span className="font-medium tabular-nums">{week.replies}</span>{" "}
          {week.replies === 1 ? "reply" : "replies"}
        </span>
        <div className="flex min-w-40 flex-1 items-center gap-2">
          <div
            className="h-2 flex-1 rounded-full bg-(--viz-grid)"
            role="progressbar"
            aria-valuenow={week.sent}
            aria-valuemax={weeklyTarget}
            aria-label="Messages sent this week"
          >
            <div
              className={`h-2 rounded-full ${progress >= 1 ? "bg-emerald-500" : "bg-(--viz-1)"}`}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <label className="flex items-center gap-1 text-xs text-neutral-500">
            target
            <input
              type="number"
              min={1}
              max={200}
              value={weeklyTarget}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= 200) onWeeklyTarget(n);
              }}
              className="w-14 rounded border border-neutral-300 bg-surface px-1.5 py-0.5 text-right tabular-nums dark:border-neutral-700"
            />
            /week
          </label>
        </div>
      </div>
    </section>
  );
}
