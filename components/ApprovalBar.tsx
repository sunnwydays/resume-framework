"use client";

import { useState } from "react";

interface Props {
  finalStatus: "approved" | "max_iterations_reached";
  onExportTxt: () => void;
  onExportPdf: () => void;
  onRevise: (feedback: string) => void;
  onSectionReview: () => void;
  pdfBusy: boolean;
  disabled: boolean;
}

export default function ApprovalBar({
  finalStatus,
  onExportTxt,
  onExportPdf,
  onRevise,
  onSectionReview,
  pdfBusy,
  disabled,
}: Props) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
      <p className="text-sm">
        {finalStatus === "approved" ? (
          <span className="font-medium text-emerald-600">
            ✓ The recruiter approved this version.
          </span>
        ) : (
          <span className="font-medium text-amber-600">
            Max iterations reached — this is the best version. Remaining flags
            are shown in the iteration log.
          </span>
        )}{" "}
        Your call now.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          onClick={onExportTxt}
          disabled={disabled}
        >
          Export .txt (ATS-safe)
        </button>
        <button
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          onClick={onExportPdf}
          disabled={disabled || pdfBusy}
        >
          {pdfBusy ? "Generating PDF…" : "Export PDF"}
        </button>
        <button
          className="rounded bg-neutral-200 dark:bg-neutral-800 px-3 py-1.5 text-sm font-medium hover:bg-neutral-300 dark:hover:bg-neutral-700 disabled:opacity-50"
          onClick={() => setShowFeedback((v) => !v)}
          disabled={disabled}
        >
          Revise with feedback
        </button>
        <button
          className="rounded bg-neutral-200 dark:bg-neutral-800 px-3 py-1.5 text-sm font-medium hover:bg-neutral-300 dark:hover:bg-neutral-700 disabled:opacity-50"
          onClick={onSectionReview}
          disabled={disabled}
        >
          Section-by-section review
        </button>
      </div>
      <p className="text-[11px] text-neutral-500">
        Exports strip the [assumed]/[fabricated]/[TRIMMED] markers — review
        them in the preview first. Complex styling may not survive PDF
        conversion perfectly.
      </p>

      {showFeedback && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm"
            rows={3}
            placeholder="What should change? e.g. Lead with the ML work, drop the internship, mention the team size…"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <button
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            disabled={disabled || !feedback.trim()}
            onClick={() => {
              onRevise(feedback.trim());
              setFeedback("");
              setShowFeedback(false);
            }}
          >
            Re-run pipeline with this feedback
          </button>
        </div>
      )}
    </div>
  );
}
