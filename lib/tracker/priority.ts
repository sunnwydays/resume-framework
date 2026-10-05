import { isOpen, relativeDue, type Application, type Assessment } from "@/lib/tracker/format";

// Which pending assessment to do first. Tiered rather than a magic score:
//   1. dated: due later, or overdue by at most STALE_AFTER (it may still be
//      open), soonest first. Important ones count as due a day earlier.
//   2. undated, important first.
//   3. stale: overdue by more than STALE_AFTER (probably closed).
// Ties go to the shorter one (a quick win), then the easier one. Completed
// assessments and ones whose application is rejected/withdrawn are unranked.
const HOUR = 3_600_000;
const STALE_AFTER = 72 * HOUR;
const IMPORTANT_HEAD_START = 24 * HOUR;

export type Priority = { rank: number; reason: string };

function rankable(a: Assessment, app: Application | undefined): boolean {
  return isOpen(a) && app?.status !== "rejected" && app?.status !== "withdrawn";
}

function sortKey(a: Assessment, now: number): number[] {
  const due = a.due_at ? new Date(a.due_at).getTime() : null;
  const ties = [a.duration_min ?? Infinity, a.difficulty ?? Infinity];
  if (due === null) return [1, a.important ? 0 : 1, ...ties];
  if (now - due > STALE_AFTER) return [2, -due, ...ties]; // most recently missed first
  return [0, due - (a.important ? IMPORTANT_HEAD_START : 0), ...ties];
}

function compareKeys(x: number[], y: number[]): number {
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

function reason(a: Assessment, now: number): string {
  const parts: string[] = [];
  if (!a.due_at) parts.push("no due date");
  else if (now - new Date(a.due_at).getTime() > STALE_AFTER) parts.push(`${relativeDue(a.due_at, now)}, may be closed`);
  else parts.push(relativeDue(a.due_at, now));
  if (a.important) parts.push("important");
  if (a.duration_min != null) parts.push(`${a.duration_min} min`);
  if (a.difficulty != null) parts.push(`difficulty ${a.difficulty}/5`);
  return parts.join(" · ");
}

// Rank (1 = do first) for every rankable assessment, keyed by id.
export function prioritize(
  assessments: Assessment[],
  applicationsById: Map<string, Application>,
  now: number
): Map<string, Priority> {
  const ranked = assessments
    .filter((a) => rankable(a, applicationsById.get(a.application_id)))
    .map((a) => ({ a, key: sortKey(a, now) }))
    .sort((x, y) => compareKeys(x.key, y.key));
  return new Map(ranked.map(({ a }, i) => [a.id, { rank: i + 1, reason: reason(a, now) }]));
}
