import {
  isOpen,
  todayISO,
  type AppStatus,
  type Application,
  type Assessment,
  type Question,
} from "@/lib/tracker/format";
import { roleType, type RoleType } from "@/lib/tracker/roles";
import { sectionText, sectionsOf } from "@/lib/tracker/sections";
import { NO_REPLY_DAYS, daysBetween, isGhosted } from "@/lib/tracker/stats";

// Filtering is split in two so the stats can reuse the first half: search
// and role type decide what the stats describe; everything else (status,
// hide rejected, …) only narrows the table, since hiding rejected rows
// would inflate every success rate.

export const CLOSED: AppStatus[] = ["rejected", "withdrawn"];
const STEP_STATUSES: AppStatus[] = ["oa", "video_interview", "interview", "offer"];

export type StatusFilter = "all" | "active" | AppStatus;
export type AppliedWithin = 0 | 7 | 30 | 90; // 0 = any time

export interface AppFilters {
  status: StatusFilter;
  hideRejected: boolean;
  appliedWithin: AppliedWithin;
  hasSteps: boolean;
  noReply: boolean;
}

export const DEFAULT_APP_FILTERS: AppFilters = {
  status: "active",
  hideRejected: false,
  appliedWithin: 0,
  hasSteps: false,
  noReply: false,
};

export type OutcomeFilter = "any" | "bombed" | "expired" | "unset";

export interface AssessmentFilters {
  status: "pending" | "completed" | "all";
  kind: string | null;
  outcome: OutcomeFilter;
  importantOnly: boolean;
  overdueOnly: boolean;
}

export const DEFAULT_ASSESSMENT_FILTERS: AssessmentFilters = {
  status: "pending",
  kind: null,
  outcome: "any",
  importantOnly: false,
  overdueOnly: false,
};

export function matchesRoleTypes(types: Set<RoleType>, role: string | undefined): boolean {
  return types.size === 0 || (role !== undefined && types.has(roleType(role)));
}

export function matchesApplicationSearch(a: Application, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [a.company, a.role, a.location, a.notes].some((v) => v?.toLowerCase().includes(q));
}

// Search covers the assessment, its application, and its questions.
export function matchesAssessmentSearch(
  a: Assessment,
  app: Application | undefined,
  questions: Question[],
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    app?.company,
    app?.role,
    a.title,
    a.details,
    a.interviewer,
    a.score,
    a.notes,
    a.prep_notes,
    a.reflection,
    ...sectionText(sectionsOf(a.sections)),
    ...questions.flatMap((x) => [x.question, x.answer]),
  ].some((v) => v?.toLowerCase().includes(q));
}

// The table-only half of the application filters. Status ignores
// `hideRejected`, which lets "All + hide rejected" work.
export function matchesApplicationFilters(
  a: Application,
  f: AppFilters,
  assessments: Assessment[],
  now: number
): boolean {
  if (f.status === "active" && CLOSED.includes(a.status as AppStatus)) return false;
  if (f.status !== "all" && f.status !== "active" && a.status !== f.status) return false;
  if (f.hideRejected && a.status === "rejected") return false;
  const today = todayISO(now);
  if (f.appliedWithin && daysBetween(a.applied_on, today) > f.appliedWithin) return false;
  if (f.hasSteps && assessments.length === 0 && !STEP_STATUSES.includes(a.status as AppStatus)) return false;
  if (f.noReply && !isGhosted(a, assessments, today)) return false;
  return true;
}

export const NO_REPLY_LABEL = `No reply ${NO_REPLY_DAYS}d+`;

export function matchesAssessmentFilters(a: Assessment, f: AssessmentFilters, now: number): boolean {
  if (f.status !== "all" && a.status !== f.status) return false;
  // Expired stays status "pending" but isn't open; picking the Expired outcome still shows them.
  if (f.status === "pending" && f.outcome !== "expired" && !isOpen(a)) return false;
  if (f.kind && a.kind !== f.kind) return false;
  if (f.outcome !== "any" && (a.outcome ?? "unset") !== f.outcome) return false;
  if (f.importantOnly && !a.important) return false;
  if (f.overdueOnly && !(isOpen(a) && a.due_at && new Date(a.due_at).getTime() < now)) return false;
  return true;
}

export function isDefault<T extends object>(f: T, defaults: T): boolean {
  return (Object.keys(defaults) as (keyof T)[]).every((k) => f[k] === defaults[k]);
}
