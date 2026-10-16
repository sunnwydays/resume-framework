import { toJson, type FeedbackInsert } from "@/lib/tracker/feedback/events";

// 0 = identical, 1 = nothing in common. A cheap word-level estimate of how much
// Sunny rewrote: the share of the longer text's words that aren't in the shorter.
export function editRatio(ai: string, sent: string): number {
  const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean);
  const a = words(ai);
  const b = words(sent);
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length === 0) return 0;
  const pool = new Map<string, number>();
  for (const w of short) pool.set(w, (pool.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of long) {
    const n = pool.get(w) ?? 0;
    if (n > 0) {
      shared++;
      pool.set(w, n - 1);
    }
  }
  return Math.round((1 - shared / long.length) * 100) / 100;
}

// The Claude draft against the text Sunny actually logged as sent. Skipped by
// the caller when there was no AI draft.
export function draftFeedback(aiDraft: string, sent: string, meta: Record<string, unknown>): FeedbackInsert {
  const changed = aiDraft.trim() !== sent.trim();
  return {
    surface: "draft",
    action: "sent",
    subject_id: typeof meta.moveId === "string" ? meta.moveId : null,
    guess: toJson({ text: aiDraft }),
    final: toJson({ text: sent, edit_ratio: editRatio(aiDraft, sent) }),
    changed: changed ? ["text"] : [],
    context: toJson(meta),
  };
}
