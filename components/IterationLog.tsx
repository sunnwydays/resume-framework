"use client";

import type { GapAnalysis, IterationRecord, KeywordExtraction } from "@/lib/types";
import Scoreboard from "./Scoreboard";

interface Props {
  keywords: KeywordExtraction | null;
  gap: GapAnalysis | null;
  iterations: IterationRecord[];
  phase: string | null;
  running: boolean;
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "ok" | "warn" | "bad" | "info" }) {
  const cls = {
    ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    bad: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    info: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  }[tone];
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

export default function IterationLog({ keywords, gap, iterations, phase, running }: Props) {
  return (
    <div className="space-y-4">
      {keywords && (
        <details className="rounded border border-neutral-200 dark:border-neutral-800 p-3" open={iterations.length === 0}>
          <summary className="text-xs font-semibold cursor-pointer">
            JD keywords ({keywords.keywords.length})
          </summary>
          <div className="mt-2 flex flex-wrap gap-1">
            {keywords.keywords.map((k) => (
              <Chip key={k} tone="info">{k}</Chip>
            ))}
          </div>
          {keywords.required_skills.length > 0 && (
            <p className="mt-2 text-[11px] text-neutral-500">
              Required: {keywords.required_skills.join(", ")}
            </p>
          )}
        </details>
      )}

      {gap && (
        <details className="rounded border border-neutral-200 dark:border-neutral-800 p-3" open={iterations.length === 0}>
          <summary className="text-xs font-semibold cursor-pointer">Gap analysis</summary>
          <div className="mt-2 space-y-1.5 text-[11px]">
            <p className="text-neutral-700 dark:text-neutral-300">{gap.strategic_brief}</p>
            {gap.present_but_undersold.length > 0 && (
              <p><Chip tone="warn">undersold</Chip> {gap.present_but_undersold.join("; ")}</p>
            )}
            {gap.missing_entirely.length > 0 && (
              <p><Chip tone="bad">missing</Chip> {gap.missing_entirely.join("; ")}</p>
            )}
            {gap.present_but_irrelevant.length > 0 && (
              <p><Chip tone="info">trim</Chip> {gap.present_but_irrelevant.join("; ")}</p>
            )}
          </div>
        </details>
      )}

      {iterations.map((rec) => (
        <div
          key={rec.iteration}
          className="rounded border border-neutral-200 dark:border-neutral-800 p-3 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold">Iteration {rec.iteration}</h4>
            {rec.recruiter &&
              (rec.recruiter.approved ? (
                <Chip tone="ok">recruiter approved</Chip>
              ) : (
                <Chip tone="warn">needs revision</Chip>
              ))}
          </div>

          {rec.recruiter && <Scoreboard recruiter={rec.recruiter} />}

          {rec.recruiter && rec.recruiter.critical_flags.length > 0 && (
            <p className="text-[11px] text-red-600">
              Critical: {rec.recruiter.critical_flags.join("; ")}
            </p>
          )}
          {rec.recruiter && rec.recruiter.missing_keywords.length > 0 && (
            <p className="text-[11px] text-neutral-500">
              Missing keywords: {rec.recruiter.missing_keywords.join(", ")}
            </p>
          )}
          {rec.recruiter && rec.recruiter.weak_bullets.length > 0 && (
            <details className="text-[11px]">
              <summary className="cursor-pointer text-neutral-600 dark:text-neutral-400">
                Weak bullets ({rec.recruiter.weak_bullets.length})
              </summary>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {rec.recruiter.weak_bullets.map((w, i) => (
                  <li key={i}>
                    <span className="font-medium">{w.section} #{w.index + 1}:</span> {w.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {rec.sentiment && (
            <div className="text-[11px] text-neutral-600 dark:text-neutral-400">
              Tone: {rec.sentiment.tone_ok ? <Chip tone="ok">ok</Chip> : <Chip tone="warn">reworked</Chip>}{" "}
              vibe {rec.sentiment.vibe_match_score}/10
              {rec.sentiment.issues.length > 0 && (
                <span> — {rec.sentiment.issues.join("; ")}</span>
              )}
              {rec.sentimentRerun && <span> (reviser re-ran with tone fixes)</span>}
            </div>
          )}

          {rec.styleFixes.length > 0 && (
            <details className="text-[11px]">
              <summary className="cursor-pointer text-neutral-600 dark:text-neutral-400">
                Style fixes applied ({rec.styleFixes.length})
              </summary>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {rec.styleFixes.map((f, i) => (
                  <li key={i}>
                    <span className="font-mono">{f.rule}</span>: “{f.before}” → “{f.after}”
                  </li>
                ))}
              </ul>
            </details>
          )}

          {rec.diff.length > 0 && (
            <details className="text-[11px]">
              <summary className="cursor-pointer text-neutral-600 dark:text-neutral-400">
                Changes from previous version ({rec.diff.length})
              </summary>
              <ul className="mt-1 space-y-1 pl-1">
                {rec.diff.map((d, i) => (
                  <li key={i}>
                    <Chip tone={d.kind === "added" ? "ok" : d.kind === "removed" ? "bad" : "info"}>
                      {d.kind}
                    </Chip>{" "}
                    <span className="font-medium">[{d.section}]</span>{" "}
                    {d.kind === "changed" ? (
                      <>
                        <span className="line-through opacity-60">{d.before}</span> → {d.after}
                      </>
                    ) : (
                      (d.after ?? d.before)
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}

      {running && phase && (
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          {phase}…
        </div>
      )}
    </div>
  );
}
