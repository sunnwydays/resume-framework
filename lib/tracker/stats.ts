import {
  ASSESSMENT_KINDS,
  formatDate,
  isFailed,
  isOpen,
  todayISO,
  type Application,
  type Assessment,
  type AssessmentKind,
  type Question,
  type StatusChange,
} from "@/lib/tracker/format";
import { ROLE_TYPES, roleType, type RoleType } from "@/lib/tracker/roles";

// Pure numbers for the stats panels. Imported rows often have no status
// dates, so every timing stat uses only the dated rows and says how many
// that was rather than guessing.

const DAY = 86_400_000;
const HOUR = 3_600_000;
export const NO_REPLY_DAYS = 30;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ---------- dates (local calendar days as YYYY-MM-DD) ----------

function dayStart(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

// Calendar day of a timestamp (or the day itself for a bare date).
export function dayOf(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayISO(new Date(value).getTime());
}

// Rounded so a DST shift doesn't turn 1 day into 0.96.
export function daysBetween(from: string, to: string): number {
  return Math.round((dayStart(to) - dayStart(from)) / DAY);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(dayStart(iso));
  d.setDate(d.getDate() + n);
  return todayISO(d.getTime());
}

// 0 = Monday … 6 = Sunday.
export function weekdayIndex(iso: string): number {
  return (new Date(dayStart(iso)).getDay() + 6) % 7;
}

export function weekStart(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

export function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function argmax(values: number[]): number {
  return values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
}

export function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function formatDays(n: number): string {
  return n === 0 ? "same day" : plural(Math.round(n * 10) / 10, "day");
}

function datedNote(n: number, of: number): string | undefined {
  return n < of ? `from ${n} of ${of} with dates` : undefined;
}

// ---------- pipeline stage ----------

export const STAGES = ["applied", "oa", "video_interview", "interview", "offer"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  applied: "Applied",
  oa: "OA",
  video_interview: "Video interview",
  interview: "Interview",
  offer: "Offer",
};

// How far an application got, even if it's rejected now: the furthest of
// its current status, its status history, and the kinds of its assessments.
export function furthestStage(app: Application, assessments: Assessment[], changes: StatusChange[]): Stage {
  let best = 0;
  const bump = (s: string) => {
    const i = STAGES.indexOf(s as Stage);
    if (i > best) best = i;
  };
  bump(app.status);
  changes.forEach((c) => bump(c.status));
  assessments.forEach((a) => bump(a.kind));
  return STAGES[best];
}

const isReply = (status: string) => status !== "applied" && status !== "withdrawn";

// Any reply at all, rejection included.
export function heardBack(app: Application, assessments: Assessment[], changes: StatusChange[]): boolean {
  return isReply(app.status) || assessments.length > 0 || changes.some((c) => isReply(c.status));
}

// The first dated reply, if any.
function firstReplyDay(app: Application, changes: StatusChange[]): string | null {
  const days = changes.filter((c) => isReply(c.status) && c.changed_at).map((c) => dayOf(c.changed_at!));
  if (isReply(app.status) && app.status_changed_at) days.push(dayOf(app.status_changed_at));
  return days.sort()[0] ?? null;
}

// The day the application first moved to `status`, if dated.
function statusDay(changes: StatusChange[], status: string): string | null {
  const c = changes.find((x) => x.status === status && x.changed_at);
  return c ? dayOf(c.changed_at!) : null;
}

export function isGhosted(app: Application, assessments: Assessment[], today: string): boolean {
  return app.status === "applied" && assessments.length === 0 && daysBetween(app.applied_on, today) >= NO_REPLY_DAYS;
}

// ---------- applications ----------

export type Fact = { label: string; value: string; detail?: string };

export interface ApplicationStats {
  total: number;
  thisWeek: number;
  lastWeek: number;
  heardBack: number;
  progressed: number;
  interviewed: number;
  offers: number;
  currentStreak: number;
  daily: Map<string, number>;
  weekly: { start: string; count: number }[];
  funnel: { stage: Stage; label: string; count: number }[];
  byType: { type: RoleType; label: string; count: number; heardBack: number; progressed: number }[];
  weekday: number[];
  facts: Fact[];
}

const MAX_WEEKS = 26;

export function applicationStats(
  apps: Application[],
  assessmentsByApp: Map<string, Assessment[]>,
  changesByApp: Map<string, StatusChange[]>,
  timeDays: Record<string, number>,
  now: number
): ApplicationStats {
  const today = todayISO(now);
  const thisMonday = weekStart(today);
  const lastMonday = addDays(thisMonday, -7);

  const daily = new Map<string, number>();
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  const funnelCounts = STAGES.map(() => 0);
  const types = new Map<RoleType, { count: number; heardBack: number; progressed: number }>();
  let thisWeek = 0;
  let lastWeek = 0;
  let heard = 0;
  let offers = 0;
  const firstReply: number[] = [];
  let heardDated = 0;
  const rejectDays: { app: Application; days: number }[] = [];
  let rejected = 0;
  const rejectWeekday = [0, 0, 0, 0, 0, 0, 0];
  const ghosts: Application[] = [];
  let ghostEligible = 0;
  const companies = new Map<string, { name: string; count: number }>();
  const roles = new Map<string, Map<string, number>>();

  for (const app of apps) {
    const asmts = assessmentsByApp.get(app.id) ?? [];
    const changes = changesByApp.get(app.id) ?? [];
    const day = app.applied_on;

    daily.set(day, (daily.get(day) ?? 0) + 1);
    weekday[weekdayIndex(day)]++;
    if (day >= thisMonday) thisWeek++;
    else if (day >= lastMonday) lastWeek++;

    const stage = STAGES.indexOf(furthestStage(app, asmts, changes));
    for (let i = 0; i <= stage; i++) funnelCounts[i]++;
    if (stage === STAGES.indexOf("offer")) offers++;

    const replied = heardBack(app, asmts, changes);
    if (replied) {
      heard++;
      const first = firstReplyDay(app, changes);
      if (first) {
        heardDated++;
        firstReply.push(Math.max(0, daysBetween(day, first)));
      }
    }

    const t = types.get(roleType(app.role)) ?? { count: 0, heardBack: 0, progressed: 0 };
    t.count++;
    if (replied) t.heardBack++;
    if (stage >= 1) t.progressed++;
    types.set(roleType(app.role), t);

    if (app.status === "rejected") {
      rejected++;
      if (app.status_changed_at) {
        const rejectDay = dayOf(app.status_changed_at);
        rejectDays.push({ app, days: Math.max(0, daysBetween(day, rejectDay)) });
        rejectWeekday[weekdayIndex(rejectDay)]++;
      }
    }

    if (daysBetween(day, today) >= NO_REPLY_DAYS) {
      ghostEligible++;
      if (isGhosted(app, asmts, today)) ghosts.push(app);
    }

    const companyKey = app.company.trim().toLowerCase();
    const c = companies.get(companyKey) ?? { name: app.company.trim(), count: 0 };
    c.count++;
    companies.set(companyKey, c);

    // Group roles case-insensitively but remember the most-used spelling.
    const roleKey = app.role.trim().toLowerCase();
    const spellings = roles.get(roleKey) ?? new Map<string, number>();
    spellings.set(app.role.trim(), (spellings.get(app.role.trim()) ?? 0) + 1);
    roles.set(roleKey, spellings);
  }

  // Weekly volume: from the first application's week (at most MAX_WEEKS
  // back) to this week, zero-filled.
  const days = [...daily.keys()].sort();
  const weekly: { start: string; count: number }[] = [];
  if (days.length) {
    let start = weekStart(days[0]);
    const earliest = addDays(thisMonday, -7 * (MAX_WEEKS - 1));
    if (start < earliest) start = earliest;
    for (let w = start; w <= thisMonday; w = addDays(w, 7)) {
      let count = 0;
      for (let i = 0; i < 7; i++) count += daily.get(addDays(w, i)) ?? 0;
      weekly.push({ start: w, count });
    }
  }

  // Streaks of consecutive days with at least one application. Today not
  // being logged yet doesn't break the current streak.
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    prev = d;
  }
  let currentStreak = 0;
  for (let d = daily.has(today) ? today : addDays(today, -1); daily.has(d); d = addDays(d, -1)) currentStreak++;

  const facts: Fact[] = [];
  const total = apps.length;

  if (longestStreak > 1) {
    facts.push({
      label: "Longest streak",
      value: plural(longestStreak, "day"),
      detail: currentStreak > 0 ? `current: ${plural(currentStreak, "day")}` : "no streak going right now",
    });
  }

  if (days.length) {
    const [busiestDay, busiestCount] = [...daily].reduce((a, b) => (b[1] > a[1] ? b : a));
    if (busiestCount > 1) {
      facts.push({
        label: "Busiest day",
        value: plural(busiestCount, "application"),
        detail: `${WEEKDAYS[weekdayIndex(busiestDay)]} ${formatDate(busiestDay)}`,
      });
    }
  }

  let longestGap = 0;
  let gapEnd: string | null = null;
  for (let i = 1; i < days.length; i++) {
    const gap = daysBetween(days[i - 1], days[i]) - 1;
    if (gap > longestGap) {
      longestGap = gap;
      gapEnd = days[i];
    }
  }
  if (longestGap >= 3 && gapEnd) {
    facts.push({ label: "Longest break", value: plural(longestGap, "day"), detail: `ended ${formatDate(gapEnd)}` });
  }

  if (total >= 5) {
    const fav = argmax(weekday);
    facts.push({
      label: "Favorite day to apply",
      value: WEEKDAYS[fav],
      detail: `${pct(weekday[fav], total)} of applications`,
    });
  }

  if (ghostEligible > 0) {
    const oldest = ghosts.sort((a, b) => a.applied_on.localeCompare(b.applied_on))[0];
    facts.push({
      label: `Ghosted (${NO_REPLY_DAYS}d+, no reply)`,
      value: pct(ghosts.length, ghostEligible),
      detail: oldest
        ? `longest wait: ${oldest.company}, ${plural(daysBetween(oldest.applied_on, today), "day")}`
        : `of ${plural(ghostEligible, "application")} old enough`,
    });
  }

  const daysToReply = median(firstReply);
  if (daysToReply !== null) {
    facts.push({ label: "Typical wait for a reply", value: formatDays(daysToReply), detail: datedNote(heardDated, heard) });
  }

  if (rejectDays.length) {
    const fastest = rejectDays.reduce((a, b) => (b.days < a.days ? b : a));
    facts.push({
      label: "Speedrun rejection",
      value: formatDays(fastest.days),
      detail: `${fastest.app.company} · ${fastest.app.role}`,
    });
    facts.push({
      label: "Typical time to rejection",
      value: formatDays(median(rejectDays.map((r) => r.days))!),
      detail: datedNote(rejectDays.length, rejected),
    });
  }

  if (rejectDays.length >= 3) {
    const d = argmax(rejectWeekday);
    facts.push({
      label: "Rejections usually land on",
      value: WEEKDAYS[d],
      detail: `${pct(rejectWeekday[d], rejectDays.length)} of dated rejections`,
    });
  }

  if (companies.size) {
    const top = [...companies.values()].reduce((a, b) => (b.count > a.count ? b : a));
    facts.push({
      label: "Companies",
      value: String(companies.size),
      detail: top.count > 1 ? `most applied to: ${top.name} (${top.count})` : "never the same one twice",
    });
  }

  if (roles.size) {
    const [, spellings] = [...roles].reduce((a, b) => (sum(b[1]) > sum(a[1]) ? b : a));
    const count = sum(spellings);
    const spelling = [...spellings].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    if (count >= 3) {
      facts.push({
        label: "Your typing habit",
        value: `“${spelling}”`,
        detail: `typed as the role ${plural(count, "time")} (${pct(count, total)})`,
      });
    }
  }

  const seconds = Object.values(timeDays).reduce((a, b) => a + b, 0);
  if (seconds >= 60) {
    const hours = seconds / 3600;
    facts.push({
      label: "Time invested",
      value: hours >= 1 ? `${Math.round(hours * 10) / 10} h` : `${Math.round(seconds / 60)} min`,
      detail: total ? `≈ ${Math.round(seconds / 60 / total)} min per application (since timing began)` : undefined,
    });
  }

  return {
    total,
    thisWeek,
    lastWeek,
    heardBack: heard,
    progressed: funnelCounts[1],
    interviewed: funnelCounts[STAGES.indexOf("interview")],
    offers,
    currentStreak,
    daily,
    weekly,
    funnel: STAGES.map((stage, i) => ({ stage, label: STAGE_LABELS[stage], count: funnelCounts[i] })),
    byType: ROLE_TYPES.filter((t) => types.has(t.key)).map((t) => ({
      type: t.key,
      label: t.label,
      ...types.get(t.key)!,
    })),
    weekday,
    facts,
  };
}

function sum(m: Map<string, number>): number {
  let n = 0;
  for (const v of m.values()) n += v;
  return n;
}

// ---------- assessments ----------

type PassCount = { count: number; passed: number; failed: number };

export interface AssessmentStats {
  total: number;
  completed: number;
  passed: number;
  failed: number;
  dueThisWeek: number;
  overdue: number;
  byKind: (PassCount & { kind: AssessmentKind; label: string })[];
  byDifficulty: (PassCount & { difficulty: number })[];
  byType: (PassCount & { type: RoleType; label: string })[];
  facts: Fact[];
}

function tally(map: Map<string, PassCount>, key: string, a: Assessment) {
  const t = map.get(key) ?? { count: 0, passed: 0, failed: 0 };
  t.count++;
  if (a.outcome === "passed") t.passed++;
  if (isFailed(a)) t.failed++;
  map.set(key, t);
}

export function assessmentStats(
  assessments: Assessment[],
  applicationsById: Map<string, Application>,
  assessmentsByApp: Map<string, Assessment[]>,
  changesByApp: Map<string, StatusChange[]>,
  questionsByAssessment: Map<string, Question[]>,
  now: number
): AssessmentStats {
  const kinds = new Map<string, PassCount>();
  const difficulties = new Map<string, PassCount>();
  const types = new Map<string, PassCount>();
  let completed = 0;
  let passed = 0;
  let failed = 0;
  let dueThisWeek = 0;
  let overdue = 0;
  let minutes = 0;
  const marginHours: number[] = [];
  let oasDone = 0;
  const turnaround: number[] = [];
  let hardest: Assessment | null = null;
  let mostQuestions: { a: Assessment; n: number } | null = null;
  const oaApps = new Set<string>();

  for (const a of assessments) {
    const app = applicationsById.get(a.application_id);
    const due = a.due_at ? new Date(a.due_at).getTime() : null;
    tally(kinds, a.kind, a);
    if (a.difficulty != null) tally(difficulties, String(a.difficulty), a);
    if (app) tally(types, roleType(app.role), a);
    if (a.outcome === "passed") passed++;
    if (isFailed(a)) failed++;
    if (a.kind === "oa") oaApps.add(a.application_id);

    if (isOpen(a)) {
      if (due !== null && due < now) overdue++;
      else if (due !== null && due - now < 7 * DAY) dueThisWeek++;
    } else if (a.status === "completed") {
      completed++;
      if (a.duration_min) minutes += a.duration_min;
      if (a.kind === "oa") {
        oasDone++;
        if (due !== null && a.completed_at) marginHours.push((due - new Date(a.completed_at).getTime()) / HOUR);
        const invited = statusDay(changesByApp.get(a.application_id) ?? [], "oa");
        if (invited && a.completed_at) turnaround.push(Math.max(0, daysBetween(invited, dayOf(a.completed_at))));
      }
    }

    if (a.difficulty != null && (!hardest || a.difficulty > (hardest.difficulty ?? 0))) hardest = a;
    const n = questionsByAssessment.get(a.id)?.length ?? 0;
    if (n > 0 && (!mostQuestions || n > mostQuestions.n)) mostQuestions = { a, n };
  }

  const facts: Fact[] = [];
  const name = (a: Assessment) => applicationsById.get(a.application_id)?.company ?? a.title;

  if (marginHours.length) {
    const m = median(marginHours)!;
    const lastDay = marginHours.filter((h) => h >= 0 && h < 24).length;
    const late = marginHours.filter((h) => h < 0).length;
    facts.push({
      label: "Procrastination index",
      value: m >= 48 ? `${Math.round(m / 24)} days early` : m >= 0 ? `${Math.round(m)}h before due` : `${Math.round(-m)}h late`,
      detail: [`${pct(lastDay, marginHours.length)} done in the final 24h`, late ? `${late} late` : null, datedNote(marginHours.length, oasDone)]
        .filter(Boolean)
        .join(" · "),
    });
  }

  if (turnaround.length) {
    facts.push({ label: "OA invite → submitted", value: formatDays(median(turnaround)!), detail: datedNote(turnaround.length, oasDone) });
  }

  // Applied -> OA invite, per application with an OA.
  const toInvite: { app: Application; days: number }[] = [];
  let reachedInterview = 0;
  for (const id of oaApps) {
    const app = applicationsById.get(id);
    if (!app) continue;
    const changes = changesByApp.get(id) ?? [];
    const invited = statusDay(changes, "oa");
    if (invited) toInvite.push({ app, days: Math.max(0, daysBetween(app.applied_on, invited)) });
    const stage = furthestStage(app, assessmentsByApp.get(id) ?? [], changes);
    if (STAGES.indexOf(stage) >= STAGES.indexOf("video_interview")) reachedInterview++;
  }
  if (toInvite.length) {
    const fastest = toInvite.reduce((a, b) => (b.days < a.days ? b : a));
    facts.push({
      label: "Applied → OA invite",
      value: formatDays(median(toInvite.map((t) => t.days))!),
      detail: `fastest: ${fastest.app.company} (${formatDays(fastest.days)})`,
    });
  }
  if (oaApps.size >= 2) {
    facts.push({
      label: "OA → interview",
      value: pct(reachedInterview, oaApps.size),
      detail: `${reachedInterview} of ${plural(oaApps.size, "application")} with an OA got an interview`,
    });
  }

  if (minutes > 0) {
    facts.push({
      label: "Time in assessments",
      value: minutes >= 90 ? `${Math.round(minutes / 6) / 10} h` : `${minutes} min`,
      detail: "from the listed durations",
    });
  }

  const rated = assessments.filter((a) => a.difficulty != null);
  if (rated.length >= 2) {
    const avg = rated.reduce((s, a) => s + a.difficulty!, 0) / rated.length;
    facts.push({ label: "Average difficulty", value: `${avg.toFixed(1)} / 5`, detail: `over ${plural(rated.length, "rated one")}` });
  }
  if (hardest) {
    facts.push({ label: "Hardest so far", value: `${hardest.difficulty} / 5`, detail: `${name(hardest)} · ${hardest.title}` });
  }
  if (mostQuestions) {
    facts.push({
      label: "Most questions logged",
      value: String(mostQuestions.n),
      detail: `${name(mostQuestions.a)} · ${mostQuestions.a.title}`,
    });
  }

  return {
    total: assessments.length,
    completed,
    passed,
    failed,
    dueThisWeek,
    overdue,
    byKind: (Object.keys(ASSESSMENT_KINDS) as AssessmentKind[])
      .filter((k) => kinds.has(k))
      .map((k) => ({ kind: k, label: ASSESSMENT_KINDS[k], ...kinds.get(k)! })),
    byDifficulty: [1, 2, 3, 4, 5].map((d) => ({ difficulty: d, ...(difficulties.get(String(d)) ?? { count: 0, passed: 0, failed: 0 }) })),
    byType: ROLE_TYPES.filter((t) => types.has(t.key)).map((t) => ({ type: t.key, label: t.label, ...types.get(t.key)! })),
    facts,
  };
}
