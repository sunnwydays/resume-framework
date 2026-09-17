"use client";

import { useMemo, useState } from "react";
import InputSection from "@/components/InputSection";
import AtsResult, { SCROLL_MARGIN } from "@/components/AtsResult";
import SectionNav, { UPLOAD_ID } from "@/components/SectionNav";
import { buildAtsReport } from "@/lib/atsReport";
import { type AtsParseResponse } from "@/lib/types";

export default function Home() {
  const [resumeText, setResumeText] = useState("");
  const [resumePdf, setResumePdf] = useState<File | null>(null);
  const [atsResult, setAtsResult] = useState<AtsParseResponse | null>(null);

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
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Resume Framework
          </h1>
          <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-400">
            Stage 1 of 3. Parse your resume the way an ATS would, and see exactly
            what it extracts.
          </p>
        </header>

        {/* No wrapper: a sticky element can't stick past its parent, and the
            mobile strip needs the whole page as its parent. */}
        <SectionNav report={report} railClassName="lg:col-start-1 lg:row-start-2" />

        <div className="space-y-12 lg:col-start-2 lg:row-start-2">
          <section id={UPLOAD_ID} className={SCROLL_MARGIN}>
            <InputSection
              resumeText={resumeText}
              setResumeText={setResumeText}
              resumePdf={resumePdf}
              setResumePdf={setResumePdf}
              setAtsResult={setAtsResult}
              disabled={false}
            />
          </section>

          <AtsResult result={atsResult} report={report} />
        </div>
      </div>
    </main>
  );
}
