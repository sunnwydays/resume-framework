// CSV/XLSX export and the blank template for the job tracker. CSV goes
// through SheetJS (plain rows); XLSX goes through ExcelJS because the
// community SheetJS build can't write styles. Both are dynamically imported
// so they only load when used.
//
// The XLSX has a summary block above each table (title, stat tiles, a few
// facts), so the header row isn't row 1. That's fine for re-import: the
// importer finds the header row among the first 15 rows, and nothing in the
// summary looks like a Company column. Keep the block short for that reason.

import type { CellValue, Workbook, Worksheet } from "exceljs";
import {
  ASSESSMENT_KINDS,
  OUTCOMES,
  STATUSES,
  kindLabel,
  statusLabel,
  todayISO,
  type Application,
  type Assessment,
  type Question,
  type QuestionSource,
  type StatusChange,
} from "@/lib/tracker/format";
import { APP_FIELDS, ASSESSMENT_FIELDS, type FieldSpec } from "@/lib/tracker/io";
import { applicationStats, assessmentStats, groupBy, pct, plural, type Fact } from "@/lib/tracker/stats";

// ------------------------------------------------------------------ rows

// Column names double as import aliases, so an export re-imports cleanly.
export function applicationRows(apps: Application[]) {
  return apps.map((a) => ({
    Company: a.company,
    Role: a.role,
    Link: a.url ?? "",
    Location: a.location ?? "",
    Applied: a.applied_on,
    Status: statusLabel(a.status),
    "Status changed": a.status_changed_at ?? "",
    Notes: a.notes ?? "",
    Description: a.description ?? "",
  }));
}

// One question per line, "question → answer"; parseQuestions reads it back.
const QUESTION_SEP = " → ";
function questionLines(questions: Question[], source: QuestionSource): string {
  return questions
    .filter((q) => q.source === source)
    .map((q) => q.question.replace(/\s+/g, " ") + (q.answer ? QUESTION_SEP + q.answer.replace(/\s*\n\s*/g, " / ") : ""))
    .join("\n");
}

export function assessmentRows(assessments: Assessment[], apps: Application[], questions: Question[]) {
  const byId = new Map(apps.map((a) => [a.id, a]));
  return assessments.map((s) => ({
    Company: byId.get(s.application_id)?.company ?? "",
    Role: byId.get(s.application_id)?.role ?? "",
    Type: kindLabel(s.kind),
    Title: s.title,
    Details: s.details ?? "",
    "Duration (min)": s.duration_min ?? "",
    Due: s.due_at ?? "",
    Interviewer: s.interviewer ?? "",
    Link: s.link ?? "",
    Important: s.important ? "yes" : "no",
    Status: s.status === "completed" ? "Completed" : "Pending",
    "Completed at": s.completed_at ?? "",
    Difficulty: s.difficulty ?? "",
    Outcome: s.outcome ? OUTCOMES[s.outcome as keyof typeof OUTCOMES].label : "",
    Score: s.score ?? "",
    "Prep notes": s.prep_notes ?? "",
    Reflection: s.reflection ?? "",
    "Expected questions": questionLines(questions.filter((q) => q.assessment_id === s.id), "expected"),
    "Asked questions": questionLines(questions.filter((q) => q.assessment_id === s.id), "asked"),
    Notes: s.notes ?? "",
  }));
}

// ------------------------------------------------------------------ layout

// How one column looks in the XLSX. `tag` columns get a colored pill-like
// fill per value (see TAGS); `wrap` columns wrap text, up to MAX_LINES tall.
interface Layout {
  width: number;
  format?: "date" | "datetime" | "link" | "wrap" | "number" | "tag";
}

const APP_LAYOUT: Record<string, Layout> = {
  Company: { width: 26 },
  Role: { width: 36 },
  Link: { width: 30, format: "link" },
  Location: { width: 20 },
  Applied: { width: 14, format: "date" },
  Status: { width: 16, format: "tag" },
  "Status changed": { width: 18, format: "datetime" },
  Notes: { width: 44, format: "wrap" },
  Description: { width: 44 },
};

