import type { Tables } from "@/lib/tracker/database.types";

export type Application = Tables<"applications">;
export type Assessment = Tables<"assessments">;
export type StatusChange = Tables<"status_changes">;
export type Question = Tables<"assessment_questions">;

// Order matters: it's the pipeline order used for filter chips and the
// status dropdown. Must match the check constraint on applications.status.
export const STATUSES = [
  "applied",
  "oa",
  "video_interview",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;
export type AppStatus = (typeof STATUSES)[number];

export const STATUS_META: Record<AppStatus, { label: string; cls: string }> = {
  applied: {
    label: "Applied",
    cls: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  },
  oa: {
    label: "OA",
    cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  },
  video_interview: {
    label: "Video interview",
    cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  },
  interview: {
    label: "Interview",
    cls: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  },
  offer: {
    label: "Offer",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  rejected: {
    label: "Rejected",
    cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
  withdrawn: {
    label: "Withdrawn",
    cls: "bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-500",
  },
};

export function statusLabel(status: string): string {
  return STATUS_META[status as AppStatus]?.label ?? status;
}

// Must match the check constraint on assessments.kind.
export const ASSESSMENT_KINDS = {
  oa: "OA",
  video_interview: "Video interview",
  interview: "Interview",
} as const;
export type AssessmentKind = keyof typeof ASSESSMENT_KINDS;

export function kindLabel(kind: string): string {
  return ASSESSMENT_KINDS[kind as AssessmentKind] ?? kind;
}

// Must match the check constraint on assessments.outcome (null = not set).
export const OUTCOMES = {
  waiting: { label: "Waiting", cls: "text-amber-700 dark:text-amber-400" },
  passed: { label: "Passed", cls: "text-emerald-700 dark:text-emerald-400" },
  failed: { label: "Failed", cls: "text-red-700 dark:text-red-400" },
} as const;
export type Outcome = keyof typeof OUTCOMES;

// Must match the check constraint on assessment_questions.source.
export const QUESTION_SOURCES = {
  expected: "Expected",
  asked: "Asked",
} as const;
export type QuestionSource = keyof typeof QUESTION_SOURCES;

// What a Gmail message was recognized as. Must match the check constraint on
// email_messages.kind.
export const EMAIL_KINDS = {
  confirmation: "Applied",
  rejection: "Rejection",
  oa_invite: "OA invite",
  video_invite: "Video interview invite",
  interview_invite: "Interview invite",
  assessment_done: "Assessment done",
  reminder: "Reminder",
} as const;
export type EmailKind = keyof typeof EMAIL_KINDS;

const pad = (n: number) => String(n).padStart(2, "0");

// Today (or the day of `at`) as a local YYYY-MM-DD (what a <input
// type="date"> and a Postgres `date` column both want).
export function todayISO(at: number = Date.now()): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 5025 -> "1:23:45", for the running timer.
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

// 5025 -> "1h 23m", 300 -> "5m", for totals.
export function formatHours(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

// Manual time entry -> seconds. Accepts "1:30" (h:mm), "1:30:15", "90"
// (minutes), "1.5h", "1h 30m", "45m". Null if it can't be read.
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const clock = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/.exec(s);
  if (clock) return +clock[1] * 3600 + +clock[2] * 60 + +(clock[3] ?? 0);
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 60);
  const units = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/.exec(s);
  if (units && (units[1] || units[2])) {
    return Math.round(parseFloat(units[1] ?? "0") * 3600) + +(units[2] ?? 0) * 60;
  }
  return null;
}

// dd/mm/yy, matching the old spreadsheet. A bare YYYY-MM-DD is read as a
// calendar date (no timezone shift); anything else as a timestamp.
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (bare) return `${bare[3]}/${bare[2]}/${bare[1].slice(2)}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${formatDate(value)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "overdue 2d", "due in 5h", "due in 3d" — for the upcoming strip.
export function relativeDue(value: string, now = Date.now()): string {
  const diff = new Date(value).getTime() - now;
  const hours = Math.round(Math.abs(diff) / 3_600_000);
  const span = hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
  return diff < 0 ? `overdue ${span}` : `due in ${span}`;
}

// timestamptz <-> <input type="datetime-local"> (local time, no seconds).
export function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Same posting? Ignores tracking params (src, utm_*, source, ref), "www."
// and trailing slashes. Used for duplicate checks when adding/importing.
export function sameUrl(a: string, b: string): boolean {
  const norm = (s: string) => {
    try {
      const u = new URL(s.trim());
      for (const key of [...u.searchParams.keys()]) {
        if (/^(utm_|src$|source$|ref$|gh_src$)/i.test(key)) u.searchParams.delete(key);
      }
      return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}?${u.searchParams}`;
    } catch {
      return s.trim();
    }
  };
  return norm(a) === norm(b);
}

export const inputCls =
  "w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-surface px-2.5 py-1.5 text-sm placeholder:text-neutral-400 dark:placeholder:text-neutral-600 transition-colors focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-500 disabled:opacity-50";

export const buttonCls =
  "rounded-md border border-neutral-300 dark:border-neutral-700 bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50";

export const primaryButtonCls =
  "rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 disabled:opacity-50";
