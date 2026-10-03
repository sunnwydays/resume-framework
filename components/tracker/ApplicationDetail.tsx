"use client";

import { useState } from "react";
import AssessmentDetail from "@/components/tracker/AssessmentDetail";
import AssessmentForm from "@/components/tracker/AssessmentForm";
import AssessmentSummary from "@/components/tracker/AssessmentSummary";
import type { Tracker } from "@/lib/tracker/useTracker";
import {
  buttonCls,
  formatDate,
  formatDateTime,
  fromDatetimeLocal,
  inputCls,
  kindLabel,
  primaryButtonCls,
  statusLabel,
  toDatetimeLocal,
  type Application,
  type Assessment,
  type Question,
  type StatusChange,
} from "@/lib/tracker/format";

interface Props {
  app: Application;
  assessments: Assessment[];
  questionsByAssessment: Map<string, Question[]>;
  changes: StatusChange[];
  tracker: Tracker;
}

const labelCls = "text-xs font-medium text-neutral-600 dark:text-neutral-400";
const headingCls = "text-xs font-semibold uppercase tracking-wide text-neutral-500";

export default function ApplicationDetail({ app, assessments, questionsByAssessment, changes, tracker }: Props) {
  const [draft, setDraft] = useState({
    company: app.company,
    role: app.role,
    location: app.location ?? "",
    url: app.url ?? "",
    applied_on: app.applied_on,
    notes: app.notes ?? "",
    description: app.description ?? "",
  });
  // null until edited, so it follows the live value if the status changes
  // while this panel is open.
  const [statusDate, setStatusDate] = useState<string | null>(null);
  const statusDateValue = statusDate ?? toDatetimeLocal(app.status_changed_at);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const dirty =
    draft.company !== app.company ||
    draft.role !== app.role ||
    draft.location !== (app.location ?? "") ||
    draft.url !== (app.url ?? "") ||
    draft.applied_on !== app.applied_on ||
    statusDateValue !== toDatetimeLocal(app.status_changed_at) ||
    draft.notes !== (app.notes ?? "") ||
    draft.description !== (app.description ?? "");

  function saveFields(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.company.trim() || !draft.role.trim()) return;
    tracker.updateApplication(app.id, {
      company: draft.company.trim(),
      role: draft.role.trim(),
      location: draft.location.trim() || null,
      url: draft.url.trim() || null,
      applied_on: draft.applied_on,
      ...(statusDate !== null && { status_changed_at: fromDatetimeLocal(statusDate) }),
      notes: draft.notes.trim() || null,
      description: draft.description.trim() || null,
    });
    setStatusDate(null);
  }

  const set = (key: keyof typeof draft) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  // The date of the current status is editable on the application row, so it
  // wins over the logged history row for that status.
  const currentChange = changes.findLastIndex((c) => c.status === app.status);

  const timeline = [
    ...changes.map((c, i) => ({
      key: c.id,
      at: i === currentChange ? app.status_changed_at : c.changed_at,
      text: i === 0 ? `Added as ${statusLabel(c.status)}` : `→ ${statusLabel(c.status)}`,
      origin: c.origin === "manual" ? null : c.origin,
    })),
    ...assessments
      .filter((a) => a.completed_at)
      .map((a) => ({
        key: `done-${a.id}`,
        at: a.completed_at,
        text: `Completed ${kindLabel(a.kind)}: ${a.title}`,
        origin: null,
      })),
  ].sort((a, b) => {
    if (!a.at) return 1;
    if (!b.at) return -1;
    return b.at.localeCompare(a.at);
  });

  const sortedAssessments = [...assessments].sort((a, b) =>
    (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999")
  );

  return (
    <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-6 min-w-0">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className={headingCls}>Assessments &amp; interviews</h3>
            {!adding && (
              <button type="button" onClick={() => setAdding(true)} className={buttonCls}>
                + Add
              </button>
            )}
          </div>
          {adding && (
            <AssessmentForm
              onCancel={() => setAdding(false)}
              onSubmit={async (fields) => {
                const created = await tracker.addAssessment({ ...fields, application_id: app.id });
                if (created) {
                  setAdding(false);
                  setOpenId(created.id);
                }
              }}
            />
          )}
          {sortedAssessments.length === 0 && !adding && <p className="text-sm text-neutral-500">None yet.</p>}
          <ul className="space-y-2">
            {sortedAssessments.map((a) => {
              const open = openId === a.id;
              const questions = questionsByAssessment.get(a.id) ?? [];
              return (
                <li key={a.id} className="rounded-md border border-neutral-200 bg-surface dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : a.id)}
                    aria-expanded={open}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    <span className="mt-0.5 inline-block w-3 text-neutral-400">{open ? "▾" : "▸"}</span>
                    <AssessmentSummary assessment={a} questionCount={questions.length} />
                  </button>
                  {open && (
                    <div className="border-t border-neutral-200 dark:border-neutral-800">
                      <AssessmentDetail key={a.id} assessment={a} questions={questions} tracker={tracker} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <form onSubmit={saveFields} className="space-y-3">
          <h3 className={headingCls}>Details</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelCls}>Company</span>
              <input value={draft.company} onChange={set("company")} required className={inputCls} />
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>Role</span>
              <input value={draft.role} onChange={set("role")} required className={inputCls} />
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>Location</span>
              <input value={draft.location} onChange={set("location")} className={inputCls} />
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>Applied</span>
              <input type="date" value={draft.applied_on} onChange={set("applied_on")} required className={inputCls} />
            </label>
            {app.status !== "applied" && (
              <label className="block space-y-1 sm:col-span-2">
                <span className={labelCls}>
                  {app.status === "rejected" ? "Rejected on" : `${statusLabel(app.status)} on`}
                </span>
                <input
                  type="datetime-local"
                  value={statusDateValue}
                  onChange={(e) => setStatusDate(e.target.value)}
                  className={inputCls}
                />
              </label>
            )}
            <label className="block space-y-1 sm:col-span-2">
              <span className={labelCls}>Link</span>
              <input value={draft.url} onChange={set("url")} className={inputCls} />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className={labelCls}>Notes</span>
              <textarea value={draft.notes} onChange={set("notes")} rows={2} className={inputCls} />
            </label>
          </div>
          <details>
            <summary className="cursor-pointer text-xs font-medium text-neutral-500">
              Job description {draft.description ? `(${draft.description.length} chars)` : "(empty)"}
            </summary>
            <textarea
              value={draft.description}
              onChange={set("description")}
              rows={10}
              className={`${inputCls} mt-2 font-mono text-xs`}
            />
          </details>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={!dirty} className={primaryButtonCls}>
              Save details
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Delete ${app.company} · ${app.role} and its assessments?`)) {
                  tracker.deleteApplication(app.id);
                }
              }}
              className="ml-auto text-sm text-red-600 underline dark:text-red-400"
            >
              Delete application
            </button>
          </div>
        </form>
      </div>

      <section className="space-y-2 min-w-0">
        <h3 className={headingCls}>Timeline</h3>
        <ol className="space-y-1.5 border-l border-neutral-200 dark:border-neutral-800 pl-3 text-sm">
          {timeline.map((t) => (
            <li key={t.key}>
              <span className="tabular-nums text-neutral-500">
                {t.at ? formatDateTime(t.at) : "date unknown"}
              </span>{" "}
              {t.text}
              {t.origin && (
                <span className="ml-1 text-xs text-neutral-400">({t.origin})</span>
              )}
            </li>
          ))}
          <li className="text-neutral-500">
            <span className="tabular-nums">{formatDate(app.applied_on)}</span> Applied
          </li>
        </ol>
      </section>
    </div>
  );
}
