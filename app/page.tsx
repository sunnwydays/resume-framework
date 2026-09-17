"use client";

import { useState } from "react";
import InputSection from "@/components/InputSection";
import AtsResult from "@/components/AtsResult";
import { type AtsParseResponse } from "@/lib/types";

export default function Home() {
  const [resumeText, setResumeText] = useState("");
  const [resumePdf, setResumePdf] = useState<File | null>(null);
  const [atsResult, setAtsResult] = useState<AtsParseResponse | null>(null);

  return (
    <main className="flex-1 mx-auto w-full max-w-3xl px-5 sm:px-6 py-12 sm:py-16">
      <header className="mb-12">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Resume Framework
        </h1>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-400">
          Stage 1 of 3. Parse your resume the way an ATS would, and see exactly
          what it extracts.
        </p>
      </header>

      <div className="space-y-12">
        <InputSection
          resumeText={resumeText}
          setResumeText={setResumeText}
          resumePdf={resumePdf}
          setResumePdf={setResumePdf}
          setAtsResult={setAtsResult}
          disabled={false}
        />

        <AtsResult result={atsResult} />
      </div>
    </main>
  );
}
