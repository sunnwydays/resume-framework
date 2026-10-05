// What the "From Gmail" tab shows: pending stored emails, minus muted ones,
// grouped into one card per job against the current tracker data.
// Recomputed on every change, so accepting a card re-matches the rest.

import { groupIntoJobs, STATUS_FOR, type JobGroup } from "@/lib/tracker/email/group";
import { isMuted } from "@/lib/tracker/email/mute";
import { fromRow } from "@/lib/tracker/email/rows";
import type { Application, Assessment, EmailMessage, EmailMute, StatusChange } from "@/lib/tracker/format";

export const REVIEW_FILTERS = {
  all: "All",
  new: "New applications",
  updates: "Updates",
  pick: "Needs a pick",
  nothing: "Nothing to do",
} as const;
export type ReviewFilter = keyof typeof REVIEW_FILTERS;

export function category(g: JobGroup): Exclude<ReviewFilter, "all"> {
  if (g.target.type === "pick") return "pick";
  if (g.nothingToDo) return "nothing";
  return g.target.type === "new" ? "new" : "updates";
}

// The second chip row: what the card's newest status-bearing email says (a
// rejection after an interview invite reads as Rejected). Cards with only
// reminders or "assessment done" mails have no status of their own.
export const STATUS_FILTERS = {
  all: "All statuses",
  applied: "Applied",
  oa: "OA",
  video_interview: "Video interview",
  interview: "Interview",
  rejected: "Rejected",
  other: "Reminders & other",
} as const;
export type StatusFilter = keyof typeof STATUS_FILTERS;

export function emailStatus(g: JobGroup): Exclude<StatusFilter, "all"> {
  for (let i = g.emails.length - 1; i >= 0; i--) {
    const kind = g.emails[i].kind;
    const status = kind ? STATUS_FOR[kind] : undefined;
    if (status === "applied" || status === "oa" || status === "video_interview" || status === "interview" || status === "rejected") return status;
  }
  return "other";
}

export function countByStatus(groups: JobGroup[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { all: groups.length, applied: 0, oa: 0, video_interview: 0, interview: 0, rejected: 0, other: 0 };
  for (const g of groups) counts[emailStatus(g)]++;
  return counts;
}

// Cards that need something from you, then the ones already reflected in the
// tracker, each keeping its order.
export function splitByAction(groups: JobGroup[]): { action: JobGroup[]; nothing: JobGroup[] } {
  return {
    action: groups.filter((g) => category(g) !== "nothing"),
    nothing: groups.filter((g) => category(g) === "nothing"),
  };
}

export interface Review {
  groups: JobGroup[];
  rowIdOf: Map<string, string>; // Gmail id -> email_messages id
  muted: number; // pending emails hidden by a mute
}

export function buildReview(
  messages: EmailMessage[],
  mutes: Pick<EmailMute, "kind" | "value">[],
  applications: Application[],
  assessments: Assessment[],
  statusChanges: StatusChange[]
): Review {
  const rowIdOf = new Map<string, string>();
  const shown = [];
  let muted = 0;
  for (const row of messages) {
    if (row.state !== "pending") continue;
    const a = fromRow(row);
    if (isMuted(a, mutes)) {
      muted++;
      continue;
    }
    rowIdOf.set(row.gmail_id, row.id);
    shown.push(a);
  }
  return { groups: groupIntoJobs(shown, applications, assessments, statusChanges), rowIdOf, muted };
}

// Dismissed emails, newest first, for the "Dismissed" list where they can be
// restored.
export function dismissedEmails(messages: EmailMessage[]): EmailMessage[] {
  return messages
    .filter((m) => m.state === "dismissed")
    .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
}

export function countByCategory(groups: JobGroup[]): Record<ReviewFilter, number> {
  const counts: Record<ReviewFilter, number> = { all: groups.length, new: 0, updates: 0, pick: 0, nothing: 0 };
  for (const g of groups) counts[category(g)]++;
  return counts;
}
