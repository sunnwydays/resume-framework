"use client";

import { useState } from "react";
import AssessmentForm from "@/components/tracker/AssessmentForm";
import type { Tracker } from "@/lib/tracker/useTracker";
import {
  OUTCOMES,
  QUESTION_SOURCES,
  buttonCls,
  formatDateTime,
  inputCls,
  kindLabel,
  primaryButtonCls,
  type Assessment,
  type Outcome,
  type Question,
  type QuestionSource,
} from "@/lib/tracker/format";

const labelCls = "text-xs font-medium text-neutral-600 dark:text-neutral-400";
const headingCls = "text-xs font-semibold uppercase tracking-wide text-neutral-500";

// 1–5 dots; clickable when onChange is given (clicking the current value
// clears it).
export function DifficultyDots({
  value,
  onChange,
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
}) {
  return (
    <span className="inline-flex items-center" aria-label={value ? `Difficulty ${value} of 5` : "No difficulty set"}>
      {[1, 2, 3, 4, 5].map((n) => {
        const dot = (
          <span
            className={`block h-2.5 w-2.5 rounded-full ${
              value !== null && n <= value
                ? "bg-neutral-700 dark:bg-neutral-300"
                : "bg-neutral-200 dark:bg-neutral-800"
            }`}
          />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            title={`Difficulty ${n}/5`}
            onClick={() => onChange(n === value ? null : n)}
            className="p-0.5"
          >
            {dot}
          </button>
        ) : (
          <span key={n} className="p-px">
            {dot}
          </span>
        );
      })}
    </span>
  );
}

