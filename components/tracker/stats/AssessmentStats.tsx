"use client";

import { useMemo } from "react";
import { BarList, ChartCard, FactGrid, StatTile } from "@/components/tracker/stats/charts";
import StatsPanel from "@/components/tracker/stats/StatsPanel";
import type { Application, Assessment, Question, StatusChange } from "@/lib/tracker/format";
import { assessmentStats, pct, plural } from "@/lib/tracker/stats";

interface Props {
  assessments: Assessment[];
  applicationsById: Map<string, Application>;
  assessmentsByApp: Map<string, Assessment[]>;
  changesByApp: Map<string, StatusChange[]>;
  questionsByAssessment: Map<string, Question[]>;
  now: number;
  scope: string | null;
}

// Pass or miss comes from the application (see assessmentResult); pass rate
// counts only the assessments that have one, so undecided ones don't drag it down.
function passNote(t: { passed: number; failed: number }): string | undefined {
  const decided = t.passed + t.failed;
  return decided ? `${pct(t.passed, decided)} passed` : undefined;
}

function passTip(label: string, t: { count: number; passed: number; failed: number }): string {
  return `${label}: ${t.count} total, ${t.passed} passed, ${t.failed} missed`;
}

export default function AssessmentStats({
  assessments,
  applicationsById,
  assessmentsByApp,
  changesByApp,
  questionsByAssessment,
  now,
  scope,
}: Props) {
  const s = useMemo(
    () => assessmentStats(assessments, applicationsById, assessmentsByApp, changesByApp, questionsByAssessment, now),
    [assessments, applicationsById, assessmentsByApp, changesByApp, questionsByAssessment, now]
  );
  const decided = s.passed + s.failed;
  const rated = s.byDifficulty.filter((d) => d.count > 0);

  return (
    <StatsPanel
      id="assessments"
      title={scope ? `Stats · ${scope}` : "Stats"}
      summary={`${plural(s.total, "assessment")}, ${s.completed} done`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Total" value={s.total} sub={`${s.completed} completed`} />
        <StatTile label="Pending" value={s.total - s.completed} />
        <StatTile label="Due this week" value={s.dueThisWeek} />
        <StatTile label="Overdue" value={s.overdue} sub={s.overdue ? "still pending" : undefined} />
        <StatTile label="Pass rate" value={pct(s.passed, decided)} sub={decided ? `${s.passed} of ${decided} with a result` : "no results yet"} />
        <StatTile label="Waiting on results" value={Math.max(0, s.completed - decided)} sub="completed, application hasn't moved" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard title="By type" note="Count, then pass rate.">
          <BarList
            items={s.byKind.map((k) => ({
              label: k.label,
              value: k.count,
              note: passNote(k),
              tip: passTip(k.label, k),
            }))}
          />
        </ChartCard>
        <ChartCard title="By difficulty" note={rated.length ? "Count, then pass rate." : "Rate one to see this."}>
          <BarList
            items={s.byDifficulty.map((d) => ({
              label: `${d.difficulty} / 5`,
              value: d.count,
              note: passNote(d),
              tip: passTip(`Difficulty ${d.difficulty}`, d),
            }))}
          />
        </ChartCard>
        <ChartCard title="By role type" note="Of the application they belong to.">
          <BarList
            items={s.byType.map((t) => ({
              label: t.label,
              value: t.count,
              note: passNote(t),
              tip: passTip(t.label, t),
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
