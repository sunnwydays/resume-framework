"use client";

import { useState } from "react";
import type { TablesInsert } from "@/lib/tracker/database.types";
import {
  ASSESSMENT_KINDS,
  buttonCls,
  fromDatetimeLocal,
  inputCls,
  primaryButtonCls,
  toDatetimeLocal,
  type Assessment,
  type AssessmentKind,
} from "@/lib/tracker/format";

type AssessmentFields = Omit<TablesInsert<"assessments">, "application_id">;

interface Props {
  initial?: Assessment;
  onSubmit: (fields: AssessmentFields) => Promise<unknown>;
  onCancel: () => void;
}

const labelCls = "text-xs font-medium text-neutral-600 dark:text-neutral-400";

export default function AssessmentForm({ initial, onSubmit, onCancel }: Props) {
  const [kind, setKind] = useState<AssessmentKind>(
    (initial?.kind as AssessmentKind) ?? "oa"
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [details, setDetails] = useState(initial?.details ?? "");
  const [duration, setDuration] = useState(initial?.duration_min?.toString() ?? "");
  const [dueAt, setDueAt] = useState(toDatetimeLocal(initial?.due_at));
  const [interviewer, setInterviewer] = useState(initial?.interviewer ?? "");
  const [link, setLink] = useState(initial?.link ?? "");
  const [important, setImportant] = useState(initial?.important ?? false);
  const [completed, setCompleted] = useState(initial?.status === "completed");
  const [completedAt, setCompletedAt] = useState(toDatetimeLocal(initial?.completed_at));
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const minutes = parseInt(duration, 10);
    await onSubmit({
      kind,
      title: title.trim() || ASSESSMENT_KINDS[kind],
      details: details.trim() || null,
      duration_min: Number.isFinite(minutes) ? minutes : null,
      due_at: fromDatetimeLocal(dueAt),
      interviewer: kind === "oa" ? null : interviewer.trim() || null,
      link: link.trim() || null,
      important,
      status: completed ? "completed" : "pending",
      // Blank on a new completion: the trigger stamps "now".
      completed_at: completed ? fromDatetimeLocal(completedAt) : null,
    });
    setSaving(false);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-md border border-neutral-200 dark:border-neutral-800 p-3"
    >
      <div className="grid gap-3 sm:grid-cols-6">
        <label className="block space-y-1 sm:col-span-2">
          <span className={labelCls}>Type</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as AssessmentKind)}
            className={inputCls}
          >
            {Object.entries(ASSESSMENT_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 sm:col-span-4">
          <span className={labelCls}>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`e.g. ${kind === "oa" ? "Coding Assessment (Ref: 131999)" : "Round 1"}`}
            className={inputCls}
            autoFocus
          />
        </label>
        <label className="block space-y-1 sm:col-span-3">
          <span className={labelCls}>{kind === "oa" ? "Due" : "Scheduled for"}</span>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block space-y-1 sm:col-span-1">
          <span className={labelCls}>Minutes</span>
          <input
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))}
            className={inputCls}
          />
        </label>
        {kind !== "oa" ? (
          <label className="block space-y-1 sm:col-span-2">
            <span className={labelCls}>Interviewer</span>
            <input
              value={interviewer}
              onChange={(e) => setInterviewer(e.target.value)}
              className={inputCls}
            />
          </label>
        ) : (
          <div className="hidden sm:block sm:col-span-2" />
        )}
        <label className="block space-y-1 sm:col-span-3">
          <span className={labelCls}>Breakdown / details</span>
          <input
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Coding (standard) + REST API"
            className={inputCls}
          />
        </label>
        <label className="block space-y-1 sm:col-span-3">
          <span className={labelCls}>Link</span>
          <input value={link} onChange={(e) => setLink(e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={important}
            onChange={(e) => setImportant(e.target.checked)}
          />
          Important
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={completed}
            onChange={(e) => setCompleted(e.target.checked)}
          />
          Completed
        </label>
        {completed && (
          <label className="flex items-center gap-1.5">
            <span className={labelCls}>{kind === "oa" ? "Submitted" : "Completed on"}</span>
            <input
              type="datetime-local"
              value={completedAt}
              onChange={(e) => setCompletedAt(e.target.value)}
              className={inputCls}
            />
          </label>
        )}
        <div className="ml-auto flex gap-2">
          <button type="submit" disabled={saving} className={primaryButtonCls}>
            {saving ? "Saving…" : initial ? "Save" : "Add"}
          </button>
          <button type="button" onClick={onCancel} className={buttonCls}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