const ASSESSMENT_LAYOUT: Record<string, Layout> = {
  Company: { width: 26 },
  Role: { width: 32 },
  Type: { width: 16, format: "tag" },
  Title: { width: 26 },
  Details: { width: 36, format: "wrap" },
  "Duration (min)": { width: 14, format: "number" },
  Due: { width: 18, format: "datetime" },
  Interviewer: { width: 20 },
  Link: { width: 30, format: "link" },
  Important: { width: 11 },
  Status: { width: 12 },
  "Completed at": { width: 18, format: "datetime" },
  Difficulty: { width: 11, format: "number" },
  Outcome: { width: 12, format: "tag" },
  Score: { width: 12 },
  "Prep notes": { width: 36, format: "wrap" },
  Reflection: { width: 36, format: "wrap" },
  "Expected questions": { width: 44, format: "wrap" },
  "Asked questions": { width: 44, format: "wrap" },
  Notes: { width: 36, format: "wrap" },
};

// Fills match the badges in the app (STATUS_META / OUTCOMES), light only.
const TAGS: Record<string, { bg: string; fg: string }> = {
  Applied: { bg: "F5F5F5", fg: "404040" },
  OA: { bg: "E0F2FE", fg: "075985" },
  "Video interview": { bg: "E0E7FF", fg: "3730A3" },
  Interview: { bg: "EDE9FE", fg: "5B21B6" },
  Offer: { bg: "D1FAE5", fg: "065F46" },
  Rejected: { bg: "FEE2E2", fg: "991B1B" },
  Withdrawn: { bg: "F5F5F5", fg: "737373" },
  Waiting: { bg: "FEF3C7", fg: "92400E" },
  Passed: { bg: "D1FAE5", fg: "065F46" },
  Failed: { bg: "FEE2E2", fg: "991B1B" },
};

const INK = "1F2937";
const MUTED = "6B7280";
const HEADER_BG = "2F5597";
const TILE_BG = "EEF2F8";
const BORDER = "D9DEE7";
const WHITE = "FFFFFF";
const MAX_LINES = 5;
const LINE_HEIGHT = 15;

// ------------------------------------------------------------------ cells

// Dates go in as real Excel dates so they sort and filter as dates. Excel
// stores no time zone, so a timestamp is written as its local wall-clock
// time, which is also how the importer reads a fractional serial.
function toCell(value: unknown, format: Layout["format"]): CellValue {
  if (value === "" || value == null) return null;
  if (format === "date") {
    const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  if (format === "datetime") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime())
      ? String(value)
      : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()));
  }
  if (format === "link" && /^https?:\/\//i.test(String(value)) && String(value).length < 2000) {
    return { text: String(value), hyperlink: String(value) };
  }
  return value as CellValue;
}

// Lines a wrapped cell needs at this column width, roughly.
function wrappedLines(text: string, width: number): number {
  return text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / (width * 1.1))), 0);
}

// ------------------------------------------------------------------ sheets

interface Tile {
  label: string;
  value: string | number;
  sub?: string;
}

interface SheetSpec {
  name: string; // sheet and table name
  title: string;
  subtitle: string;
  tiles?: Tile[];
  facts?: string[];
  headers: string[];
  layout: Record<string, Layout>;
  hints?: Record<string, string>; // header -> note shown on hover
  rows: Record<string, unknown>[];
  dropdowns?: Record<string, string[]>; // header -> allowed values (template)
}

const fillOf = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
const edge = (argb: string) => ({ style: "thin" as const, color: { argb } });

function addSummary(ws: Worksheet, spec: SheetSpec): number {
  ws.getCell("A1").value = spec.title;
  ws.getCell("A1").font = { size: 16, bold: true, color: { argb: INK } };
  ws.getRow(1).height = 26;
  ws.getCell("A2").value = spec.subtitle;
  ws.getCell("A2").font = { size: 10, color: { argb: MUTED } };
  let row = 3;

  if (spec.tiles?.length) {
    const [labelRow, valueRow, subRow] = [row, row + 1, row + 2].map((r) => ws.getRow(r));
    labelRow.height = 30;
    valueRow.height = 30;
    spec.tiles.forEach((t, i) => {
      const cells = [labelRow, valueRow, subRow].map((r) => r.getCell(i + 1));
      cells[0].value = t.label;
      cells[1].value = t.value;
      cells[2].value = t.sub ?? null;
      cells[0].font = { size: 9, color: { argb: MUTED } };
      cells[1].font = { size: 18, bold: true, color: { argb: INK } };
      cells[2].font = { size: 9, color: { argb: MUTED } };
      cells[0].alignment = { vertical: "bottom", wrapText: true, indent: 1 };
      cells[1].alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      cells[2].alignment = { vertical: "top", horizontal: "left", indent: 1 };
      for (const c of cells) {
        c.fill = fillOf(TILE_BG);
        c.border = { left: { style: "medium", color: { argb: WHITE } }, right: { style: "medium", color: { argb: WHITE } } };
      }
    });
    row += 4;
  }

  for (const fact of spec.facts ?? []) {
    ws.getCell(row, 1).value = fact;
    ws.getCell(row, 1).font = { size: 10, color: { argb: INK } };
    row++;
  }
  return spec.facts?.length ? row + 1 : row;
}

