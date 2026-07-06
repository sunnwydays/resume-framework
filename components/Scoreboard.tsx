"use client";

import type { RecruiterResult } from "@/lib/types";

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.max(0, Math.min(10, score)) * 10;
  const color =
    score >= 7 ? "bg-emerald-500" : score >= 5 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-0.5">
        <span>{label}</span>
        <span className="font-mono">{score}/10</span>
      </div>
      <div className="relative h-2 rounded bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        {/* approval threshold marker at 7 */}
        <div className="absolute top-0 h-full w-px bg-neutral-500/70" style={{ left: "70%" }} />
      </div>
    </div>
  );
}

export default function Scoreboard({ recruiter }: { recruiter: RecruiterResult }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <ScoreBar label="JD alignment" score={recruiter.scores.jd_alignment} />
        <ScoreBar label="Clarity" score={recruiter.scores.clarity} />
        <ScoreBar label="Impact" score={recruiter.scores.impact} />
        <ScoreBar label="ATS keywords" score={recruiter.scores.ats_keywords} />
      </div>
      {recruiter.section_scores.length > 0 && (
        <div className="text-[11px] text-neutral-600 dark:text-neutral-400 flex flex-wrap gap-x-3 gap-y-0.5 pt-1">
          {recruiter.section_scores.map((ss) => (
            <span key={ss.section}>
              {ss.section}:{" "}
              <span
                className={
                  ss.score >= 7 ? "text-emerald-600" : "text-amber-600"
                }
              >
                {ss.score}/10
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
