import {
  MOVE_CHANNELS,
  MOVE_STAGES,
  isOutreach,
  stageIndex,
  todayISO,
  type Application,
  type Assessment,
  type Move,
  type MoveChannel,
  type MoveStage,
  type StatusChange,
} from "@/lib/tracker/format";
import { STAGES, dayOf, furthestStage, heardBack, pct, weekStart } from "@/lib/tracker/stats";

// Pure numbers for the Arbitrage page: the outreach funnel, reward per hour
// by channel against a cold-applying baseline, and per-template reply rates.

// Minimum moves before the page claims "N× your cold-apply rate".
export const MIN_MOVES_FOR_MULTIPLIER = 3;
export const DEFAULT_MINUTES_PER_APP = 20;

// What the time presets default to when a move is logged, per channel.
export const DEFAULT_MOVE_MINUTES: Record<MoveChannel, number> = {
  linkedin: 10,
  email: 15,
  warm: 10,
  project: 60,
  community: 60,
  other: 10,
};

// The application side of the tracker, keyed for lookups.
export interface AppContext {
  appsById: Map<string, Application>;
  assessmentsByApp: Map<string, Assessment[]>;
  changesByApp: Map<string, StatusChange[]>;
}

export const EMPTY_CONTEXT: AppContext = {
  appsById: new Map(),
  assessmentsByApp: new Map(),
  changesByApp: new Map(),
};

const appStageIndex = (s: string) => STAGES.indexOf(s as (typeof STAGES)[number]);

// The furthest a move got, counting what its linked application did: an OA
// means they moved you forward (positive), an interview round means
// interview, an offer means offer. Never lowers the stage the user set.
export function effectiveStage(move: Move, ctx: AppContext): MoveStage {
  let best = stageIndex(move.stage);
  const app = move.application_id ? ctx.appsById.get(move.application_id) : undefined;
  if (app) {
    const reached = appStageIndex(
      furthestStage(app, ctx.assessmentsByApp.get(app.id) ?? [], ctx.changesByApp.get(app.id) ?? [])
    );
    const lifted =
      reached >= appStageIndex("offer")
        ? stageIndex("offer")
        : reached >= appStageIndex("video_interview")
          ? stageIndex("interview")
          : reached >= appStageIndex("oa")
            ? stageIndex("positive")
            : 0;
    best = Math.max(best, lifted);
  }
  return MOVE_STAGES[best];
}

// The update for moving a move to `stage`. Moving up into a stage where
// they've just written back (replied, conversation, positive) makes it your
// turn; moving back to sent means you're waiting on them again.
export function stagePatch(move: Move, stage: MoveStage): Partial<Move> {
  const patch: Partial<Move> = { stage };
  if (stage === "sent") patch.waiting_on = "them";
  else if (stageIndex(stage) > stageIndex(move.stage) && stageIndex(stage) <= stageIndex("positive")) {
    patch.waiting_on = "me";
  }
  return patch;
}

const reached = (move: Move, ctx: AppContext, stage: MoveStage) =>
  stageIndex(effectiveStage(move, ctx)) >= stageIndex(stage);

// ---------- funnel ----------

export interface FunnelStep {
  stage: MoveStage;
  count: number;
  // Share of the previous step that made it here ("—" for the first step).
  stepRate: string;
}

// Outreach moves only (a project isn't a message sent). Each move counts at
// every stage up to the furthest it reached, closed ones included: closing a
// dead thread doesn't erase that they replied.
export function funnel(moves: Move[], ctx: AppContext = EMPTY_CONTEXT): FunnelStep[] {
  const outreach = moves.filter((m) => isOutreach(m.channel));
  const counts = MOVE_STAGES.map((s) => outreach.filter((m) => reached(m, ctx, s)).length);
  return MOVE_STAGES.map((stage, i) => ({
    stage,
    count: counts[i],
    stepRate: i === 0 ? "—" : pct(counts[i], counts[i - 1]),
  }));
}

// ---------- reward per hour ----------

export interface RateRow {
  moves: number;
  minutes: number;
  replies: number;
  conversations: number;
  positives: number;
}

export interface ChannelRate extends RateRow {
  channel: MoveChannel;
}

export interface ExchangeRates {
  channels: ChannelRate[];
  arbitrage: RateRow;
  // Applications not linked to any move, at a flat minutes-per-application.
  cold: RateRow;
  // Arbitrage vs. cold per hour, on positives when either side has any,
  // otherwise on replies. Null until there's enough to compare.
  multiplier: { basis: "positives" | "replies"; value: number } | null;
}

// Per hour, or null when no time was logged (a rate would be infinite).
export function perHour(n: number, minutes: number): number | null {
  return minutes > 0 ? n / (minutes / 60) : null;
}

