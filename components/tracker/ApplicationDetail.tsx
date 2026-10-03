"use client";

import { useState } from "react";
import AssessmentForm from "@/components/tracker/AssessmentForm";
import type { Tracker } from "@/lib/tracker/useTracker";
import {
  buttonCls,
  formatDate,
  formatDateTime,
  inputCls,
  kindLabel,
  primaryButtonCls,
  statusLabel,
  type Application,
  type Assessment,
  type StatusChange,
} from "@/lib/tracker/format";

interface Props {
  app: Application;
  assessments: Assessment[];
  changes: StatusChange[];
  tracker: Tracker;
}

const labelCls = "text-xs font-medium text-neutral-600 dark:text-neutral-400";
const headingCls = "text-xs font-semibold uppercase tracking-wide text-neutral-500";

export default function ApplicationDetail({ app, assessments, changes, tracker }: Props) {
  const [draft, setDraft] = useState({
    company: app.company,
    role: app.role,
    location: app.location ?? "",
    url: app.url ?? "",
    applied_on: app.applied_on,
    notes: app.notes ?? "",
    description: app.description ?? "",
  });
  // null = closed, "new" = adding, else the id being edited
  const [editing, setEditing] = useState<string | null>(null);

  const dirty =
    draft.company !== app.company ||
    draft.role !== app.role ||
    draft.location !== (app.location ?? "") ||
    draft.url !== (app.url ?? "") ||
    draft.applied_on !== app.applied_on ||
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
      notes: draft.notes.trim() || null,
      description: draft.description.trim() || null,
    });
  }

  const set = (key: keyof typeof draft) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  const timeline = [
    ...changes.map((c, i) => ({
      key: c.id,
      at: c.changed_at,
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
            {editing === null && (
              <button type="button" onClick={() => setEditing("new")} className={buttonCls}>
                + Add
              </button>
            )}
          </div>
          {editing === "new" && (
            <AssessmentForm
              onCancel={() => setEditing(null)}
              onSubmit={async (fields) => {
                if (await tracker.addAssessment({ ...fields, application_id: app.id })) {
                  setEditing(null);
                }
              }}
            />
          )}
          {sortedAssessments.length === 0 && editing !== "new" && (
            <p className="text-sm text-neutral-500">None yet.</p>
          )}
          <ul className="space-y-2">
            {sortedAssessments.map((a) =>
              editing === a.id ? (
                <li key={a.id}>
                  <AssessmentForm
                    initial={a}
                    onCancel={() => setEditing(null)}
                    onSubmit={async (fields) => {
                      await tracker.updateAssessment(a.id, fields);
                      setEditing(null);
                    }}
                  />
                </li>
              ) : (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-md border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    title="Completed"
                    checked={a.status === "completed"}
                    onChange={(e) =>
                      tracker.updateAssessment(a.id, {
                        status: e.target.checked ? "completed" : "pending",
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className={a.status === "completed" ? "text-neutral-500 line-through" : ""}>
                      {a.important && <span className="text-amber-500" title="Important">★ </span>}
                      <span className="font-medium">{kindLabel(a.kind)}</span>
                      {" · "}
                      {a.title}
                    </div>
                    <div className="text-xs text-neutral-500 space-x-2">
                      {a.due_at && <span>{a.kind === "oa" ? "Due" : "At"} {formatDateTime(a.due_at)}</span>}
                      {a.duration_min != null && <span>{a.duration_min} min</span>}
                      {a.interviewer && <span>with {a.interviewer}</span>}
                      {a.details && <span>{a.details}</span>}
                      {a.link && (
                        <a href={a.link} target="_blank" rel="noopener noreferrer" className="underline">
                          link
                        </a>
                      )}
                    </div>
                    {a.notes && <div className="text-xs text-neutral-500">{a.notes}</div>}
                  </div>
                  <div className="flex shrink-0 gap-2 text-xs">
                    <button type="button" onClick={() => setEditing(a.id)} className="underline text-neutral-500">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete "${a.title}"?`)) tracker.deleteAssessment(a.id);
                      }}
                      className="underline text-red-600 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              )
            )}
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
