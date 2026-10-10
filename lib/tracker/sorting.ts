import { ROLE_TYPE_ORDER, roleType } from "@/lib/tracker/roles";
import type { Priority } from "@/lib/tracker/priority";
import {
  STATUSES,
  isOpen,
  kindLabel,
  relativeDue,
  type AppStatus,
  type Application,
  type Assessment,
} from "@/lib/tracker/format";

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir };

// Null means "nothing to sort on" and always goes last, in either
// direction. The sort is stable, so ties keep the input order.
export function sortRows<T, K extends string>(
  rows: T[],
  value: (row: T, key: K) => string | number | null,
  sort: SortState<K>
): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const keyed = rows.map((row) => ({ row, v: value(row, sort.key) }));
  keyed.sort((a, b) => {
    if (a.v === null || b.v === null) return a.v === b.v ? 0 : a.v === null ? 1 : -1;
    const cmp =
      typeof a.v === "number" && typeof b.v === "number"
        ? a.v - b.v
        : String(a.v).localeCompare(String(b.v), undefined, { sensitivity: "base", numeric: true });
    return cmp * sign;
  });
  return keyed.map((k) => k.row);
}

// ---------------------------------------------------------- applications

export type ApplicationSortKey = "company" | "role" | "type" | "applied" | "status" | "next" | "changed";

// Soonest pending assessment: dated ones first, then undated.
export function nextPending(assessments: Assessment[]): Assessment | undefined {
  return assessments
    .filter(isOpen)
    .sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"))[0];
}

export function nextStep(assessments: Assessment[], now: number) {
  const a = nextPending(assessments);
  if (!a) return null;
  const overdue = Boolean(a.due_at && new Date(a.due_at).getTime() < now);
  return {
    text: `${kindLabel(a.kind)}${a.due_at ? ` · ${relativeDue(a.due_at, now)}` : ""}`,
    overdue,
    important: a.important,
  };
}

export function applicationSortValue(
  app: Application,
  key: ApplicationSortKey,
  assessments: Assessment[]
): string | number | null {
  switch (key) {
    case "company":
      return app.company;
    case "role":
      return app.role;
    case "type":
      return ROLE_TYPE_ORDER[roleType(app.role)];
    case "applied":
      return app.applied_on;
    case "status":
      return STATUSES.indexOf(app.status as AppStatus);
    case "next": {
      // A number, not an ISO string: string collation puts symbols before
      // digits, which would sort undated steps first. Undated pending steps
      // sort after dated ones.
      const a = nextPending(assessments);
      return a ? (a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER) : null;
    }
    case "changed":
      return app.status !== "applied" ? app.status_changed_at : null;
  }
}

// ----------------------------------------------------------- assessments

export type AssessmentSortKey = "priority" | "company" | "title" | "due" | "difficulty" | "result";

// Pending, then done normally, then bombed, and expired last.
export function resultRank(a: Assessment): number {
  if (a.outcome === "expired") return 3;
  if (a.outcome === "bombed") return 2;
  return a.status === "completed" ? 1 : 0;
}

export function assessmentSortValue(
  a: Assessment,
  key: AssessmentSortKey,
  app: Application | undefined,
  priority: Map<string, Priority>
): string | number | null {
  switch (key) {
    case "priority":
      return priority.get(a.id)?.rank ?? null;
    case "company":
      return app ? `${app.company} ${app.role}` : null;
    case "title":
      return a.title;
    case "due":
      return a.due_at;
    case "difficulty":
      return a.difficulty;
    case "result":
      return resultRank(a);
  }
}
