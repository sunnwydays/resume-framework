"use client";

import { useRef, useState } from "react";
import type { Json } from "@/lib/tracker/database.types";
import {
  buildImportPlan,
  exportData,
  readSheets,
  toImportPayload,
  type AssessmentTarget,
  type ImportPlan,
} from "@/lib/tracker/io";
import { supabase } from "@/lib/tracker/useTracker";
import {
  buttonCls,
  formatDate,
  formatDateTime,
  kindLabel,
  primaryButtonCls,
  statusLabel,
  type Application,
  type Assessment,
} from "@/lib/tracker/format";

interface Props {
  applications: Application[];
  assessments: Assessment[];
  onImported: () => Promise<void>;
}

const thCls = "px-2 py-1.5 text-left text-xs font-semibold text-neutral-500";
const tdCls = "px-2 py-1.5 align-top";

const targetValue = (t: AssessmentTarget) =>
  t === null ? "" : "existing" in t ? `existing:${t.existing}` : `ref:${t.ref}`;

function parseTarget(value: string): AssessmentTarget {
  if (value.startsWith("existing:")) return { existing: value.slice(9) };
  if (value.startsWith("ref:")) return { ref: value.slice(4) };
  return null;
}

export default function ImportExport({ applications, assessments, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    try {
      const sheets = await readSheets(file);
      setFileName(file.name);
      setPlan(buildImportPlan(sheets, applications, assessments));
    } catch (e) {
      setMessage(`Couldn't read ${file.name}: ${(e as Error).message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function commit() {
    if (!plan) return;
    setBusy(true);
    const payload = toImportPayload(plan);
    const { data, error } = await supabase().rpc("import_rows", {
      payload: payload as unknown as Json,
    });
    setBusy(false);
    if (error) {
      setMessage(`Import failed (nothing was saved): ${error.message}`);
      return;
    }
    const counts = data as { applications: number; assessments: number };
    setPlan(null);
    setMessage(`Imported ${counts.applications} applications and ${counts.assessments} assessments.`);
    await onImported();
  }

  const updateApp = (i: number, include: boolean) =>
    setPlan((p) => p && { ...p, apps: p.apps.map((a, j) => (j === i ? { ...a, include } : a)) });
  const updateAssessment = (i: number, patch: Partial<ImportPlan["assessments"][number]>) =>
    setPlan(
      (p) => p && { ...p, assessments: p.assessments.map((a, j) => (j === i ? { ...a, ...patch } : a)) }
    );

  const payloadPreview = plan ? toImportPayload(plan) : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,.ods"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className={buttonCls}>
          Import
        </button>
        <button
          type="button"
          onClick={() => exportData("xlsx", applications, assessments)}
          className={buttonCls}
          disabled={applications.length === 0}
        >
          Export XLSX
        </button>
        <button
          type="button"
          onClick={() => exportData("csv", applications, assessments)}
          className={buttonCls}
          disabled={applications.length === 0}
        >
          Export CSV
        </button>
      </div>
      {message && <p className="basis-full text-sm text-neutral-600 dark:text-neutral-400">{message}</p>}

      {plan && payloadPreview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
          <div className="w-full max-w-5xl space-y-5 rounded-lg bg-surface p-5 shadow-xl">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">Import {fileName}</h2>
              <button type="button" onClick={() => setPlan(null)} className="text-sm text-neutral-500 underline">
                Cancel
              </button>
            </div>

            {plan.warnings.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-700 dark:text-amber-400">
                {plan.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                Applications ({payloadPreview.applications.length} of {plan.apps.length} selected)
              </h3>
              {plan.apps.length === 0 ? (
                <p className="text-sm text-neutral-500">No application rows found.</p>
              ) : (
                <div className="max-h-80 overflow-auto rounded border border-neutral-200 dark:border-neutral-800">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface">
                      <tr>
                        <th className={thCls} />
                        <th className={thCls}>Company</th>
                        <th className={thCls}>Role</th>
                        <th className={thCls}>Applied</th>
                        <th className={thCls}>Status</th>
                        <th className={thCls} />
                      </tr>
                    </thead>
                    <tbody>
                      {plan.apps.map((a, i) => (
                        <tr key={a.row.ref} className="border-t border-neutral-100 dark:border-neutral-900">
                          <td className={tdCls}>
                            <input
                              type="checkbox"
                              checked={a.include}
                              onChange={(e) => updateApp(i, e.target.checked)}
                            />
                          </td>
                          <td className={tdCls}>{a.row.company}</td>
                          <td className={tdCls}>{a.row.role}</td>
                          <td className={`${tdCls} tabular-nums`}>
                            {a.row.applied_on ? formatDate(a.row.applied_on) : "today"}
                          </td>
                          <td className={tdCls}>{statusLabel(a.row.status)}</td>
                          <td className={`${tdCls} text-xs`}>
                            {a.duplicateOf ? (
                              <span className="text-amber-700 dark:text-amber-400">already tracked</span>
                            ) : (
                              <span className="text-emerald-700 dark:text-emerald-400">new</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                Assessments ({payloadPreview.assessments.length} of {plan.assessments.length} selected)
              </h3>
              {plan.assessments.length === 0 ? (
                <p className="text-sm text-neutral-500">No assessment rows found.</p>
              ) : (
                <div className="max-h-80 overflow-auto rounded border border-neutral-200 dark:border-neutral-800">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface">
                      <tr>
                        <th className={thCls} />
                        <th className={thCls}>From file</th>
                        <th className={thCls}>Assessment</th>
                        <th className={thCls}>Due</th>
                        <th className={thCls}>Attach to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.assessments.map((a, i) => (
                        <tr key={i} className="border-t border-neutral-100 dark:border-neutral-900">
                          <td className={tdCls}>
                            <input
                              type="checkbox"
                              checked={a.include}
                              disabled={!a.target}
                              onChange={(e) => updateAssessment(i, { include: e.target.checked })}
                            />
                          </td>
                          <td className={tdCls}>
                            {a.company}
                            {a.role && <div className="text-xs text-neutral-500">{a.role}</div>}
                          </td>
                          <td className={tdCls}>
                            {kindLabel(a.row.kind)} · {a.row.title}
                            <div className="text-xs text-neutral-500">
                              {a.row.status === "completed" ? "Completed" : "Pending"}
                              {a.duplicate && " · already tracked"}
                            </div>
                          </td>
                          <td className={`${tdCls} tabular-nums`}>{formatDateTime(a.row.due_at)}</td>
                          <td className={tdCls}>
                            <select
                              value={targetValue(a.target)}
                              onChange={(e) => {
                                const target = parseTarget(e.target.value);
                                updateAssessment(i, { target, include: Boolean(target) });
                              }}
                              className={`max-w-56 rounded border bg-surface px-1.5 py-1 text-xs ${
                                a.target ? "border-neutral-300 dark:border-neutral-700" : "border-amber-400"
                              }`}
                            >
                              <option value="">
                                {a.match === "ambiguous" ? "— several matches, pick one —" : "— no match, pick or skip —"}
                              </option>
                              <optgroup label="New in this file">
                                {plan.apps
                                  .filter((p) => p.include)
                                  .map((p) => (
                                    <option key={p.row.ref} value={`ref:${p.row.ref}`}>
                                      {p.row.company} · {p.row.role}
                                    </option>
                                  ))}
                              </optgroup>
                              <optgroup label="Already tracked">
                                {applications.map((app) => (
                                  <option key={app.id} value={`existing:${app.id}`}>
                                    {app.company} · {app.role}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={commit}
                disabled={
                  busy ||
                  payloadPreview.applications.length + payloadPreview.assessments.length === 0
                }
                className={primaryButtonCls}
              >
                {busy
                  ? "Importing…"
                  : `Import ${payloadPreview.applications.length} applications, ${payloadPreview.assessments.length} assessments`}
              </button>
              <p className="text-xs text-neutral-500">
                Imported statuses keep their original dates (or none) instead of today&rsquo;s.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
