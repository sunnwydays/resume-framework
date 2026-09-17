"use client";

import sample from "@/lib/mocks/affindaSample.json";
import { AtsParseResponse } from "@/lib/types";
import { useRef, useState } from "react";

interface Props {
  resumeText: string;
  setResumeText: (v: string) => void;
  resumePdf: File | null;
  setResumePdf: (v: File) => void;
  setAtsResult: (v: AtsParseResponse | null) => void;
  disabled: boolean;
}

type ResumeFormat = "pdf" | "text";

export default function InputSection({
  resumeText,
  setResumeText,
  resumePdf,
  setResumePdf,
  setAtsResult,
  disabled,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [resumeFormat, setResumeFormat] = useState<ResumeFormat>("text");
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
    const json: AtsParseResponse = await res.json();
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
        <div>
          <textarea
            className={inputCls}
            rows={12}
            placeholder="Paste your resume text here"
            value={resumeText}
            disabled={disabled}
            onChange={(e) => setResumeText(e.target.value)}
          />
          <p className="text-xs">
            Note: copy paste from PDF (or other document) renders differently
            from uploading the document directly. Text is quicker to iterate,
            but it might not be accurate. Parsing text seems to render a little
            better than PDF, but PDF is ultimately what you&apos;re submitting
            to the company.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            className="text-lg text-indigo-600 hover:underline disabled:opacity-50"
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
        className="text-md text-indigo-600 hover:underline disabled:opacity-50"
        disabled={
          disabled || (resumeFormat == "pdf" ? !resumePdf : !resumeText.trim())
        }
        onClick={runAtsParse}
      >
        Run ATS parse
      </button>

      {loading && <p>Loading...</p>}

      <button
        type="button"
        className="text-md text-indigo-600 hover:underline disabled:opacity-50 block"
        onClick={() => setAtsResult(sample)}
      >
        Load ats sample (dev)
      </button>
    </div>
  );
}