// The header row is returned 1-based, as ExcelJS wants it.
function addSheet(wb: Workbook, spec: SheetSpec) {
  const ws = wb.addWorksheet(spec.name, { views: [{ showGridLines: false }] });
  const headerRow = addSummary(ws, spec);
  const { headers, layout } = spec;
  headers.forEach((h, i) => (ws.getColumn(i + 1).width = layout[h]?.width ?? 16));

  // A table needs at least one row; an empty one is skipped on import.
  const rows = spec.rows.length ? spec.rows : [{}];
  ws.addTable({
    name: spec.name,
    ref: `A${headerRow}`,
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: headers.map((name) => ({ name, filterButton: true })),
    rows: rows.map((r) => headers.map((h) => toCell(r[h], layout[h]?.format))),
  });

  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = fillOf(HEADER_BG);
    cell.alignment = { vertical: "middle", wrapText: true };
    if (spec.hints?.[h]) cell.note = spec.hints[h];
  });
  ws.getRow(headerRow).height = 22;

  rows.forEach((r, ri) => {
    const row = ws.getRow(headerRow + 1 + ri);
    let lines = 1;
    headers.forEach((h, ci) => {
      const { format, width = 16 } = layout[h] ?? {};
      const cell = row.getCell(ci + 1);
      const text = String(r[h] ?? "");
      cell.border = { top: edge(BORDER), bottom: edge(BORDER), left: edge(BORDER), right: edge(BORDER) };
      cell.alignment = {
        vertical: "top",
        wrapText: format === "wrap",
        horizontal: format === "number" || format === "date" || format === "datetime" ? "center" : undefined,
      };
      if (format === "date") cell.numFmt = "yyyy-mm-dd";
      if (format === "datetime") cell.numFmt = "yyyy-mm-dd hh:mm";
      if (format === "link" && typeof cell.value === "object" && cell.value) {
        cell.font = { color: { argb: "0563C1" }, underline: true };
      }
      const tag = format === "tag" ? TAGS[text] : undefined;
      if (tag) {
        cell.fill = fillOf(tag.bg);
        cell.font = { bold: true, color: { argb: tag.fg } };
        cell.alignment = { vertical: "top", horizontal: "center" };
      }
      if (format === "wrap") lines = Math.max(lines, wrappedLines(text, width));
    });
    if (lines > 1) row.height = Math.min(lines, MAX_LINES) * LINE_HEIGHT;
  });

  // Dropdowns reach past the first row so they cover what gets typed below.
  for (const [h, values] of Object.entries(spec.dropdowns ?? {})) {
    const col = headers.indexOf(h) + 1;
    for (let r = headerRow + 1; r <= headerRow + 200; r++) {
      ws.getCell(r, col).dataValidation = { type: "list", allowBlank: true, formulae: [`"${values.join(",")}"`] };
    }
  }
}

// ------------------------------------------------------------------ summaries

function factLines(facts: Fact[]): string[] {
  return facts.slice(0, 4).map((f) => `${f.label}: ${f.value}${f.detail ? ` — ${f.detail}` : ""}`);
}

function applicationSummary(apps: Application[], assessments: Assessment[], changes: StatusChange[]) {
  const s = applicationStats(
    apps,
    groupBy(assessments, (a) => a.application_id),
    groupBy(changes, (c) => c.application_id),
    {},
    Date.now()
  );
  const delta = s.thisWeek - s.lastWeek;
  const tiles: Tile[] = [
    { label: "Applied", value: s.total, sub: `${s.thisWeek} this week` },
    { label: "vs last week", value: delta > 0 ? `+${delta}` : delta, sub: `${s.lastWeek} last week` },
    { label: "Heard back", value: pct(s.heardBack, s.total), sub: `${s.heardBack} of ${s.total}` },
    { label: "Got an OA or beyond", value: pct(s.progressed, s.total), sub: `${s.progressed} of ${s.total}` },
    { label: "Interviews", value: s.interviewed, sub: pct(s.interviewed, s.total) },
    { label: "Offers", value: s.offers },
  ];
  return { tiles, facts: factLines(s.facts) };
}

