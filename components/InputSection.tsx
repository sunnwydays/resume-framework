"use client";

import { useRef, useState } from "react";
import { extractPdfText } from "@/lib/pdfExtract";

interface Props {
  resumeText: string;
  setResumeText: (v: string) => void;
  disabled: boolean;
}

type AtsParseResult = { error: string } | Record<string, unknown>;

export default function InputSection({
  resumeText,
  setResumeText,
  disabled,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [atsResult, setAtsResult] = useState<AtsParseResult | null>(null);

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

    // Affinda call
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/ats-parse", { method: "POST", body: form });
    const json = await res.json();
    setAtsResult(json);
  }

  return (
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

      {atsResult && (
        <pre className="text-xs overflow-auto max-h-96 bg-neutral-100 dark:bg-neutral-900 p-2 rounded">
          {JSON.stringify(atsResult, null, 2)}
        </pre>
      )}
    </div>
  );
}
