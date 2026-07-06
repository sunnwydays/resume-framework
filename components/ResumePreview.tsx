"use client";

import { forwardRef } from "react";
import type { ResumeJson } from "@/lib/types";

// Renders bullet text with [assumed]/[fabricated]/[TRIMMED] flags highlighted.
function Flagged({ text, showFlags }: { text: string; showFlags: boolean }) {
  if (!showFlags) {
    return <>{text.replace(/\s*\[(assumed|fabricated|TRIMMED)\]/gi, "")}</>;
  }
  const parts = text.split(/(\[(?:assumed|fabricated|TRIMMED)\])/gi);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[(assumed|fabricated|TRIMMED)\]$/i);
        if (!m) return <span key={i}>{part}</span>;
        const kind = m[1].toLowerCase();
        const cls =
          kind === "fabricated"
            ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
            : kind === "assumed"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
              : "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300";
        return (
          <span
            key={i}
            className={`mx-0.5 rounded px-1 py-px text-[10px] font-semibold uppercase align-middle ${cls}`}
            data-flag={kind}
          >
            {kind}
          </span>
        );
      })}
    </>
  );
}

interface Props {
  resume: ResumeJson;
  showFlags: boolean;
}

// forwardRef so the export button can hand the DOM node to html2pdf.
const ResumePreview = forwardRef<HTMLDivElement, Props>(function ResumePreview(
  { resume, showFlags },
  ref
) {
  return (
    <div
      ref={ref}
      className="bg-white text-neutral-900 rounded-lg shadow-sm border border-neutral-200 p-8 print:shadow-none"
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      {resume.name && (
        <h1 className="text-2xl font-bold tracking-tight text-center">
          {resume.name}
        </h1>
      )}
      {resume.contact && (
        <p className="text-center text-xs text-neutral-600 mt-1">
          {resume.contact}
        </p>
      )}

      <div className="mt-5">
        <h2 className="text-[13px] font-bold uppercase tracking-widest border-b border-neutral-300 pb-1 mb-2">
          Summary
        </h2>
        <p className="text-[13px] leading-relaxed">
          <Flagged text={resume.summary} showFlags={showFlags} />
        </p>
      </div>

      {resume.sections.map((sec) => (
        <div key={sec.title} className="mt-5">
          <h2 className="text-[13px] font-bold uppercase tracking-widest border-b border-neutral-300 pb-1 mb-2">
            {sec.title}
          </h2>
          <ul className="space-y-1.5">
            {sec.items.map((item, i) => (
              <li key={i} className="text-[13px] leading-relaxed pl-4 relative">
                <span className="absolute left-0">•</span>
                <Flagged text={item} showFlags={showFlags} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
});

export default ResumePreview;
