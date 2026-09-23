"use client";

import { useEffect, useMemo, useState } from "react";
import InputSection from "@/components/InputSection";
import AtsResult, { SCROLL_MARGIN } from "@/components/AtsResult";
import PdfPreview from "@/components/PdfPreview";
import SectionNav, { UPLOAD_ID } from "@/components/SectionNav";
import { buildAtsReport } from "@/lib/atsReport";
import { SampleResume } from "@/lib/samples";
import { type AtsParseResponse } from "@/lib/types";

const STAGES = [
  { label: "1. ATS Parser", detail: "Parse + display, transparency-first." },
  { label: "2. Crafting Bench", detail: "Guided, step-by-step manual + AI resume revision." },
  { label: "3. Fine Revision", detail: "A narrow JD-keyword pass with AI." },
] as const;

export default function Home() {
  const [resumeText, setResumeText] = useState("");
  const [resumePdf, setResumePdf] = useState<File | null>(null);
  const [atsResult, setAtsResult] = useState<AtsParseResponse | null>(null);

  // Feeds <PdfPreview>. For an upload this is a blob: URL derived below; for
  // a loaded sample it's a static /samples/... path set directly.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string | undefined>();

  // Only the upload flow produces a blob URL that needs creating/revoking.
  // A sample's previewUrl is a plain static path set by handleLoadSample,
  // so this effect leaves it alone until resumePdf actually changes.
  useEffect(() => {
    if (!resumePdf) return;
    const url = URL.createObjectURL(resumePdf);
    setPreviewUrl(url);
    setPreviewFileName(resumePdf.name);
    return () => URL.revokeObjectURL(url);
  }, [resumePdf]);

  function handleLoadSample(sample: SampleResume) {
    // Only needed for the upload -> sample transition: resumePdf isn't
    // changing, so the effect above won't fire to revoke the stale blob URL.
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    // Clear any queued upload/text input so a leftover "Run ATS parse"
    // click can't silently reparse it and overwrite the sample's result
    // while the preview still shows the sample PDF.
    setResumeText("");
    setResumePdf(null);
    setAtsResult(sample.result);
    setPreviewUrl(sample.pdfPath);
    setPreviewFileName(sample.fileName);
  }

  // Reviewed + graded once here so the nav badges and the full breakdown
  // are reading the same numbers.
  const report = useMemo(
    () =>
      atsResult && !("error" in atsResult) ? buildAtsReport(atsResult) : null,
    [atsResult]
  );

  return (
    <main className="flex-1 mx-auto w-full max-w-3xl lg:max-w-[64rem] px-5 sm:px-6 py-12 sm:py-16">
      {/* On lg+ the nav becomes a rail in a narrow left column, with the
          header and content sharing the right column so they stay aligned. */}
      <div className="lg:grid lg:grid-cols-[10rem_minmax(0,48rem)] lg:gap-x-10">
        <header className="mb-12 lg:col-start-2">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Resume Framework
            </h1>
            <a
              href="https://github.com/sunnwydays/resume-framework"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 shrink-0 text-sm text-neutral-500 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:decoration-neutral-700 dark:hover:text-neutral-100"
            >
              GitHub
            </a>
          </div>
          <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-400">
            Stage 1 of 3. Parse your resume the way an ATS would, and see exactly
            what it extracts.
          </p>
          <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {STAGES.map((stage, i) => (
              <li
                key={stage.label}
                title={stage.detail}
                className={
                  i === 0
                    ? "font-medium text-neutral-900 dark:text-neutral-100"
                    : "text-neutral-400 dark:text-neutral-600"
                }
              >
                {stage.label}
              </li>
            ))}
          </ol>
        </header>

        {/* No wrapper: a sticky element can't stick past its parent, and the
            mobile strip needs the whole page as its parent. */}
        <SectionNav report={report} railClassName="lg:col-start-1 lg:row-start-2" />

        <div className="space-y-12 lg:col-start-2 lg:row-start-2">
          <section id={UPLOAD_ID} className={`space-y-6 ${SCROLL_MARGIN}`}>
            <InputSection
              resumeText={resumeText}
              setResumeText={setResumeText}
              resumePdf={resumePdf}
              setResumePdf={setResumePdf}
              setAtsResult={setAtsResult}
              onLoadSample={handleLoadSample}
              disabled={false}
            />
            {previewUrl && (
              <PdfPreview src={previewUrl} fileName={previewFileName} />
            )}
          </section>

          <AtsResult result={atsResult} report={report} />
        </div>
      </div>
    </main>
  );
}
