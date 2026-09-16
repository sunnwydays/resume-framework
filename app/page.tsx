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
    <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">
          Resume Review Agent
        </h1>
        <p className="text-sm text-neutral-500">
          Parse your resume the way an ATS would, and see exactly what it
          extracts.
        </p>
      </header>

      <div className="mx-auto max-w-3xl">
        <div className="space-y-6 min-w-0">
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
