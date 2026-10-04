// What the "From Gmail" tab shows: pending stored emails, minus muted ones,
// grouped into one card per job against the current tracker data.
// Recomputed on every change, so accepting a card re-matches the rest.

import { groupIntoJobs, type JobGroup } from "@/lib/tracker/email/group";
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

export function countByCategory(groups: JobGroup[]): Record<ReviewFilter, number> {
  const counts: Record<ReviewFilter, number> = { all: groups.length, new: 0, updates: 0, pick: 0, nothing: 0 };
  for (const g of groups) counts[category(g)]++;
  return counts;
}
