"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import AssessmentDetail, { DifficultyDots, SourceTag } from "@/components/tracker/AssessmentDetail";
import { SortHeader, useSortedRows, type SortDir } from "@/components/tracker/sorting";
import type { Priority } from "@/lib/tracker/priority";
import { roleType, roleTypeLabel } from "@/lib/tracker/roles";
import type { Tracker } from "@/lib/tracker/useTracker";
import {
  OUTCOMES,
  formatDateTime,
  kindLabel,
  relativeDue,
  type Application,
  type Assessment,
  type Outcome,
  type Question,
} from "@/lib/tracker/format";

interface Props {
  assessments: Assessment[];
  applicationsById: Map<string, Application>;
  questionsByAssessment: Map<string, Question[]>;
  // Do-first rank per pending assessment (see lib/tracker/priority.ts).
  priority: Map<string, Priority>;
  expandedId: string | null;
  onToggle: (id: string) => void;
  onOpenApplication: (applicationId: string) => void;
  tracker: Tracker;
  now: number;
}

const thCls = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500";
const tdCls = "px-3 py-2 align-middle";

type SortKey = "priority" | "company" | "title" | "due" | "difficulty" | "result" | "questions";

const FIRST_DIR: Record<SortKey, SortDir> = {
  priority: "asc",
  company: "asc",
  title: "asc",
  due: "asc",
  difficulty: "desc",
  result: "asc",
  questions: "desc",
};

// Pending, then completed with no result yet, then passed, then failed.
function resultRank(a: Assessment): number {
  if (a.status !== "completed") return 0;
  return a.outcome === "passed" ? 2 : a.outcome === "failed" ? 3 : 1;
}

const HOVER_DELAY_MS = 350;
const PREVIEW_WIDTH = 384;

type Preview = { id: string; left: number; top: number; above: boolean };

