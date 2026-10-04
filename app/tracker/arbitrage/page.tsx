"use client";

import { useMemo, useState } from "react";
import ArbitrageHero from "@/components/tracker/arbitrage/ArbitrageHero";
import ExchangeRate from "@/components/tracker/arbitrage/ExchangeRate";
import Funnel from "@/components/tracker/arbitrage/Funnel";
import MovesList from "@/components/tracker/arbitrage/MovesList";
import NextSteps from "@/components/tracker/arbitrage/NextSteps";
import Playbook from "@/components/tracker/arbitrage/Playbook";
import Workshop, { type WorkshopSeed } from "@/components/tracker/arbitrage/Workshop";
import {
  DEFAULT_MINUTES_PER_APP,
  exchangeRates,
  funnel,
  templateStats,
  thisWeek,
  type AppContext,
} from "@/lib/tracker/arbitrage";
import type { Assessment, Move, MoveChannel, StatusChange } from "@/lib/tracker/format";
import { DEFAULT_WEEKLY_TARGET, nextSteps } from "@/lib/tracker/nextSteps";
import { groupBy } from "@/lib/tracker/stats";
import { BUILT_IN_TEMPLATES, splitTarget } from "@/lib/tracker/templates";
import { useLocalNumber } from "@/lib/tracker/useLocalSetting";
import { useMoves } from "@/lib/tracker/useMoves";
import { useNow, useTracker } from "@/lib/tracker/useTracker";

const FOLLOW_UP_TEMPLATE = "builtin:follow-up";

export default function ArbitragePage() {
  const store = useMoves();
  const tracker = useTracker();
  const now = useNow();
  const { moves, templates } = store;
  const { applications, assessments, statusChanges } = tracker;

  const [minutesPerApp, setMinutesPerApp] = useLocalNumber("tracker.arbitrage.minutesPerApp", DEFAULT_MINUTES_PER_APP, 1, 600);
  const [weeklyTarget, setWeeklyTarget] = useLocalNumber("tracker.arbitrage.weeklyTarget", DEFAULT_WEEKLY_TARGET, 1, 200);
  const [seed, setSeed] = useState<{ n: number; value: WorkshopSeed }>({ n: 0, value: {} });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quickLogChannel, setQuickLogChannel] = useState<MoveChannel>("project");

  const ctx = useMemo<AppContext>(
    () => ({
      appsById: new Map(applications.map((a) => [a.id, a])),
      assessmentsByApp: groupBy<Assessment>(assessments, (a) => a.application_id),
      changesByApp: groupBy<StatusChange>(statusChanges, (c) => c.application_id),
    }),
    [applications, assessments, statusChanges]
  );
  const movesById = useMemo(() => new Map(moves.map((m) => [m.id, m])), [moves]);
  const stats = useMemo(() => templateStats(moves), [moves]);
  const templateNames = useMemo(
    () => new Map([...BUILT_IN_TEMPLATES, ...templates.map((t) => ({ key: t.id, name: t.name }))].map((t) => [t.key, t.name])),
    [templates]
  );
  const steps = useMemo(
    () => nextSteps(moves, applications, now, { weeklyTarget, minutesPerApp, templateNames }),
    [moves, applications, now, weeklyTarget, minutesPerApp, templateNames]
  );
  const funnelSteps = useMemo(() => funnel(moves, ctx), [moves, ctx]);
  const week = useMemo(() => thisWeek(moves, applications, now), [moves, applications, now]);
  const rates = useMemo(() => exchangeRates(moves, applications, ctx, minutesPerApp), [moves, applications, ctx, minutesPerApp]);

  const scrollTo = (id: string) =>
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));

  function openWorkshop(value: WorkshopSeed) {
    setSeed((s) => ({ n: s.n + 1, value }));
    scrollTo("workshop");
  }

  function draftFollowUp(move: Move) {
    const { name, company } = splitTarget(move.target);
    openWorkshop({ templateKey: FOLLOW_UP_TEMPLATE, fields: { name, company }, move });
  }

  function showMove(id: string) {
    setExpandedId(id);
    scrollTo(`move-${id}`);
  }

  const loading = store.loading || tracker.loading;
  const error = store.error ?? tracker.error;

  return (
    <div className="space-y-6">
      <ArbitrageHero />

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              store.clearError();
              tracker.clearError();
            }}
            className="underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          <Funnel steps={funnelSteps} week={week} weeklyTarget={weeklyTarget} onWeeklyTarget={setWeeklyTarget} />

          <NextSteps
            steps={steps}
            movesById={movesById}
            onShowMove={showMove}
            onDraftFollowUp={draftFollowUp}
            onReplied={store.followUp}
            onClose={(m) => store.updateMove(m.id, { closed: true })}
            onOpenTemplate={(key) => openWorkshop({ templateKey: key })}
            onLogProject={() => {
              setQuickLogChannel("project");
              scrollTo("quick-log");
            }}
            onOpenWorkshop={() => openWorkshop({})}
          />

          <Workshop key={seed.n} seed={seed.value} templates={templates} stats={stats} store={store} />

          <MovesList
            moves={moves}
            applications={applications}
            ctx={ctx}
            store={store}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
            onDraftFollowUp={draftFollowUp}
            quickLogChannel={quickLogChannel}
          />

          <ExchangeRate rates={rates} minutesPerApp={minutesPerApp} onMinutesPerApp={setMinutesPerApp} />
        </>
      )}

      <Playbook />
    </div>
  );
}
