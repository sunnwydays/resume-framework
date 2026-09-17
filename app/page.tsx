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
    <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-10 sm:py-14">
      <header className="mb-10 sm:mb-14 mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
          Stage 1 &middot; ATS Parser
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
          Resume Framework
        </h1>
        <p className="mt-3 max-w-xl text-base text-neutral-500 dark:text-neutral-400">
          Parse your resume the way an ATS would, and see exactly what it
          extracts.
        </p>
      </header>

      <div className="mx-auto max-w-3xl">
        <div className="space-y-10 min-w-0">
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
      </div>
    </main>
  );
}
