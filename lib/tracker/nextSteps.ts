import { templateStats, thisWeek } from "@/lib/tracker/arbitrage";
import { formatHours, isOutreach, stageIndex, todayISO, type Application, type Move } from "@/lib/tracker/format";
import { dayOf, daysBetween, plural } from "@/lib/tracker/stats";

// What to do next on the Arbitrage page: plain rules over the moves, no AI.
// Ordered by how much each one is worth: a person waiting on you first,
// then threads about to go cold, then the habits that feed the funnel.

export const FOLLOW_UP_DAYS = 3; // no reply this long after a touch: follow up
export const MAX_FOLLOW_UPS = 2; // after this many unanswered, let it go
export const STALE_DAYS = 7; // a conversation quiet this long: nudge it
export const BUILD_DAYS = 14; // no project logged this long: start one
export const TEMPLATE_MIN_SENDS = 10; // judge a template only after this many
export const TEMPLATE_MIN_REPLY_RATE = 0.1;
export const DEFAULT_WEEKLY_TARGET = 10;

export type NextStepKind =
  | "start"
  | "reply"
  | "follow_up"
  | "nudge"
  | "close"
  | "referral"
  | "rework_template"
  | "send_more"
  | "build"
  | "rebalance";

export interface NextStep {
  kind: NextStepKind;
  text: string;
  detail?: string;
  moveId?: string;
  templateKey?: string;
}

export interface NextStepOptions {
  weeklyTarget?: number;
  minutesPerApp?: number;
  templateNames?: Map<string, string>;
}

const ago = (n: number) => (n === 0 ? "today" : `${plural(n, "day")} ago`);

export function nextSteps(
  moves: Move[],
  applications: Application[],
  now: number,
  { weeklyTarget = DEFAULT_WEEKLY_TARGET, minutesPerApp = 20, templateNames = new Map() }: NextStepOptions = {}
): NextStep[] {
  const today = todayISO(now);
  const idle = (m: Move) => daysBetween(dayOf(m.last_touch_at), today);
  // Oldest first within each rule: the one that's waited longest.
  const open = moves.filter((m) => !m.closed).sort((a, b) => a.last_touch_at.localeCompare(b.last_touch_at));
  const steps: NextStep[] = [];

  if (moves.length === 0) {
    steps.push({
      kind: "start",
      text: "Log your first moves: message 3 people at companies you'd love to work at.",
      detail: "Use the coffee-chat template below. Ask for a 15-minute chat, not a job.",
    });
  }

  for (const m of open) {
    if (m.waiting_on === "me") {
      steps.push({ kind: "reply", text: `Reply to ${m.target}`, detail: `They wrote back ${ago(idle(m))}.`, moveId: m.id });
    }
  }

  for (const m of open) {
    if (m.waiting_on !== "them" || !isOutreach(m.channel)) continue;
    const days = idle(m);
    if (m.stage === "sent") {
      if (days < FOLLOW_UP_DAYS) continue;
      steps.push(
        m.follow_ups < MAX_FOLLOW_UPS
          ? {
              kind: "follow_up",
              text: `Follow up with ${m.target}`,
              detail: `No reply since ${ago(days)}. Most replies come after a follow-up.`,
              moveId: m.id,
            }
          : {
              kind: "close",
              text: `Let ${m.target} go`,
              detail: `No reply after ${plural(m.follow_ups, "follow-up")}. Close it and spend the time on someone new.`,
              moveId: m.id,
            }
      );
    } else if (stageIndex(m.stage) < stageIndex("interview") && days >= STALE_DAYS) {
      steps.push({
        kind: "nudge",
        text: `Nudge the conversation with ${m.target}`,
        detail: `Quiet since ${ago(days)}. Share an update or a link to what you're building.`,
        moveId: m.id,
      });
    }
  }

  for (const m of open) {
    if (m.stage === "positive" && !m.application_id) {
      steps.push({
        kind: "referral",
        text: `Turn ${m.target} into a referral`,
        detail: "Ask if they'd refer you, or which role to apply to, then link the application here.",
        moveId: m.id,
      });
    }
  }

  for (const [key, s] of templateStats(moves)) {
    if (s.sent >= TEMPLATE_MIN_SENDS && s.replied / s.sent < TEMPLATE_MIN_REPLY_RATE) {
      steps.push({
        kind: "rework_template",
        text: `Rework “${templateNames.get(key) ?? "a template"}”`,
        detail: `${s.rate} replies from ${plural(s.sent, "send")}. Make the hook more specific to each person.`,
        templateKey: key,
      });
    }
  }

  const week = thisWeek(moves, applications, now);
  if (moves.length > 0 && week.sent < weeklyTarget) {
    steps.push({
      kind: "send_more",
      text: `Send ${plural(weeklyTarget - week.sent, "more message")} this week`,
      detail: `${week.sent} of ${weeklyTarget} so far.`,
    });
  }

  const lastProject = moves
    .filter((m) => m.channel === "project")
    .map((m) => dayOf(m.created_at))
    .sort()
    .at(-1);
  if (!lastProject || daysBetween(lastProject, today) >= BUILD_DAYS) {
    steps.push({
      kind: "build",
      text: "Start a small proof-of-work project",
      detail: lastProject
        ? `Last one was ${ago(daysBetween(lastProject, today))}. Build something aimed at a company you like, then message them about it.`
        : "Build something aimed at a company you like, then message them about it. It's also how a startup starts.",
    });
  }

  const coldMinutes = week.coldApps * minutesPerApp;
  if (coldMinutes > 0 && coldMinutes > week.arbitrageMinutes) {
    steps.push({
      kind: "rebalance",
      text: "Rebalance toward arbitrage",
      detail: `About ${formatHours(coldMinutes * 60)} on cold applications this week vs ${formatHours(week.arbitrageMinutes * 60)} on moves.`,
    });
  }

  return steps;
}
