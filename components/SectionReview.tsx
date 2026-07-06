"use client";

import { useMemo, useState } from "react";
import { checkSectionTone } from "@/lib/pipeline";
import type { ResumeJson, SentimentResult, Settings } from "@/lib/types";

interface Props {
  resume: ResumeJson;
  settings: Settings;
  onDone: (updated: ResumeJson) => void;
  onCancel: () => void;
}

// Steps through Summary + each section; edits trigger a Sentiment pass on
// that section before the user finalizes it.
export default function SectionReview({ resume, settings, onDone, onCancel }: Props) {
  const steps = useMemo(
    () => ["Summary", ...resume.sections.map((s) => s.title)],
    [resume]
  );
  const [step, setStep] = useState(0);
  const [working, setWorking] = useState<ResumeJson>(resume);
  const [draft, setDraft] = useState<string>(resume.summary);
  const [dirty, setDirty] = useState(false);
  const [checking, setChecking] = useState(false);
  const [toneResult, setToneResult] = useState<SentimentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSummary = step === 0;
  const sectionIdx = step - 1;

  function loadStep(next: number, from: ResumeJson) {
    setStep(next);
    setDirty(false);
    setToneResult(null);
    setError(null);
    setDraft(
      next === 0 ? from.summary : from.sections[next - 1].items.join("\n")
    );
  }

  function applyDraft(): ResumeJson {
    if (isSummary) return { ...working, summary: draft.trim() };
    const sections = working.sections.map((s, i) =>
      i === sectionIdx
        ? { ...s, items: draft.split("\n").map((l) => l.trim()).filter(Boolean) }
        : s
    );
    return { ...working, sections };
  }

  async function next() {
    let updated = working;
    if (dirty) {
      updated = applyDraft();
      // Sentiment pass on the edited section only
      setChecking(true);
      setError(null);
      try {
        const scoped: ResumeJson = isSummary
          ? { summary: updated.summary, sections: [] }
          : { summary: "", sections: [updated.sections[sectionIdx]] };
        const result = await checkSectionTone(
          settings,
          scoped,
          new AbortController().signal
        );
        setToneResult(result);
        if (!result.tone_ok) {
          // Surface issues; user clicks Next again to accept anyway.
          setWorking(updated);
          setDirty(false);
          setChecking(false);
          return;
        }
      } catch (e) {
        setError((e as Error).message);
        setChecking(false);
        return;
      }
      setChecking(false);
    }
    setWorking(updated);
    if (step + 1 >= steps.length) {
      onDone(updated);
    } else {
      loadStep(step + 1, updated);
    }
  }

  return (
    <div className="rounded-lg border border-indigo-300 dark:border-indigo-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Section review: {steps[step]}{" "}
          <span className="font-normal text-neutral-500">
            ({step + 1}/{steps.length})
          </span>
        </h3>
        <button className="text-xs text-neutral-500 hover:underline" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <textarea
        className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm font-mono"
        rows={isSummary ? 4 : 10}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
          setToneResult(null);
        }}
      />
      {!isSummary && (
        <p className="text-[11px] text-neutral-500">One bullet per line.</p>
      )}

      {toneResult && !toneResult.tone_ok && (
        <div className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
          <p className="font-medium">Tone check flagged your edit (vibe {toneResult.vibe_match_score}/10):</p>
          <ul className="list-disc pl-4">
            {toneResult.issues.map((iss, i) => (
              <li key={i}>{iss}</li>
            ))}
          </ul>
          {toneResult.replacements.length > 0 && (
            <p>
              Suggestions:{" "}
              {toneResult.replacements
                .map((r) => `“${r.original}” → “${r.revised}”`)
                .join("; ")}
            </p>
          )}
          <p>Edit again, or press Next to keep it as-is.</p>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          onClick={next}
          disabled={checking}
        >
          {checking
            ? "Checking tone…"
            : step + 1 >= steps.length
              ? "Finish review"
              : "Next section"}
        </button>
      </div>
    </div>
  );
}
