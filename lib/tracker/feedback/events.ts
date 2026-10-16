// Feedback events: one row each time Sunny corrects (or confirms) something the
// tracker guessed, so a batch review can tune the rules later. The shape and the
// reasons live here; the per-surface builders sit beside it. See
// docs/feedback-loop.md.

import type { Json, TablesInsert } from "@/lib/tracker/database.types";

// Mirrored by the feedback_events check constraints; change both together.
export const FEEDBACK_SURFACES = ["posting", "email", "import", "draft"] as const;
export const FEEDBACK_ACTIONS = ["dismiss", "restore", "save", "applied", "accept", "mute", "map", "sent", "edit"] as const;
export type FeedbackSurface = (typeof FEEDBACK_SURFACES)[number];
export type FeedbackAction = (typeof FEEDBACK_ACTIONS)[number];

export type FeedbackInsert = TablesInsert<"feedback_events"> & { surface: FeedbackSurface; action: FeedbackAction };

// A reason Sunny can attach to a dismiss. `rule` is the file to look at when it
// was the rules' fault; "taste" means a preference, not a rule miss.
// A reason that names a derived value (`field`, a key of the event's `guess`)
// lets Sunny type what it should have been; that lands in `final`.
export interface FeedbackReason {
  key: string;
  label: string;
  rule: string;
  field?: string;
  fixPlaceholder?: string;
  fixSuggestions?: string[];
}

// What the label step writes onto the event: the reason, the free note, and the
// correction as `final` + `changed` (cleared when there isn't one, so switching
// chips doesn't leave a stale correction behind).
export function labelUpdate(args: {
  reason: string | null;
  note?: string | null;
  field?: string | null;
  correction?: string | null;
}) {
  const fix = args.correction?.trim();
  return {
    reason: args.reason,
    note: args.note?.trim() || null,
    final: toJson(args.field && fix ? { [args.field]: fix } : {}),
    changed: args.field && fix ? [args.field] : [],
  };
}

// Plain data in, JSON-safe data out (drops undefined, turns Dates into strings).
export function toJson<T>(value: T): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}

// The top-level keys whose values differ, sorted.
export function changedKeys(guess: Record<string, unknown>, final: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(guess), ...Object.keys(final)]);
  return [...keys].filter((k) => JSON.stringify(guess[k] ?? null) !== JSON.stringify(final[k] ?? null)).sort();
}

// Which build made the guess, so a review can skip mistakes a later commit
// already fixed. Vercel exposes the SHA when system env vars are on.
export function appVersion(): string {
  return process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev";
}