export function SourceTag({ source }: { source: string }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
        source === "asked"
          ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300"
          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
      }`}
    >
      {QUESTION_SOURCES[source as QuestionSource] ?? source}
    </span>
  );
}

// A textarea that saves when you leave it, if it changed.
function NoteField({
  label,
  placeholder,
  value,
  rows = 4,
  onSave,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  rows?: number;
  onSave: (v: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  return (
    <label className="block space-y-1">
      <span className={labelCls}>{label}</span>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = draft.trim() || null;
          if (v !== value) onSave(v);
        }}
        rows={rows}
        placeholder={placeholder}
        className={inputCls}
      />
    </label>
  );
}

function QuestionItem({ q, tracker }: { q: Question; tracker: Tracker }) {
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(q.question);
  const [answer, setAnswer] = useState(q.answer ?? "");

  if (editing) {
    return (
      <li className="space-y-2 rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} className={inputCls} />
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={4}
          placeholder="Your answer / notes"
          className={inputCls}
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!question.trim()}
            onClick={() => {
              tracker.updateQuestion(q.id, { question: question.trim(), answer: answer.trim() || null });
              setEditing(false);
            }}
            className={primaryButtonCls}
          >
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className={buttonCls}>
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="group rounded-md border border-neutral-200 px-2.5 py-2 text-sm dark:border-neutral-800">
      <div className="flex items-start gap-2">
        <button
          type="button"
          title="Switch between expected and asked"
          onClick={() => tracker.updateQuestion(q.id, { source: q.source === "asked" ? "expected" : "asked" })}
          className="mt-px shrink-0"
        >
          <SourceTag source={q.source} />
        </button>
        <p className="min-w-0 flex-1 whitespace-pre-wrap font-medium">{q.question}</p>
        <div className="flex shrink-0 gap-2 text-xs">
          <button type="button" onClick={() => setEditing(true)} className="text-neutral-500 underline">
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Delete this question?")) tracker.deleteQuestion(q.id);
            }}
            className="text-red-600 underline dark:text-red-400"
          >
            Delete
          </button>
        </div>
      </div>
      {q.answer ? (
        <p className="mt-1 whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">{q.answer}</p>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="mt-1 text-xs text-neutral-400 underline">
          Add your answer
        </button>
      )}
    </li>
  );
}

function AddQuestion({ assessment, tracker }: { assessment: Assessment; tracker: Tracker }) {
  // After it's done, new questions are most likely ones that came up.
  const [source, setSource] = useState<QuestionSource>(assessment.status === "completed" ? "asked" : "expected");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setSaving(true);
    const ok = await tracker.addQuestion({
      assessment_id: assessment.id,
      source,
      question: question.trim(),
      answer: answer.trim() || null,
    });
    setSaving(false);
    if (ok) {
      setQuestion("");
      setAnswer("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-dashed border-neutral-300 p-2 dark:border-neutral-700">
      <div className="flex gap-2">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as QuestionSource)}
          className={`${inputCls} w-auto`}
          aria-label="Question type"
        >
          {Object.entries(QUESTION_SOURCES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={source === "asked" ? "A question they asked…" : "A question they might ask…"}
          className={inputCls}
        />
      </div>
      {question.trim() && (
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={3}
          placeholder="Your answer / notes (optional)"
          className={inputCls}
        />
      )}
      <button type="submit" disabled={saving || !question.trim()} className={buttonCls}>
        {saving ? "Adding…" : "Add question"}
      </button>
    </form>
  );
}

interface Props {
  assessment: Assessment;
  questions: Question[];
  tracker: Tracker;
  // Shown in the Assessments tab, where the application isn't on screen.
  onOpenApplication?: () => void;
}

// Everything about one OA / interview: facts, quick result controls,
// questions, and free-form prep / reflection / notes.
export default function AssessmentDetail({ assessment: a, questions, tracker, onOpenApplication }: Props) {
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(a.score ?? "");
  const update = (patch: Parameters<Tracker["updateAssessment"]>[1]) => tracker.updateAssessment(a.id, patch);
  const asked = questions.filter((q) => q.source === "asked").length;

  // Container query: the panel is narrower inside an application row than
  // in the Assessments tab.
  return (
    <div className="@container">
    <div className="grid gap-6 p-4 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0 space-y-5">
        {editing ? (
          <AssessmentForm
            initial={a}
            onCancel={() => setEditing(false)}
            onSubmit={async (fields) => {
              await update(fields);
              setEditing(false);
            }}
          />
        ) : (
          <section className="space-y-1 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p>
                <span className="font-medium">{kindLabel(a.kind)}</span> · {a.title}
              </p>
              <div className="flex shrink-0 gap-3 text-xs">
                {onOpenApplication && (
                  <button type="button" onClick={onOpenApplication} className="text-neutral-500 underline">
                    Open application
                  </button>
                )}
                <button type="button" onClick={() => setEditing(true)} className="text-neutral-500 underline">
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete "${a.title}" and its questions?`)) tracker.deleteAssessment(a.id);
                  }}
                  className="text-red-600 underline dark:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="space-x-3 text-neutral-600 dark:text-neutral-400">
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
              {a.interviewer && <span>with {a.interviewer}</span>}
              {a.link && (
                <a href={a.link} target="_blank" rel="noopener noreferrer" className="underline">
                  Open link
                </a>
              )}
            </p>
            {a.details && <p className="text-neutral-600 dark:text-neutral-400">{a.details}</p>}
          </section>
        )}

        <section className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={a.status === "completed"}
              onChange={(e) => update({ status: e.target.checked ? "completed" : "pending" })}
            />
            Completed
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={a.important} onChange={(e) => update({ important: e.target.checked })} />
            Important
          </label>
          <span className="flex items-center gap-1.5">
            <span className={labelCls}>Difficulty</span>
            <DifficultyDots value={a.difficulty} onChange={(difficulty) => update({ difficulty })} />
          </span>
          <label className="flex items-center gap-1.5">
            <span className={labelCls}>Outcome</span>
            <select
              value={a.outcome ?? ""}
              onChange={(e) => update({ outcome: (e.target.value || null) as Outcome | null })}
              className={`rounded border border-neutral-300 bg-surface px-1.5 py-0.5 text-sm dark:border-neutral-700 ${
                a.outcome ? OUTCOMES[a.outcome as Outcome]?.cls ?? "" : ""
              }`}
            >
              <option value="">—</option>
              {Object.entries(OUTCOMES).map(([value, o]) => (
                <option key={value} value={value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className={labelCls}>Score</span>
            <input
              value={score}
              onChange={(e) => setScore(e.target.value)}
              onBlur={() => {
                const v = score.trim() || null;
                if (v !== a.score) update({ score: v });
              }}
              placeholder="e.g. 800/850"
              className="w-28 rounded border border-neutral-300 bg-surface px-1.5 py-0.5 text-sm dark:border-neutral-700"
            />
          </label>
        </section>

        <section className="space-y-2">
          <h3 className={headingCls}>
            Questions{" "}
            {questions.length > 0 && (
              <span className="font-normal normal-case tracking-normal">
                ({questions.length - asked} expected, {asked} asked)
              </span>
            )}
          </h3>
          {questions.length > 0 && (
            <ul className="space-y-2">
              {questions.map((q) => (
                <QuestionItem key={q.id} q={q} tracker={tracker} />
              ))}
            </ul>
          )}
          <AddQuestion assessment={a} tracker={tracker} />
        </section>
      </div>

      <div className="min-w-0 space-y-4">
        <NoteField
          label="Prep notes & topics"
          placeholder="What to study: graphs, SQL joins, STAR stories…"
          value={a.prep_notes}
          rows={5}
          onSave={(prep_notes) => update({ prep_notes })}
        />
        <NoteField
          label="Reflection"
          placeholder="How it went, what to do differently next time"
          value={a.reflection}
          onSave={(reflection) => update({ reflection })}
        />
        <NoteField
          label="Notes"
          placeholder="Anything else"
          value={a.notes}
          rows={3}
          onSave={(notes) => update({ notes })}
        />
      </div>
    </div>
    </div>
  );
}
