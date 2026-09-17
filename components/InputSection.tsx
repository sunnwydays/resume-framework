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
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDroppedFile(f: File | undefined) {
    if (f && f.type === "application/pdf") {
      setResumePdf(f);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2.5 text-sm leading-relaxed transition-colors focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";

  function toggleCls(active: boolean) {
    return `px-3 py-1.5 rounded-md transition-colors ${
      active
        ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
        : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
    }`;
  }

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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold tracking-tight">Your resume</h3>
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-neutral-200 dark:border-neutral-800 p-0.5 text-xs font-medium">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setResumeFormat("text")}
            className={toggleCls(resumeFormat === "text")}
          >
            Text
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setResumeFormat("pdf")}
            className={toggleCls(resumeFormat === "pdf")}
          >
            PDF
          </button>
        </div>
      </div>

      {resumeFormat === "text" ? (
        <div className="space-y-2">
          <textarea
            className={inputCls}
            rows={12}
            placeholder="Paste your resume text here"
            value={resumeText}
            disabled={disabled}
            onChange={(e) => setResumeText(e.target.value)}
          />
          <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Note: copy paste from PDF (or other document) renders differently
            from uploading the document directly. Text is quicker to iterate,
            but it might not be accurate. Parsing text seems to render a little
            better than PDF, but PDF is ultimately what you&apos;re submitting
            to the company.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div
            className={`w-full rounded-xl border-2 border-dashed px-4 py-12 text-center transition-colors ${
              isDragOver
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                : "border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600"
            } ${disabled ? "opacity-50" : "cursor-pointer"}`}
            onClick={() => !disabled && fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!disabled) setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (disabled) return;
              handleDroppedFile(e.dataTransfer.files?.[0]);
            }}
          >
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Drag and drop your resume PDF here, or{" "}
              <span className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                click to browse
              </span>
            </p>
          </div>
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
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Uploaded resume PDF:{" "}
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {resumePdf ? resumePdf.name : "None"}
            </span>
          </p>
        </div>
      )}

      <div className="flex items-center gap-4 pt-1">
        <button
          type="button"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:disabled:hover:bg-neutral-100"
          disabled={
            disabled || (resumeFormat == "pdf" ? !resumePdf : !resumeText.trim())
          }
          onClick={runAtsParse}
        >
          Run ATS parse
        </button>

        {loading && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Loading&hellip;
          </p>
        )}
      </div>

      <button
        type="button"
        className="block text-xs font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 disabled:opacity-50"
        onClick={() => setAtsResult(sample)}
      >
        Load ats sample (dev)
      </button>
    </div>
  );
}