function emptyRow(): RateRow {
  return { moves: 0, minutes: 0, replies: 0, conversations: 0, positives: 0 };
}

export function exchangeRates(
  moves: Move[],
  applications: Application[],
  ctx: AppContext,
  minutesPerApp = DEFAULT_MINUTES_PER_APP
): ExchangeRates {
  const byChannel = new Map<MoveChannel, RateRow>();
  const arbitrage = emptyRow();
  for (const m of moves) {
    const channel = (m.channel in MOVE_CHANNELS ? m.channel : "other") as MoveChannel;
    const row = byChannel.get(channel) ?? emptyRow();
    for (const r of [row, arbitrage]) {
      r.moves++;
      r.minutes += m.minutes;
      if (reached(m, ctx, "replied")) r.replies++;
      if (reached(m, ctx, "conversation")) r.conversations++;
      if (reached(m, ctx, "positive")) r.positives++;
    }
    byChannel.set(channel, row);
  }
  const channels = (Object.keys(MOVE_CHANNELS) as MoveChannel[])
    .filter((c) => byChannel.has(c))
    .map((channel) => ({ channel, ...byChannel.get(channel)! }));

  // An application a move led to is part of that move's return, not cold.
  const linked = new Set(moves.map((m) => m.application_id).filter(Boolean));
  const cold = emptyRow();
  for (const app of applications) {
    if (linked.has(app.id)) continue;
    const asmts = ctx.assessmentsByApp.get(app.id) ?? [];
    const changes = ctx.changesByApp.get(app.id) ?? [];
    cold.moves++;
    cold.minutes += Math.max(0, minutesPerApp);
    if (heardBack(app, asmts, changes)) cold.replies++;
    if (appStageIndex(furthestStage(app, asmts, changes)) >= appStageIndex("oa")) cold.positives++;
  }

  return { channels, arbitrage, cold, multiplier: multiplier(arbitrage, cold) };
}

function multiplier(arb: RateRow, cold: RateRow): ExchangeRates["multiplier"] {
  if (arb.moves < MIN_MOVES_FOR_MULTIPLIER || arb.minutes <= 0 || cold.minutes <= 0) return null;
  const basis = arb.positives > 0 || cold.positives > 0 ? "positives" : "replies";
  const a = perHour(arb[basis], arb.minutes)!;
  const c = perHour(cold[basis], cold.minutes)!;
  if (a === 0 || c === 0) return null;
  return { basis, value: a / c };
}

// "4.2×", "12×", "0.5×".
export function formatMultiplier(value: number): string {
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10}×`;
}

// "1.5/h", "0.25/h", "—".
export function formatRate(n: number, minutes: number): string {
  const r = perHour(n, minutes);
  if (r === null) return "—";
  return `${r >= 10 ? Math.round(r) : Math.round(r * 100) / 100}/h`;
}

// ---------- templates ----------

export interface TemplateStat {
  sent: number;
  replied: number;
  rate: string;
}

// Reply rate per template, from the stage the user recorded (outreach only).
export function templateStats(moves: Move[]): Map<string, TemplateStat> {
  const stats = new Map<string, TemplateStat>();
  for (const m of moves) {
    if (!m.template_key || !isOutreach(m.channel)) continue;
    const s = stats.get(m.template_key) ?? { sent: 0, replied: 0, rate: "—" };
    s.sent++;
    if (stageIndex(m.stage) >= stageIndex("replied")) s.replied++;
    stats.set(m.template_key, s);
  }
  for (const s of stats.values()) s.rate = pct(s.replied, s.sent);
  return stats;
}

// ---------- this week ----------

export interface WeekSummary {
  start: string; // Monday, YYYY-MM-DD
  sent: number;
  replies: number;
  // Time on moves started this week (time isn't dated per minute, so a long
  // project counts in the week it was logged).
  arbitrageMinutes: number;
  coldApps: number;
}

export function thisWeek(moves: Move[], applications: Application[], now: number): WeekSummary {
  const start = weekStart(todayISO(now));
  const since = (value: string | null) => value !== null && dayOf(value) >= start;
  const linked = new Set(moves.map((m) => m.application_id).filter(Boolean));
  return {
    start,
    sent: moves.filter((m) => isOutreach(m.channel) && since(m.created_at)).length,
    replies: moves.filter((m) => isOutreach(m.channel) && since(m.replied_at)).length,
    arbitrageMinutes: moves.filter((m) => since(m.created_at)).reduce((s, m) => s + m.minutes, 0),
    coldApps: applications.filter((a) => !linked.has(a.id) && since(a.applied_on)).length,
  };
}
