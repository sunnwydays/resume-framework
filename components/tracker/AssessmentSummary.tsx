import { DifficultyDots } from "@/components/tracker/AssessmentDetail";
import { OUTCOMES, formatDateTime, kindLabel, type Assessment, type Outcome } from "@/lib/tracker/format";

// One-line view of an OA / interview, for collapsed rows.
export default function AssessmentSummary({
  assessment: a,
  questionCount,
}: {
  assessment: Assessment;
  questionCount: number;
}) {
  const outcome = a.outcome ? OUTCOMES[a.outcome as Outcome] : null;
  return (
    <span className="min-w-0 flex-1">
      <span className={a.status === "completed" ? "text-neutral-500" : ""}>
        {a.important && <span className="text-amber-500" title="Important">★ </span>}
        <span className="font-medium">{kindLabel(a.kind)}</span> · {a.title}
        {a.status === "completed" && " ✓"}
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-neutral-500">
        {a.due_at && (
          <span>
            {a.kind === "oa" ? "Due" : "At"} {formatDateTime(a.due_at)}
          </span>
        )}
        {a.completed_at && (
          <span>
            {a.kind === "oa" ? "Submitted" : "Completed"} {formatDateTime(a.completed_at)}
          </span>
        )}
        {a.duration_min != null && <span>{a.duration_min} min</span>}
        {a.difficulty != null && <DifficultyDots value={a.difficulty} />}
        {outcome && (
          <span className={outcome.cls}>
            {outcome.label}
            {a.score && ` · ${a.score}`}
          </span>
        )}
        {!outcome && a.score && <span>{a.score}</span>}
        {questionCount > 0 && (
          <span>
            {questionCount} question{questionCount === 1 ? "" : "s"}
          </span>
        )}
      </span>
    </span>
  );
}
