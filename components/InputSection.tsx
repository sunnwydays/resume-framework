"use client";

import { useRef, useState } from "react";

interface Props {
  resumeText: string;
  setResumeText: (v: string) => void;
  resumePdf: File | null;
  setResumePdf: (v: File) => void;
  disabled: boolean;
}

type AtsParseResult = { error: string } | Record<string, unknown>;
type ResumeFormat = "pdf" | "text";

export default function InputSection({
  resumeText,
  setResumeText,
  resumePdf,
  setResumePdf,
  disabled,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [resumeFormat, setResumeFormat] = useState<ResumeFormat>("text");
  const [atsResult, setAtsResult] = useState<AtsParseResult | null>(null);
  const [loading, setLoading] = useState(false);

  const inputCls =
    "w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm";

  async function runAtsParse() {
    if (disabled || (resumeFormat == "pdf" ? !resumePdf : !resumeText.trim())) {
      return;
    }

    setLoading(true);
    const form = new FormData();

    if (resumeFormat == "pdf" && resumePdf) {
      form.append("file", resumePdf);
    } else {
      form.append("text", resumeText);
    }

    const res = await fetch("/api/ats-parse", { method: "POST", body: form });
    const json = await res.json();
    setAtsResult(json);
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Your resume</h3>
        <div className="flex items-center gap-4 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="resumeFormat"
              value="text"
              checked={resumeFormat === "text"}
              disabled={disabled}
              onChange={() => setResumeFormat("text")}
            />
            Text
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="resumeFormat"
              value="pdf"
              checked={resumeFormat === "pdf"}
              disabled={disabled}
              onChange={() => setResumeFormat("pdf")}
            />
            PDF
          </label>
        </div>
      </div>

      {resumeFormat === "text" ? (
        <textarea
          className={inputCls}
          rows={12}
          placeholder="Paste your resume text here"
          value={resumeText}
          disabled={disabled}
          onChange={(e) => setResumeText(e.target.value)}
        />
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
          >
            Upload PDF
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setResumePdf(f);
              e.target.value = "";
            }}
          />
          <p className="text-sm">
            Uploaded resume PDF:&nbsp;
            {resumePdf ? resumePdf.name : "None"}
          </p>
        </div>
      )}
      <button
        type="button"
        className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
        disabled={disabled || (resumeFormat == "pdf" ? !resumePdf : !resumeText.trim())}
        onClick={runAtsParse}
      >
        Run ATS parse
      </button>

      {loading && <p>Loading...</p>}

      {atsResult && (
        <pre className="text-xs overflow-auto max-h-96 bg-neutral-100 dark:bg-neutral-900 p-2 rounded">
          {JSON.stringify(atsResult, null, 2)}
        </pre>
      )}
    </div>
  );
}
