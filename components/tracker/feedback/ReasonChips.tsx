"use client";

import { useId, useState } from "react";
import { setFeedbackLabel } from "@/lib/tracker/feedback/client";
import type { FeedbackReason } from "@/lib/tracker/feedback/events";

interface Props {
  reasons: FeedbackReason[];
  // The feedback_events row to label. undefined while it's still being written:
  // the chips show but are disabled, so the banner doesn't change height when the
  // id arrives. null if the write failed, when there's nothing to label.
  feedbackId: string | null | undefined;
}

const chipClass = (on: boolean) =>
  `rounded-full border px-2 py-0.5 ${
    on ? "border-emerald-700 bg-emerald-200 dark:border-emerald-400 dark:bg-emerald-900" : "border-emerald-300 hover:bg-emerald-100 dark:border-emerald-800 dark:hover:bg-emerald-900"
  }`;
const inputClass = "rounded border border-emerald-300 bg-transparent px-1.5 py-0.5 dark:border-emerald-800";

// After a dismiss: optional chips, then (for a chip that names a derived value)
// a box for what it should have been, plus a free note, all written onto the
// event. Chips are in two groups: the app got something wrong (rules to tune),
// or it's just not for me (taste, tucked behind a toggle). Skipping all of it is
// fine, the event is already saved without a reason.
export default function ReasonChips({ reasons, feedbackId }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const [fix, setFix] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [showTaste, setShowTaste] = useState(false);
  const listId = useId();

  if (feedbackId === null) return null;
  const pending = feedbackId === undefined;

  const wrong = reasons.filter((r) => r.rule !== "taste");
  const taste = reasons.filter((r) => r.rule === "taste");
  const current = reasons.find((r) => r.key === picked);
  const tasteOpen = showTaste || taste.some((r) => r.key === picked);

  const save = (next: { reason?: string | null; fix?: string; note?: string }) => {
    const reason = next.reason === undefined ? picked : next.reason;
    const field = reasons.find((r) => r.key === reason)?.field;
    setSaved(false);
    setFeedbackLabel(feedbackId, { reason, note: next.note ?? note, field, correction: next.fix ?? fix }).then(() => setSaved(true));
  };

  const chip = (r: FeedbackReason) => (
    <button
      key={r.key}
      type="button"
      aria-pressed={picked === r.key}
      disabled={pending}
      onClick={() => {
        setPicked(r.key);
        setFix("");
        save({ reason: r.key, fix: "" });
      }}
      className={chipClass(picked === r.key)}
    >
      {r.label}
    </button>
  );

  return (
    <span className={`flex basis-full flex-col gap-1.5 text-xs ${pending ? "opacity-60" : ""}`}>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="opacity-70">The app got it wrong:</span>
        {wrong.map(chip)}
      </span>
      {taste.length > 0 && (
        <span className="flex flex-wrap items-center gap-1.5">
          <button type="button" aria-expanded={tasteOpen} onClick={() => setShowTaste((v) => !v)} className="underline opacity-70">
            Not for me {tasteOpen ? "▴" : "▾"}
          </button>
          {tasteOpen && taste.map(chip)}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-1.5">
        {current?.field && (
          <>
            <span className="opacity-70">Should be:</span>
            <input
              value={fix}
              list={current.fixSuggestions ? listId : undefined}
              onChange={(e) => setFix(e.target.value)}
              onBlur={() => fix.trim() && save({ fix })}
              onKeyDown={(e) => e.key === "Enter" && fix.trim() && save({ fix })}
              placeholder={current.fixPlaceholder ?? "the right value"}
              aria-label={`What ${current.label} should have been`}
              className={`w-40 ${inputClass}`}
            />
            {current.fixSuggestions && (
              <datalist id={listId}>
                {current.fixSuggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
          </>
        )}
        <input
          value={note}
          disabled={pending}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note.trim() && save({ reason: picked ?? "other", note })}
          onKeyDown={(e) => e.key === "Enter" && note.trim() && save({ reason: picked ?? "other", note })}
          placeholder="or say why"
          aria-label="Why, in your own words"
          className={`w-48 ${inputClass}`}
        />
        {saved && <span className="opacity-70">Saved</span>}
      </span>
    </span>
  );
}