function assessmentSummary(apps: Application[], assessments: Assessment[], questions: Question[], changes: StatusChange[]) {
  const s = assessmentStats(
    assessments,
    new Map(apps.map((a) => [a.id, a])),
    groupBy(assessments, (a) => a.application_id),
    groupBy(changes, (c) => c.application_id),
    groupBy(questions, (q) => q.assessment_id),
    Date.now()
  );
  const decided = s.passed + s.failed;
  const tiles: Tile[] = [
    { label: "Total", value: s.total, sub: `${s.completed} completed` },
    { label: "Pending", value: s.total - s.completed },
    { label: "Due this week", value: s.dueThisWeek },
    { label: "Overdue", value: s.overdue, sub: s.overdue ? "still pending" : undefined },
    { label: "Pass rate", value: pct(s.passed, decided), sub: decided ? `${s.passed} of ${decided} with a result` : "no results yet" },
    { label: "Waiting on results", value: Math.max(0, s.completed - decided), sub: "completed, no pass/fail" },
  ];
  return { tiles, facts: factLines(s.facts) };
}

// ------------------------------------------------------------------ public

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function newWorkbook(): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  return new ExcelJS.Workbook();
}

// The styled workbook as bytes, separate from the download so it can be tested.
export async function buildExportXlsx(
  apps: Application[],
  assessments: Assessment[],
  questions: Question[],
  changes: StatusChange[]
): Promise<ArrayBuffer> {
  const wb = await newWorkbook();
  const exported = `Exported ${todayISO()}`;
  addSheet(wb, {
    name: "Applications",
    title: "Applications",
    subtitle: `${exported} · ${plural(apps.length, "application")}, all statuses`,
    ...applicationSummary(apps, assessments, changes),
    headers: Object.keys(APP_LAYOUT),
    layout: APP_LAYOUT,
    rows: applicationRows(apps),
  });
  addSheet(wb, {
    name: "Assessments",
    title: "Assessments & interviews",
    subtitle: `${exported} · ${plural(assessments.length, "assessment")}`,
    ...(assessments.length ? assessmentSummary(apps, assessments, questions, changes) : {}),
    headers: Object.keys(ASSESSMENT_LAYOUT),
    layout: ASSESSMENT_LAYOUT,
    rows: assessmentRows(assessments, apps, questions),
  });
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

// Empty workbook with the suggested headers, to paste rows into.
export async function buildTemplateXlsx(): Promise<ArrayBuffer> {
  const wb = await newWorkbook();
  const sheet = (name: string, title: string, spec: Record<string, FieldSpec>, layout: Record<string, Layout>, dropdowns: Record<string, string[]>) =>
    addSheet(wb, {
      name,
      title,
      subtitle: "Fill in the table below, then use Import. Hover a header for what goes in it. Column names can vary.",
      headers: Object.values(spec).map((f) => f.label),
      layout,
      hints: Object.fromEntries(Object.values(spec).filter((f) => f.hint).map((f) => [f.label, f.hint])),
      rows: [],
      dropdowns,
    });
  sheet("Applications", "Applications", APP_FIELDS, { ...APP_LAYOUT, Interview: { width: 30, format: "wrap" } }, {
    Status: STATUSES.map(statusLabel),
  });
  sheet("Assessments", "Assessments & interviews", ASSESSMENT_FIELDS, ASSESSMENT_LAYOUT, {
    Type: Object.values(ASSESSMENT_KINDS),
    Important: ["yes", "no"],
    Status: ["Pending", "Completed"],
    Outcome: Object.values(OUTCOMES).map((o) => o.label),
  });
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const pad = (n: number) => String(n).padStart(2, "0");
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportData(
  format: "xlsx" | "csv",
  apps: Application[],
  assessments: Assessment[],
  questions: Question[],
  changes: StatusChange[]
) {
  if (format === "xlsx") {
    download(
      new Blob([await buildExportXlsx(apps, assessments, questions, changes)], { type: XLSX_TYPE }),
      `job-tracker-${stamp()}.xlsx`
    );
    return;
  }
  const XLSX = await import("xlsx");
  const csv = (rows: Record<string, unknown>[]) =>
    new Blob([XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows))], { type: "text/csv;charset=utf-8" });
  download(csv(applicationRows(apps)), `job-tracker-applications-${stamp()}.csv`);
  download(csv(assessmentRows(assessments, apps, questions)), `job-tracker-assessments-${stamp()}.csv`);
}

export async function downloadTemplate() {
  download(new Blob([await buildTemplateXlsx()], { type: XLSX_TYPE }), "job-tracker-template.xlsx");
}
