"use client";

import { useRef, useState } from "react";
import { extractPdfText } from "@/lib/pdfExtract";

interface Props {
  resumeText: string;
  setResumeText: (v: string) => void;
  extraDetails: string;
  setExtraDetails: (v: string) => void;
  jdText: string;
  setJdText: (v: string) => void;
  disabled: boolean;
}

export default function InputSection({
  resumeText,
  setResumeText,
  extraDetails,
  setExtraDetails,
  jdText,
  setJdText,
  disabled,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [jdUrl, setJdUrl] = useState("");
  const [jdBusy, setJdBusy] = useState(false);
  const [jdError, setJdError] = useState<string | null>(null);

  const inputCls =
    "w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm";

  async function onPdf(file: File) {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const text = await extractPdfText(file);
      if (text.length < 100) {
        setPdfError(
          "Very little text was extracted — this PDF may be scanned/image-based. Paste the text manually."
        );
      }
      setResumeText(text);
    } catch (e) {
      setPdfError(`Failed to read PDF: ${(e as Error).message}`);
    } finally {
      setPdfBusy(false);
    }
  }

  async function fetchJd() {
    if (!jdUrl.trim()) return;
    setJdBusy(true);
    setJdError(null);
    try {
      const res = await fetch("/api/fetch-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jdUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setJdText(json.text);
    } catch (e) {
      setJdError((e as Error).message);
    } finally {
      setJdBusy(false);
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Your resume</h3>
          <button
            type="button"
            className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
            disabled={disabled || pdfBusy}
            onClick={() => fileRef.current?.click()}
          >
            {pdfBusy ? "Reading PDF…" : "Upload PDF"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPdf(f);
              e.target.value = "";
            }}
          />
        </div>
        {pdfError && <p className="text-xs text-red-600">{pdfError}</p>}
        <textarea
          className={inputCls}
          rows={12}
          placeholder="Paste your resume text here, or upload a PDF…"
          value={resumeText}
          disabled={disabled}
          onChange={(e) => setResumeText(e.target.value)}
        />
        <div>
          <h3 className="text-sm font-semibold mb-1">
            Additional experience details{" "}
            <span className="font-normal text-neutral-500 text-xs">
              (optional)
            </span>
          </h3>
          <textarea
            className={inputCls}
            rows={4}
            placeholder="Anything not on the resume: projects, metrics, context, scope, tools used…"
            value={extraDetails}
            disabled={disabled}
            onChange={(e) => setExtraDetails(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Job description</h3>
        <div className="flex gap-2">
          <input
            type="url"
            className={inputCls}
            placeholder="https://… (paste a posting URL to fetch)"
            value={jdUrl}
            disabled={disabled || jdBusy}
            onChange={(e) => setJdUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchJd()}
          />
          <button
            type="button"
            className="shrink-0 rounded bg-neutral-200 dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium hover:bg-neutral-300 dark:hover:bg-neutral-700 disabled:opacity-50"
            disabled={disabled || jdBusy || !jdUrl.trim()}
            onClick={fetchJd}
          >
            {jdBusy ? "Fetching…" : "Fetch"}
          </button>
        </div>
        {jdError && <p className="text-xs text-red-600">{jdError}</p>}
        <textarea
          className={inputCls}
          rows={16}
          placeholder="…or paste the job description text here"
          value={jdText}
          disabled={disabled}
          onChange={(e) => setJdText(e.target.value)}
        />
        {jdText.trim().length > 0 && jdText.trim().length < 200 && (
          <p className="text-xs text-amber-600">
            This job description looks very short — results may be vague.
            Consider adding the key requirements/keywords you care about.
          </p>
        )}
      </div>
    </div>
  );
}