export default function AssessmentsTable({
  assessments,
  applicationsById,
  questionsByAssessment,
  priority,
  expandedId,
  onToggle,
  onOpenApplication,
  tracker,
  now,
}: Props) {
  const value = useCallback(
    (a: Assessment, key: SortKey): string | number | null => {
      const app = applicationsById.get(a.application_id);
      switch (key) {
        case "priority":
          return priority.get(a.id)?.rank ?? null;
        case "company":
          return app ? `${app.company} ${app.role}` : null;
        case "title":
          return a.title;
        case "due":
          return a.due_at;
        case "difficulty":
          return a.difficulty;
        case "result":
          return resultRank(a);
        case "questions":
          return questionsByAssessment.get(a.id)?.length || null;
      }
    },
    [applicationsById, questionsByAssessment, priority]
  );
  // Default: what to do first. Unranked (done, or the application is closed)
  // go last.
  const { sort, setSort, sorted } = useSortedRows<Assessment, SortKey>(assessments, value, {
    key: "priority",
    dir: "asc",
  });

  // Hover preview: mouse only (touch has no hover), after a short delay so
  // sweeping the pointer across rows doesn't flash cards.
  const [preview, setPreview] = useState<Preview | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPreview = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPreview(null);
  }, []);
  useEffect(() => {
    if (!preview) return;
    window.addEventListener("scroll", clearPreview, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", clearPreview, { capture: true });
  }, [preview, clearPreview]);
  useEffect(() => clearPreview, [clearPreview]);

  function hover(e: React.PointerEvent<HTMLTableRowElement>, id: string) {
    if (e.pointerType !== "mouse" || expandedId === id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const above = rect.bottom + 280 > window.innerHeight && rect.top > 280;
      setPreview({
        id,
        left: Math.max(8, Math.min(rect.left + 32, window.innerWidth - PREVIEW_WIDTH - 8)),
        top: above ? rect.top - 4 : rect.bottom + 4,
        above,
      });
    }, HOVER_DELAY_MS);
  }

  if (assessments.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-500">No assessments or interviews match.</p>;
  }

  const header = (key: SortKey, label: string) => (
    <SortHeader sortKey={key} label={label} sort={sort} setSort={setSort} firstDir={FIRST_DIR[key]} className={thCls} />
  );
  const previewed = preview && assessments.find((a) => a.id === preview.id);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface dark:border-neutral-800">
        <table className="w-full min-w-3xl text-sm">
          <thead className="border-b border-neutral-200 dark:border-neutral-800">
            <tr>
              {header("priority", "Do first")}
              {header("company", "Company")}
              {header("title", "Assessment")}
              {header("due", "Due / when")}
              {header("difficulty", "Difficulty")}
              {header("result", "Result")}
              {header("questions", "Qs")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const app = applicationsById.get(a.application_id);
              const questions = questionsByAssessment.get(a.id) ?? [];
              const expanded = expandedId === a.id;
              const done = a.status === "completed";
              const overdue = !done && a.due_at && new Date(a.due_at).getTime() < now;
              const outcome = a.outcome ? OUTCOMES[a.outcome as Outcome] : null;
              const rank = priority.get(a.id);
              return (
                <Fragment key={a.id}>
                  <tr
                    id={`asmt-${a.id}`}
                    onClick={() => {
                      clearPreview();
                      onToggle(a.id);
                    }}
                    onPointerEnter={(e) => hover(e, a.id)}
                    onPointerLeave={clearPreview}
                    className={`cursor-pointer border-b border-neutral-100 transition-colors hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900 ${
                      expanded ? "bg-neutral-50 dark:bg-neutral-900" : ""
                    }`}
                  >
                    <td
                      className={`${tdCls} tabular-nums ${rank ? "font-medium" : "text-neutral-400"}`}
                      title={rank?.reason}
                    >
                      {rank ? `#${rank.rank}` : "—"}
                    </td>
                    <td className={`${tdCls} font-medium`}>
                      <span className="mr-1.5 inline-block w-3 text-neutral-400">{expanded ? "▾" : "▸"}</span>
                      {app?.company ?? "?"}
                      {app && (
                        <div className="pl-[1.125rem] text-xs font-normal text-neutral-500">
                          {app.role} · {roleTypeLabel(roleType(app.role))}
                        </div>
                      )}
                    </td>
                    <td className={tdCls}>
                      <span className={done ? "text-neutral-500" : ""}>
                        {a.important && <span className="text-amber-500">★ </span>}
                        {a.title}
                      </span>
                      <div className="text-xs text-neutral-500">
                        {kindLabel(a.kind)}
                        {a.duration_min != null && ` · ${a.duration_min} min`}
                      </div>
                    </td>
                    <td className={`${tdCls} tabular-nums`}>
                      {a.due_at ? (
                        <>
                          {formatDateTime(a.due_at)}
                          {!done && (
                            <div className={`text-xs ${overdue ? "text-red-600 dark:text-red-400" : "text-neutral-500"}`}>
                              {relativeDue(a.due_at, now)}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className={tdCls}>
                      {a.difficulty != null ? <DifficultyDots value={a.difficulty} /> : <span className="text-neutral-400">—</span>}
                    </td>
                    <td className={tdCls} onClick={(e) => e.stopPropagation()}>
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={done}
                          title="Completed"
                          onChange={(e) =>
                            tracker.updateAssessment(a.id, { status: e.target.checked ? "completed" : "pending" })
                          }
                        />
                        <span className={outcome?.cls ?? "text-neutral-500"}>
                          {outcome ? outcome.label : done ? "Done" : "Pending"}
                          {a.score && ` · ${a.score}`}
                        </span>
                      </label>
                    </td>
                    <td className={`${tdCls} tabular-nums text-neutral-500`}>{questions.length || "—"}</td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-neutral-200 dark:border-neutral-800">
                      <td colSpan={7} className="bg-background/50">
                        <AssessmentDetail
                          key={a.id}
                          assessment={a}
                          questions={questions}
                          tracker={tracker}
                          onOpenApplication={() => onOpenApplication(a.application_id)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview && previewed && (
        <PreviewCard
          assessment={previewed}
          app={applicationsById.get(previewed.application_id)}
          questions={questionsByAssessment.get(previewed.id) ?? []}
          style={{
            left: preview.left,
            top: preview.top,
            width: PREVIEW_WIDTH,
            transform: preview.above ? "translateY(-100%)" : undefined,
          }}
        />
      )}
    </>
  );
}

const PREVIEW_QUESTIONS = 4;

function PreviewCard({
  assessment: a,
  app,
  questions,
  style,
}: {
  assessment: Assessment;
  app: Application | undefined;
  questions: Question[];
  style: React.CSSProperties;
}) {
  const outcome = a.outcome ? OUTCOMES[a.outcome as Outcome] : null;
  const snippet = (label: string, text: string | null) =>
    text && (
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
        <p className="line-clamp-3 whitespace-pre-wrap">{text}</p>
      </div>
    );
  return (
    <div
      role="tooltip"
      style={style}
      className="pointer-events-none fixed z-40 max-w-[calc(100vw-1rem)] space-y-2 rounded-lg border border-neutral-200 bg-surface p-3 text-sm shadow-lg dark:border-neutral-800"
    >
      <div>
        <div className="font-medium">
          {kindLabel(a.kind)} · {a.title}
        </div>
        {app && (
          <div className="text-xs text-neutral-500">
            {app.company} · {app.role}
          </div>
        )}
      </div>
      {(a.difficulty != null || outcome || a.score || a.details) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
          {a.difficulty != null && <DifficultyDots value={a.difficulty} />}
          {outcome && <span className={outcome.cls}>{outcome.label}</span>}
          {a.score && <span>{a.score}</span>}
          {a.details && <span>{a.details}</span>}
        </div>
      )}
      {questions.length > 0 && (
        <ul className="space-y-1">
          {questions.slice(0, PREVIEW_QUESTIONS).map((q) => (
            <li key={q.id} className="flex items-start gap-1.5">
              <SourceTag source={q.source} />
              <span className="line-clamp-2">{q.question}</span>
            </li>
          ))}
          {questions.length > PREVIEW_QUESTIONS && (
            <li className="text-xs text-neutral-500">+{questions.length - PREVIEW_QUESTIONS} more</li>
          )}
        </ul>
      )}
      {snippet("Prep", a.prep_notes)}
      {snippet("Reflection", a.reflection)}
      {snippet("Notes", a.notes)}
      <div className="text-xs text-neutral-400">Click for everything</div>
    </div>
  );
}
