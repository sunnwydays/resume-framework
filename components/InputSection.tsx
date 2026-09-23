"use client";

import DevMockPanel from "@/components/DevMockPanel";
import SampleGallery from "@/components/SampleGallery";
import { SampleResume } from "@/lib/samples";
import { AtsParseResponse } from "@/lib/types";
import { useRef, useState } from "react";

interface Props {
  resumeText: string;
  setResumeText: (v: string) => void;
  resumePdf: File | null;
  setResumePdf: (v: File) => void;
  setAtsResult: (v: AtsParseResponse | null) => void;
  onLoadSample: (sample: SampleResume) => void;
  disabled: boolean;
}

type ResumeFormat = "pdf" | "text";

export default function InputSection({
  resumeText,
  setResumeText,
  resumePdf,
  setResumePdf,
  setAtsResult,
  onLoadSample,
  disabled,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [resumeFormat, setResumeFormat] = useState<ResumeFormat>("pdf");
  const [loading, setLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDroppedFile(f: File | undefined) {
    if (f && f.type === "application/pdf") {
      setResumePdf(f);
    }
  }

  const inputCls =
    "w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-surface px-3.5 py-3 text-sm leading-relaxed placeholder:text-neutral-400 dark:placeholder:text-neutral-600 transition-colors focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-500 disabled:opacity-50";

  function toggleCls(active: boolean) {
    return `px-3 py-1 rounded transition-colors ${
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
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Your resume</h2>
        <div className="inline-flex items-center gap-0.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-surface p-0.5 text-xs font-medium">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setResumeFormat("pdf")}
            className={toggleCls(resumeFormat === "pdf")}
          >
            PDF
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setResumeFormat("text")}
            className={toggleCls(resumeFormat === "text")}
          >
            Text
          </button>
        </div>
      </div>

      {resumeFormat === "text" ? (
        <div className="space-y-2">
          <textarea
            className={inputCls}
            rows={14}
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
        <>
          <div
            className={`rounded-md border border-dashed px-4 py-10 text-center text-sm transition-colors ${
              isDragOver
                ? "border-neutral-900 bg-neutral-100 dark:border-neutral-100 dark:bg-neutral-900"
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
            {resumePdf ? (
              <>
                <p className="font-medium">{resumePdf.name}</p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Drop another PDF or click to replace
                </p>
              </>
            ) : (
              <>
                <p className="text-neutral-600 dark:text-neutral-400">
                  Drop your resume PDF here, or{" "}
                  <span className="font-medium text-neutral-900 dark:text-neutral-100 underline underline-offset-2">
                    browse
                  </span>
                </p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  PDF only
                </p>
              </>
            )}
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
        </>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:disabled:hover:bg-neutral-100"
          disabled={
            disabled ||
            (resumeFormat == "pdf" ? !resumePdf : !resumeText.trim())
          }
          onClick={runAtsParse}
        >
          Run ATS parse
        </button>

        {loading && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Parsing&hellip;
          </p>
        )}
      </div>

      <SampleGallery onLoadSample={onLoadSample} disabled={disabled} />

      <DevMockPanel setAtsResult={setAtsResult} disabled={disabled} />
    </section>
  );
}
