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

// Must match the check constraint on assessments.outcome. null = done
// normally; pass or fail isn't stored, it follows from how far the
// application got (assessmentResult in stats.ts).
export const OUTCOMES = {
  // Didn't do it before the window closed. Not a result, and it drops out of
  // to-dos and overdue counts.
  expired: { label: "Expired", cls: "text-neutral-500 dark:text-neutral-500" },
  // Definitely did badly. Marks the assessment completed; counts as a miss in
  // the stats unless the application moved on anyway.
  bombed: { label: "Bombed", cls: "font-medium text-red-800 dark:text-red-300" },
} as const;
export type Outcome = keyof typeof OUTCOMES;

// Still something to do: not completed, and not written off as expired.
export function isOpen(a: Assessment): boolean {
  return a.status === "pending" && a.outcome !== "expired";
}

// Must match the check constraint on assessment_questions.source.
export const QUESTION_SOURCES = {
  expected: "Expected",
  asked: "Asked",
} as const;
export type QuestionSource = keyof typeof QUESTION_SOURCES;

// ---------- arbitrage (moves) ----------

export type Move = Tables<"moves">;
export type MessageTemplate = Tables<"message_templates">;

// Must match the check constraints on moves.channel and
// message_templates.channel. Outreach channels are messages to a person:
// they count in the reply funnel and get follow-up nudges. The others are
// effort (building, showing up) that counts toward hours and outcomes.
export const MOVE_CHANNELS = {
  linkedin: {
    label: "LinkedIn DM",
    outreach: true,
    tip: "Ask an engineer for a 15-minute chat, not a job. Name one specific thing about their work.",
  },
  email: {
    label: "Cold email",
    outreach: true,
    tip: "Founders at small startups read their own inbox. 3–5 sentences: who you are, one thing you'd build for them, a link.",
  },
  warm: {
    label: "Warm intro / alumni",
    outreach: true,
    tip: "Shared school, club or past team gets far more replies. Lead with the connection.",
  },
  project: {
    label: "Proof-of-work project",
    outreach: false,
    tip: "Build something small aimed at a company's problem, then use it as the hook in a message.",
  },
  community: {
    label: "Event / community",
    outreach: false,
    tip: "Hackathons, meetups, Discords, build-in-public posts: be findable so people come to you.",
  },
  other: {
    label: "Other message",
    outreach: true,
    tip: "Twitter/X, Discord DM, a comment that turned into a chat: anything that reaches a person.",
  },
} as const;
export type MoveChannel = keyof typeof MOVE_CHANNELS;

export function isOutreach(channel: string): boolean {
  return MOVE_CHANNELS[channel as MoveChannel]?.outreach ?? true;
}

export function channelLabel(channel: string): string {
  return MOVE_CHANNELS[channel as MoveChannel]?.label ?? channel;
}

// Order matters: it's the funnel, and a move sits at the furthest stage it
// reached. Must match the check constraint on moves.stage.
export const MOVE_STAGES = ["sent", "replied", "conversation", "positive", "interview", "offer"] as const;
export type MoveStage = (typeof MOVE_STAGES)[number];

export const MOVE_STAGE_META: Record<MoveStage, { label: string; hint: string; cls: string }> = {
  sent: {
    label: "Sent",
    hint: "Reached out, no reply yet",
    cls: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  },
  replied: {
    label: "Replied",
    hint: "They wrote back",
    cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  },
  conversation: {
    label: "Conversation",
    hint: "Two or more back-and-forths",
    cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  },
  positive: {
    label: "Positive",
    hint: "Agreed to a call, offered a referral, or invited you to apply",
    cls: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  },
  interview: {
    label: "Interview",
    hint: "Led to an interview",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  offer: {
    label: "Offer",
    hint: "Led to an offer",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
};

// Effort moves have nothing to "send"; their first stage reads as logged.
export function moveStageLabel(stage: string, channel: string): string {
  if (stage === "sent" && !isOutreach(channel)) return "Logged";
  return MOVE_STAGE_META[stage as MoveStage]?.label ?? stage;
}

export function stageIndex(stage: string): number {
  return Math.max(0, MOVE_STAGES.indexOf(stage as MoveStage));
}

// Whose turn it is in the conversation. Must match the check constraint on
// moves.waiting_on.
export const WAITING_ON = {
  them: "Waiting on them",
  me: "Your turn",
} as const;
export type WaitingOn = keyof typeof WAITING_ON;

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

export type EmailMessage = Tables<"email_messages">;
export type EmailAccept = Tables<"email_accepts">;
export type EmailMute = Tables<"email_mutes">;
export type GmailScan = Tables<"gmail_scans">;

// Must match the check constraint on email_messages.state. Accepted and
// dismissed emails never come back as suggestions on a later scan.
export const EMAIL_STATES = ["pending", "accepted", "dismissed"] as const;
export type EmailState = (typeof EMAIL_STATES)[number];

// Must match the check constraint on email_mutes.kind.
export const MUTE_KINDS = {
  sender: "Sender",
  company: "Company",
} as const;
export type MuteKind = keyof typeof MUTE_KINDS;

// Job postings pulled from alert emails. Must match the check constraint on
// job_postings.state. Dismissed ones never come back on a later scan.
export const POSTING_STATES = ["new", "saved", "applied", "dismissed"] as const;
export type PostingState = (typeof POSTING_STATES)[number];

export type JobPosting = Tables<"job_postings">;

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

// "just now", "37m ago", "3h ago", "2d ago" -- for postings, where the hour matters.
export function formatAgo(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "—";
  const ms = now - new Date(value).getTime();
  if (Number.isNaN(ms)) return "—";
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
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
