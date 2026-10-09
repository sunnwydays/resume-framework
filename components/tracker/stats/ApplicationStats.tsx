"use client";

import { useMemo } from "react";
import {
  BarList,
  CalendarHeatmap,
  ChartCard,
  FactGrid,
  StatTile,
  WeeklyColumns,
} from "@/components/tracker/stats/charts";
import StatsPanel from "@/components/tracker/stats/StatsPanel";
import type { Application, Assessment, StatusChange } from "@/lib/tracker/format";
import { applicationStats, pct, plural } from "@/lib/tracker/stats";

interface Props {
  applications: Application[];
  assessmentsByApp: Map<string, Assessment[]>;
  changesByApp: Map<string, StatusChange[]>;
  now: number;
  // Shown beside the title so the numbers' scope is never a mystery.
  scope: string | null;
}

export default function ApplicationStats({ applications, assessmentsByApp, changesByApp, now, scope }: Props) {
  const s = useMemo(
    () => applicationStats(applications, assessmentsByApp, changesByApp, now),
    [applications, assessmentsByApp, changesByApp, now]
  );

  return (
    <StatsPanel
      id="applications"
      title={scope ? `Stats · ${scope}` : "Stats"}
      summary={`${plural(s.total, "application")}, ${pct(s.heardBack, s.total)} heard back`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Applied" value={s.total} sub={`${s.thisWeek} this week · ${s.lastWeek} last week`} />
        <StatTile label="Est. time spent" value={s.timeSpent.value} sub={s.timeSpent.detail} />
        <StatTile label="Heard back" value={pct(s.heardBack, s.total)} sub={`${s.heardBack} of ${s.total}`} />
        <StatTile label="Got an OA or beyond" value={pct(s.progressed, s.total)} sub={`${s.progressed} of ${s.total}`} />
        <StatTile label="Interviews" value={s.interviewed} sub={pct(s.interviewed, s.total)} />
        <StatTile label="Offers" value={s.offers} sub={`streak: ${plural(s.currentStreak, "day")}`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Applications per day" note="Darker means more applications that day.">
          <CalendarHeatmap daily={s.daily} now={now} unit="application" />
        </ChartCard>
        <ChartCard title="Applications per week">
          <WeeklyColumns weeks={s.weekly} unit="application" />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="How far they got" note="Furthest stage reached, even if rejected later.">
          <BarList
            max={s.total}
            items={s.funnel.map((f) => ({
              label: f.label,
              value: f.count,
              note: pct(f.count, s.total),
              tip: `${f.label}: ${f.count} of ${s.total}`,
            }))}
          />
        </ChartCard>
        <ChartCard title="By role type" note="Count, then % that got an OA or beyond.">
          <BarList
            items={s.byType.map((t) => ({
              label: t.label,
              value: t.count,
              note: pct(t.progressed, t.count),
              tip: `${t.label}: ${plural(t.count, "application")}, ${t.heardBack} heard back, ${t.progressed} got an OA or beyond`,
            }))}
          />
        </ChartCard>
      </div>

      <ChartCard title="Fun facts">
        <FactGrid facts={s.facts} />
      </ChartCard>
    </StatsPanel>
  );
}
