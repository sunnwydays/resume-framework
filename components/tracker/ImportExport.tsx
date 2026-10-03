"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Json } from "@/lib/tracker/database.types";
import {
  APP_FIELDS,
  ASSESSMENT_FIELDS,
  buildImportPlan,
  normalizeHeader,
  readSheets,
  toImportPayload,
  type ApplicationOption,
  type AssessmentTarget,
  type FieldSpec,
  type ImportOverrides,
  type ImportPlan,
  type RawSheet,
  type SheetKind,
  type SheetReport,
} from "@/lib/tracker/io";
import { downloadTemplate, exportData } from "@/lib/tracker/export";
import ApplicationPicker from "@/components/tracker/ApplicationPicker";
import ClearAllDialog from "@/components/tracker/ClearAllDialog";
import { supabase } from "@/lib/tracker/useTracker";
import {
  buttonCls,
  formatDate,
  formatDateTime,
  kindLabel,
  OUTCOMES,
  primaryButtonCls,
  statusLabel,
  type Application,
  type Assessment,
  type Question,
} from "@/lib/tracker/format";

interface Props {
  applications: Application[];
  assessments: Assessment[];
  questions: Question[];
  onImported: () => Promise<void>;
  // Deletes every application; resolves to an error message, or null.
  onClearAll: () => Promise<string | null>;
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

function GuideTable({
  title,
  spec,
}: {
  title: string;
  spec: Record<string, FieldSpec>;
}) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-neutral-500">{title}</h4>
      <table className="w-full text-sm">
        <tbody>
          {Object.values(spec).map((f) => (
            <tr
              key={f.label}
              className="border-t border-neutral-100 dark:border-neutral-900"
            >
              <td className={`${tdCls} whitespace-nowrap font-medium`}>
                {f.label}
              </td>
              <td className={`${tdCls} text-neutral-600 dark:text-neutral-400`}>
                {f.hint}
              </td>
              <td className={`${tdCls} text-xs text-neutral-500`}>
                {f.aliases
                  .filter((a) => a !== normalizeHeader(f.label))
                  .slice(0, 5)
                  .join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Suggested headers, with what each holds and other names that also work.
function ColumnGuide() {
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (!downloaded) return;
    const t = setTimeout(() => setDownloaded(false), 3000);
    return () => clearTimeout(t);
  }, [downloaded]);

  return (
    <div className="space-y-4">
      <GuideTable
        title="Applications sheet (also accepted: right column)"
        spec={APP_FIELDS}
      />
      <GuideTable
        title="Assessments sheet, optional (a sheet with a Type, Due or Duration column is read as assessments)"
        spec={ASSESSMENT_FIELDS}
      />
      <button
        type="button"
        onClick={async () => {
          await downloadTemplate();
          setDownloaded(true);
        }}
        className="text-sm underline"
        aria-live="polite"
      >
        {downloaded
          ? "Template downloaded ✓ (job-tracker-template.xlsx)"
          : "Download a template with these headers"}
      </button>
    </div>
  );
}

const KIND_OPTIONS: { value: SheetKind | "skip"; label: string }[] = [
  { value: "applications", label: "Applications" },
  { value: "assessments", label: "Assessments & interviews" },
  { value: "skip", label: "Skip this sheet" },
];

const selectCls =
  "w-full max-w-60 rounded border bg-surface px-1.5 py-1 text-sm";

// One sheet: how it's read, and a "goes to" picker for every column.
function SheetColumns({
  sheet,
  edited,
  onKind,
  onAssign,
  onReset,
}: {
  sheet: SheetReport;
  edited: boolean;
  onKind: (value: SheetKind | "skip") => void;
  onAssign: (column: number, key: string | null) => void;
  onReset: () => void;
}) {
  const spec = sheet.kind
    ? sheet.kind === "assessments"
      ? ASSESSMENT_FIELDS
      : APP_FIELDS
    : null;
  const fields = spec ? Object.entries(spec as Record<string, FieldSpec>) : [];
  return (
    <div className="space-y-2 rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="text-sm font-semibold">
          Sheet &ldquo;{sheet.name}&rdquo;
        </h4>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-neutral-500">Read as</span>
          <select
            value={sheet.kind ?? (sheet.problem ? "" : "skip")}
            onChange={(e) => onKind(e.target.value as SheetKind | "skip")}
            className="rounded border border-neutral-300 bg-surface px-1.5 py-1 text-sm dark:border-neutral-700"
          >
            {!sheet.kind && sheet.problem && (
              <option value="" disabled>
                — choose —
              </option>
            )}
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {edited && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-neutral-500 underline"
          >
            Reset to automatic
          </button>
        )}
      </div>

      {sheet.problem && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {sheet.problem}
          {!sheet.kind &&
            " Choose how to read it above to use its first row as the headers."}
        </p>
      )}

      {sheet.columns.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={thCls}>Column in your file</th>
              <th className={thCls}>Example</th>
              <th className={thCls}>Goes to</th>
            </tr>
          </thead>
          <tbody>
            {sheet.columns.map((c) => (
              <tr
                key={c.index}
                className="border-t border-neutral-100 dark:border-neutral-900"
              >
                <td className={`${tdCls} font-medium`}>{c.header}</td>
                <td
                  className={`${tdCls} max-w-48 truncate text-neutral-500`}
                  title={c.sample}
                >
                  {c.sample || "—"}
                </td>
                <td className={tdCls}>
                  <div className="flex items-center gap-2">
                    <select
                      value={c.key ?? ""}
                      onChange={(e) =>
                        onAssign(c.index, e.target.value || null)
                      }
                      className={`${selectCls} ${
                        c.guessed
                          ? "border-amber-400"
                          : c.key
                            ? "border-neutral-300 dark:border-neutral-700"
                            : "border-neutral-200 text-neutral-500 dark:border-neutral-800"
                      }`}
                    >
                      <option value="">Notes (kept as text)</option>
                      {fields.map(([key, f]) => (
                        <option key={key} value={key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    {c.guessed && (
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        guess
                      </span>
                    )}
                    {c.manual && (
                      <span className="text-xs text-sky-700 dark:text-sky-400">
                        changed
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function ImportExport({
  applications,
  assessments,
  questions,
  onImported,
  onClearAll,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  // Two steps after choosing a file: `sheets` set and `plan` null = checking
  // the columns; `plan` set = reviewing rows (frozen from the confirmed columns).
  const [sheets, setSheets] = useState<RawSheet[] | null>(null);
  const [overrides, setOverrides] = useState<ImportOverrides>({});
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const draft = useMemo(
    () =>
      sheets
        ? buildImportPlan(sheets, applications, assessments, overrides)
        : null,
    [sheets, applications, assessments, overrides],
  );

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    try {
      setSheets(await readSheets(file));
      setOverrides({});
      setPlan(null);
      setFileName(file.name);
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
    close();
    setMessage(
      `Imported ${counts.applications} applications and ${counts.assessments} assessments.`,
    );
    await onImported();
  }

  const updateApp = (i: number, include: boolean) =>
    setPlan(
      (p) =>
        p && {
          ...p,
          apps: p.apps.map((a, j) => (j === i ? { ...a, include } : a)),
        },
    );
  const updateAssessment = (
    i: number,
    patch: Partial<ImportPlan["assessments"][number]>,
  ) =>
    setPlan(
      (p) =>
        p && {
          ...p,
          assessments: p.assessments.map((a, j) =>
            j === i ? { ...a, ...patch } : a,
          ),
        },
    );

  const setSheetOverride = (
    name: string,
    patch: ImportOverrides[string] | null,
  ) =>
    setOverrides((o) => {
      const next = { ...o };
      if (patch) next[name] = patch;
      else delete next[name];
      return next;
    });

  // Point a column at a field. If another column already feeds that field the
  // two swap, so rearranging never leaves a field double-booked.
  function assignColumn(
    sheet: SheetReport,
    column: number,
    key: string | null,
  ) {
    const current = sheet.columns.find((c) => c.index === column)?.key ?? null;
    const holder = key
      ? sheet.columns.find((c) => c.key === key && c.index !== column)
      : undefined;
    const columns = { ...overrides[sheet.name]?.columns, [column]: key };
    if (holder) columns[holder.index] = current;
    setSheetOverride(sheet.name, { ...overrides[sheet.name], columns });
  }

  const payloadPreview = plan ? toImportPayload(plan) : null;
  // Everything an imported assessment could attach to: the file's own
  // (still-selected) applications, then the ones already tracked.
  const targetOptions = useMemo<ApplicationOption[]>(
    () =>
      plan
        ? [
            ...plan.apps
              .filter((p) => p.include)
              .map((p) => ({
                value: `ref:${p.row.ref}`,
                company: p.row.company,
                role: p.row.role,
                isNew: true,
              })),
            ...applications.map((a) => ({
              value: `existing:${a.id}`,
              company: a.company,
              role: a.role,
              isNew: false,
            })),
          ]
        : [],
    [plan, applications],
  );
  function close() {
    setOpen(false);
    setSheets(null);
    setOverrides({});
    setPlan(null);
  }
  const chooseFile = (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      className={sheets ? buttonCls : primaryButtonCls}
    >
      {sheets ? "Choose another file" : "Choose file"}
    </button>
  );
  const readable = draft?.sheets.some((s) => s.kind && !s.problem) ?? false;
  const sheetNotes = plan
    ? [
        ...plan.sheets
          .filter((s) => s.problem)
          .map((s) => `Sheet "${s.name}": ${s.problem} Skipped.`),
        ...plan.warnings,
      ]
    : [];

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
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setOpen(true);
          }}
          className={buttonCls}
        >
          Import
        </button>
        <button
          type="button"
          onClick={() =>
            exportData("xlsx", applications, assessments, questions)
          }
          className={buttonCls}
          disabled={applications.length === 0}
        >
          Export XLSX
        </button>
        <button
          type="button"
          onClick={() =>
            exportData("csv", applications, assessments, questions)
          }
          className={buttonCls}
          disabled={applications.length === 0}
        >
          Export CSV
        </button>
        <button
          type="button"
          onClick={() => setClearing(true)}
          className={`${buttonCls} border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950`}
          disabled={applications.length === 0}
        >
          Clear all…
        </button>
      </div>
      {message && !open && (
        <p className="basis-full text-sm text-neutral-600 dark:text-neutral-400">
          {message}
        </p>
      )}

      {clearing && (
        <ClearAllDialog
          applications={applications.length}
          assessments={assessments.length}
          questions={questions.length}
          onConfirm={async () => {
            const error = await onClearAll();
            if (!error) setMessage("Cleared all applications.");
            return error;
          }}
          onClose={() => setClearing(false)}
        />
      )}

      {open && !sheets && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
          <div className="w-full max-w-3xl space-y-4 rounded-lg bg-surface p-5 shadow-xl">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">Import a spreadsheet</h2>
              <button
                type="button"
                onClick={close}
                className="text-sm text-neutral-500 underline"
              >
                Cancel
              </button>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              CSV, XLSX or ODS. Your column names don&rsquo;t have to match
              exactly:
              <br />
              - close names, common synonyms and small typos are ok
              <br />
              - title rows above the headers are skipped
              <br />
              - unrecognized columns are kept in each row&rsquo;s notes
              <br />
              Before finalizing, you can check how every column was read, change
              them. For the surest match, rename your headers to the names
              below.
            </p>
            {message && (
              <p className="text-sm text-red-700 dark:text-red-400">
                {message}
              </p>
            )}
            <div className="flex items-center gap-3">{chooseFile}</div>
            <ColumnGuide />
          </div>
        </div>
      )}

      {sheets && draft && !plan && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
          <div className="w-full max-w-4xl space-y-4 rounded-lg bg-surface p-5 shadow-xl">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">
                Check the columns in {fileName}
              </h2>
              <div className="flex items-center gap-3">
                {chooseFile}
                <button
                  type="button"
                  onClick={close}
                  className="text-sm text-neutral-500 underline"
                >
                  Cancel
                </button>
              </div>
            </div>
            {message && (
              <p className="text-sm text-red-700 dark:text-red-400">
                {message}
              </p>
            )}
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Here&rsquo;s where each column of your file will go. Use the
              &ldquo;Goes to&rdquo; menus to fix any that are wrong: picking a
              field another column already uses swaps the two, and
              &ldquo;Notes&rdquo; keeps the column&rsquo;s text on each row as
              &ldquo;Header: value&rdquo;. Amber &ldquo;guess&rdquo; means the
              name was only close.
            </p>

            {draft.sheets.map((sheet) => {
              const o = overrides[sheet.name];
              return (
                <SheetColumns
                  key={sheet.name}
                  sheet={sheet}
                  edited={Boolean(
                    o?.kind || Object.keys(o?.columns ?? {}).length,
                  )}
                  onKind={(value) =>
                    setSheetOverride(
                      sheet.name,
                      value === sheet.autoKind ? null : { kind: value },
                    )
                  }
                  onAssign={(column, key) => assignColumn(sheet, column, key)}
                  onReset={() => setSheetOverride(sheet.name, null)}
                />
              );
            })}

            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Suggested column names
              </summary>
              <div className="mt-2">
                <ColumnGuide />
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setPlan(draft)}
                disabled={!readable}
                className={primaryButtonCls}
              >
                Continue
              </button>
              <p className="text-xs text-neutral-500">
                {readable
                  ? `Found ${draft.apps.length} applications and ${draft.assessments.length} assessments. Nothing is saved until the next step.`
                  : "No sheet can be read yet. Fix the sheets above."}
              </p>
            </div>
          </div>
        </div>
      )}

      {plan && payloadPreview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
          <div className="w-full max-w-5xl space-y-5 rounded-lg bg-surface p-5 shadow-xl">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">Import {fileName}</h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPlan(null)}
                  className={buttonCls}
                >
                  Back to columns
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="text-sm text-neutral-500 underline"
                >
                  Cancel
                </button>
              </div>
            </div>

            {sheetNotes.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-700 dark:text-amber-400">
                {sheetNotes.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                Applications ({payloadPreview.applications.length} of{" "}
                {plan.apps.length} selected)
              </h3>
              {plan.apps.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  No application rows found.
                </p>
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
                        <tr
                          key={a.row.ref}
                          className="border-t border-neutral-100 dark:border-neutral-900"
                        >
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
                            {formatDate(a.row.applied_on)}
                          </td>
                          <td className={tdCls}>{statusLabel(a.row.status)}</td>
                          <td className={`${tdCls} text-xs`}>
                            {a.duplicateOf ? (
                              <span className="text-amber-700 dark:text-amber-400">
                                already tracked
                              </span>
                            ) : (
                              <span className="text-emerald-700 dark:text-emerald-400">
                                new
                              </span>
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
                Assessments ({payloadPreview.assessments.length} of{" "}
                {plan.assessments.length} selected)
              </h3>
              {plan.assessments.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  No assessment rows found.
                </p>
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
                        <tr
                          key={i}
                          className="border-t border-neutral-100 dark:border-neutral-900"
                        >
                          <td className={tdCls}>
                            <input
                              type="checkbox"
                              checked={a.include}
                              disabled={!a.target}
                              onChange={(e) =>
                                updateAssessment(i, {
                                  include: e.target.checked,
                                })
                              }
                            />
                          </td>
                          <td className={tdCls}>
                            {a.company}
                            {a.role && (
                              <div className="text-xs text-neutral-500">
                                {a.role}
                              </div>
                            )}
                          </td>
                          <td className={tdCls}>
                            {kindLabel(a.row.kind)} · {a.row.title}
                            <div className="text-xs text-neutral-500">
                              {a.row.status === "completed"
                                ? "Completed"
                                : "Pending"}
                              {a.row.outcome &&
                                ` · ${OUTCOMES[a.row.outcome].label}`}
                              {a.row.difficulty !== null &&
                                ` · difficulty ${a.row.difficulty}/5`}
                              {a.row.questions.length > 0 &&
                                ` · ${a.row.questions.length} question${a.row.questions.length === 1 ? "" : "s"}`}
                              {a.duplicate && " · already tracked"}
                            </div>
                          </td>
                          <td className={`${tdCls} tabular-nums`}>
                            {formatDateTime(a.row.due_at)}
                          </td>
                          <td className={tdCls}>
                            <ApplicationPicker
                              value={targetValue(a.target)}
                              options={targetOptions}
                              company={a.company}
                              role={a.role}
                              emptyLabel={
                                a.match === "ambiguous"
                                  ? "Several matches — pick one"
                                  : "No match — pick or skip"
                              }
                              onChange={(value) => {
                                const target = parseTarget(value);
                                updateAssessment(i, {
                                  target,
                                  include: Boolean(target),
                                });
                              }}
                            />
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
                  payloadPreview.applications.length +
                    payloadPreview.assessments.length ===
                    0
                }
                className={primaryButtonCls}
              >
                {busy
                  ? "Importing…"
                  : `Import ${payloadPreview.applications.length} applications, ${payloadPreview.assessments.length} assessments`}
              </button>
              <p className="text-xs text-neutral-500">
                Imported statuses keep their original dates (or none) instead of
                today&rsquo;s.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
