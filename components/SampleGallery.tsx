"use client";

import PdfPreview from "@/components/PdfPreview";
import LatexPreview from "@/components/LatexPreview";
import { SAMPLE_RESUMES, SampleResume } from "@/lib/samples";
import { buildAtsReport } from "@/lib/atsReport";
import { TONE_STYLES } from "@/components/AtsResult";
import { useState } from "react";

interface Props {
  onLoadSample: (sample: SampleResume) => void;
  disabled: boolean;
}

// Public, always-visible gallery of pre-parsed sample resumes so a visitor
// (e.g. a recruiter) can see the app do something without bringing their
// own resume. Distinct from DevMockPanel: that one is dev-only and reads
// whatever's sitting in the gitignored lib/mocks; this one is a fixed,
// committed set meant for production.
export default function SampleGallery({ onLoadSample, disabled }: Props) {
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewingTexId, setPreviewingTexId] = useState<string | null>(null);

  if (SAMPLE_RESUMES.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        Or try a sample
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {SAMPLE_RESUMES.map((sample) => {
          const { grade } = buildAtsReport(sample.result);
          const tone = TONE_STYLES[grade.band.tone];
          const previewing = previewingId === sample.id;
          const previewingTex = previewingTexId === sample.id;

          return (
            <div
              key={sample.id}
              className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-surface p-3.5 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{sample.label}</p>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {sample.description}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${tone.text}`}>
                  {grade.score}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setPreviewingId(previewing ? null : sample.id)}
                  className="text-xs font-medium text-neutral-500 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-400 dark:decoration-neutral-700 dark:hover:text-neutral-100"
                >
                  {previewing ? "Hide PDF" : "View PDF"}
                </button>
                {sample.texPath && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setPreviewingTexId(previewingTex ? null : sample.id)}
                    className="text-xs font-medium text-neutral-500 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-400 dark:decoration-neutral-700 dark:hover:text-neutral-100"
                  >
                    {previewingTex ? "Hide LaTeX" : "View LaTeX"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onLoadSample(sample)}
                  className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-surface px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 disabled:opacity-50"
                >
                  Load sample
                </button>
              </div>

              {previewing && (
                <PdfPreview src={sample.pdfPath} fileName={sample.fileName} />
              )}

              {previewingTex && sample.texPath && (
                <LatexPreview src={sample.texPath} fileName={sample.texFileName} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
