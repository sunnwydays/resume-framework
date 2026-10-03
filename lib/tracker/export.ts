// CSV/XLSX export and the blank template for the job tracker. CSV goes
// through SheetJS (plain rows); XLSX goes through ExcelJS because the
// community SheetJS build can't write styles. Both are dynamically imported
// so they only load when used.
//
// The XLSX has a summary block above each table (title, stat tiles, a few
// facts), so the header row isn't row 1. That's fine for re-import: the
// importer finds the header row among the first 15 rows, and nothing in the
// summary looks like a Company column. Keep the block short for that reason.

import type { Cell, CellValue, Workbook, Worksheet } from "exceljs";
import {
  ASSESSMENT_KINDS,
  OUTCOMES,
  STATUSES,
  kindLabel,
  statusLabel,
  todayISO,
  type AppStatus,
  type Application,
  type Assessment,
  type Question,
  type QuestionSource,
} from "@/lib/tracker/format";
import { APP_FIELDS, ASSESSMENT_FIELDS, type FieldSpec } from "@/lib/tracker/io";
import { addDays, dayOf, daysBetween, median, NO_REPLY_DAYS, pct, plural, weekStart } from "@/lib/tracker/stats";

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
// The table (stripes, borders, formats) runs past the data, so rows typed in
// below are already part of it and the summary formulas count them.
const MIN_BODY_ROWS = 300;
const SPARE_ROWS = 100;

// ------------------------------------------------------------------ cells

// Excel stores no time zone, so a timestamp is written as its local
// wall-clock time, to the minute, which is also how the importer reads a
// fractional serial. As epoch ms of that wall-clock time read as UTC.
function wallClock(time: number): number {
  const d = new Date(time);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
}

// Dates go in as real Excel dates so they sort and filter as dates.
function toCell(value: unknown, format: Layout["format"]): CellValue {
  if (value === "" || value == null) return null;
  if (format === "date") {
    const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  if (format === "datetime") {
    const t = new Date(String(value)).getTime();
    return Number.isNaN(t) ? String(value) : new Date(wallClock(t));
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

// A summary cell: an Excel formula over the tables, so it follows edits to
// the rows, plus the value it has now, which is what shows until Excel
// recalculates (Protected View doesn't). The value is worked out here the
// way the formula does it, from what the sheet holds.
interface Live {
  formula: string;
  result: string | number;
  numFmt?: string;
}

interface Tile {
  label: string;
  value: Live;
  sub?: Live | string;
}

interface SheetSpec {
  name: string; // sheet and table name
  title: string;
  subtitle: string;
  tiles?: Tile[];
  facts?: Live[];
  headers: string[];
  layout: Record<string, Layout>;
  hints?: Record<string, string>; // header -> note shown on hover
  rows: Record<string, unknown>[];
  dropdowns?: Record<string, string[]>; // header -> allowed values (template)
}

const fillOf = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
const edge = (argb: string) => ({ style: "thin" as const, color: { argb } });

function setStat(cell: Cell, stat: Live | string | undefined) {
  if (typeof stat !== "object") {
    cell.value = stat ?? null;
    return;
  }
  cell.value = { formula: stat.formula, result: stat.result };
  if (stat.numFmt) cell.numFmt = stat.numFmt;
}

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
      setStat(cells[1], t.value);
      setStat(cells[2], t.sub);
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
    setStat(ws.getCell(row, 1), fact);
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

  // Blank rows are skipped on import.
  const body = Math.max(MIN_BODY_ROWS, spec.rows.length + SPARE_ROWS);
  const rows: Record<string, unknown>[] = [...spec.rows, ...Array.from({ length: body - spec.rows.length }, () => ({}))];
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

  for (const [h, values] of Object.entries(spec.dropdowns ?? {})) {
    const col = headers.indexOf(h) + 1;
    for (let r = headerRow + 1; r <= headerRow + body; r++) {
      ws.getCell(r, col).dataValidation = { type: "list", allowBlank: true, formulae: [`"${values.join(",")}"`] };
    }
  }
}

// ------------------------------------------------------------------ summaries

// Every stat is an Expr: the Excel formula and, alongside it, the same
// calculation done here on the rows being written, which becomes the cached
// result. Both read only what the sheet holds. There's no status history in
// it, so "heard back" and the like go by the current status plus the listed
// assessments, which can differ a little from the stats panel in the app.
// Assessments are tied to applications by company + role, as COUNTIFS
// matches them (ignoring case).
//
// Functions newer than Excel 2007 need the _xlfn. prefix in the file.
// AGGREGATE (15 = SMALL, 16 = PERCENTILE.INC; 6 = skip errors) takes array
// arguments without Ctrl+Shift+Enter, and dividing by a condition turns
// unwanted rows into errors for it to skip.

type Expr<T = string | number> = { f: string; v: T };

const A = (col: string) => `Applications[${col}]`;
const S = (col: string) => `Assessments[${col}]`;
const str = (s: string) => `"${s.replace(/"/g, '""')}"`;
const PERCENT = "0%";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function cat(...parts: (string | Expr)[]): Expr<string> {
  const es = parts.map((p) => (typeof p === "string" ? { f: str(p), v: p } : p));
  return { f: es.map((e) => e.f).join("&"), v: es.map((e) => String(e.v)).join("") };
}

const when = (test: Expr<boolean>, then: Expr<string>, otherwise = ""): Expr<string> => ({
  f: `IF(${test.f},${then.f},${str(otherwise)})`,
  v: test.v ? then.v : otherwise,
});

const days = (x: Expr<number>): Expr<string> => ({
  f: `IF(${x.f}=0,"same day",${x.f}&IF(${x.f}=1," day"," days"))`,
  v: x.v === 0 ? "same day" : plural(x.v, "day"),
});

const percent = (n: Expr<number>, d: Expr<number>): Expr<string> => ({
  f: `IFERROR(ROUND(${n.f}/${d.f}*100,0)&"%","—")`,
  v: pct(n.v, d.v),
});

const live = (e: Expr, numFmt?: string): Live => ({ formula: e.f, result: e.v, numFmt });

// A number as a share of `of`, shown as a percentage ("—" when `of` is 0).
const share = (n: Expr<number>, of: Expr<number>): Live => ({
  formula: `IFERROR(${n.f}/${of.f},"—")`,
  result: of.v ? n.v / of.v : "—",
  numFmt: PERCENT,
});

// "Label: body", or "Label: why" when there's nothing to go on (`ok` is how
// the result knows; the formula finds out by erroring).
function fact(label: string, body: Expr<string>, ok = true, why = "—"): Live {
  return {
    formula: `IFERROR(${str(`${label}: `)}&${body.f},${str(`${label}: ${why}`)})`,
    result: ok ? `${label}: ${body.v}` : `${label}: ${why}`,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// A timestamp as its cell holds it (see toCell), or null.
function wallOf(value: string | null): number | null {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(t) ? null : wallClock(t);
}

function applicationSummary(apps: Application[], assessments: Assessment[]) {
  const today = todayISO();
  const monday = weekStart(today);
  const cutoff = addDays(today, -NO_REPLY_DAYS);
  const byId = new Map(apps.map((a) => [a.id, a]));
  const keyOf = (a: Application) => `${a.company.toLowerCase()}\n${a.role.toLowerCase()}`;
  const withStep = new Set<string>();
  const withInterview = new Set<string>();
  for (const s of assessments) {
    const app = byId.get(s.application_id);
    if (!app) continue;
    withStep.add(keyOf(app));
    if (s.kind === "interview") withInterview.add(keyOf(app));
  }
  const stepF = (extra = "") => `COUNTIFS(${S("Company")},${A("Company")},${S("Role")},${A("Role")}${extra})`;

  // Applications whose status is one of `statuses`, or that have a listed
  // assessment (of that kind, if given).
  const reached = (statuses: AppStatus[], kind?: "interview"): Expr<number> => {
    const keys = kind ? withInterview : withStep;
    const labels = statuses.map((s) => str(statusLabel(s))).join(",");
    const stepped = stepF(kind ? `,${S("Type")},${str(kindLabel(kind))}` : "");
    return {
      f: `SUMPRODUCT((${A("Company")}<>"")*((ISNUMBER(MATCH(${A("Status")},{${labels}},0))+(${stepped}>0))>0))`,
      v: apps.filter((a) => statuses.includes(a.status as AppStatus) || keys.has(keyOf(a))).length,
    };
  };

  const total = { f: `COUNTA(${A("Company")})`, v: apps.length };
  const mondayF = "(TODAY()-WEEKDAY(TODAY(),3))";
  const thisWeek = { f: `COUNTIFS(${A("Applied")},">="&${mondayF})`, v: apps.filter((a) => a.applied_on >= monday).length };
  const lastWeek = {
    f: `COUNTIFS(${A("Applied")},">="&(${mondayF}-7),${A("Applied")},"<"&${mondayF})`,
    v: apps.filter((a) => a.applied_on >= addDays(monday, -7) && a.applied_on < monday).length,
  };
  const replied = reached(STATUSES.filter((s) => s !== "applied" && s !== "withdrawn"));
  const progressed = reached(["oa", "video_interview", "interview", "offer"]);
  const interviewed = reached(["interview", "offer"], "interview");
  const offers = { f: `COUNTIF(${A("Status")},${str(statusLabel("offer"))})`, v: apps.filter((a) => a.status === "offer").length };

  const tiles: Tile[] = [
    { label: "Applied", value: live(total), sub: live(cat(thisWeek, " this week")) },
    {
      label: "vs last week",
      value: live({ f: `${thisWeek.f}-${lastWeek.f}`, v: thisWeek.v - lastWeek.v }, "+0;-0;0"),
      sub: live(cat(lastWeek, " last week")),
    },
    { label: "Heard back", value: share(replied, total), sub: live(cat(replied, " of ", total)) },
    { label: "Got an OA or beyond", value: share(progressed, total), sub: live(cat(progressed, " of ", total)) },
    { label: "Interviews", value: live(interviewed), sub: live(percent(interviewed, total)) },
    { label: "Offers", value: live(offers) },
  ];

  // Still "Applied", no assessment, applied NO_REPLY_DAYS+ days ago.
  const eligible = {
    f: `COUNTIFS(${A("Applied")},"<="&(TODAY()-${NO_REPLY_DAYS}))`,
    v: apps.filter((a) => a.applied_on <= cutoff).length,
  };
  const ghosts = {
    f:
      `SUMPRODUCT(ISNUMBER(${A("Applied")})*(${A("Applied")}<=TODAY()-${NO_REPLY_DAYS})` +
      `*(${A("Status")}=${str(statusLabel("applied"))})*(${stepF()}=0))`,
    v: apps.filter((a) => a.applied_on <= cutoff && a.status === "applied" && !withStep.has(keyOf(a))).length,
  };

  // Days from applying to the rejection, for rejected rows with both dates.
  const rejectedF = str(statusLabel("rejected"));
  const datedF = `(${A("Status")}=${rejectedF})*ISNUMBER(${A("Status changed")})*ISNUMBER(${A("Applied")})`;
  const gapsF = `(INT(${A("Status changed")})-${A("Applied")})/(${datedF})`;
  const gaps = apps.flatMap((a) =>
    a.status === "rejected" && wallOf(a.status_changed_at) !== null
      ? [{ a, days: daysBetween(a.applied_on, dayOf(a.status_changed_at!)) }]
      : []
  );
  const minGap = { f: `_xlfn.AGGREGATE(15,6,${gapsF},1)`, v: Math.min(...gaps.map((g) => g.days)) };
  const fastest = gaps.find((g) => g.days === minGap.v);
  const fastestRow = `MATCH(${minGap.f},INDEX(${gapsF},0),0)`;
  const dated = { f: `SUMPRODUCT(${datedF})`, v: gaps.length };
  const rejected = { f: `COUNTIF(${A("Status")},${rejectedF})`, v: apps.filter((a) => a.status === "rejected").length };

  const facts = [
    fact(
      `Ghosted (${NO_REPLY_DAYS}d+, no reply)`,
      when(
        { f: `${eligible.f}>0`, v: eligible.v > 0 },
        cat(percent(ghosts, eligible), " — ", ghosts, " of ", eligible, ` applied ${NO_REPLY_DAYS}+ days ago`),
        `nothing applied ${NO_REPLY_DAYS}+ days ago yet`
      )
    ),
    fact(
      "Speedrun rejection",
      cat(
        days({ f: `MAX(0,${minGap.f})`, v: Math.max(0, minGap.v) }),
        " — ",
        { f: `INDEX(${A("Company")},${fastestRow})`, v: fastest?.a.company ?? "" },
        " · ",
        { f: `INDEX(${A("Role")},${fastestRow})`, v: fastest?.a.role ?? "" }
      ),
      gaps.length > 0,
      "no dated rejections yet"
    ),
    fact(
      "Typical time to rejection",
      cat(
        days({ f: `ROUND(_xlfn.AGGREGATE(16,6,${gapsF},0.5),1)`, v: round1(median(gaps.map((g) => g.days)) ?? 0) }),
        when(
          { f: `${dated.f}<${rejected.f}`, v: dated.v < rejected.v },
          cat(" — from ", dated, " of ", rejected, " with dates")
        )
      ),
      gaps.length > 0,
      "no dated rejections yet"
    ),
  ];
  return { tiles, facts };
}

function assessmentSummary(apps: Application[], assessments: Assessment[]) {
  const now = wallClock(Date.now());
  const byId = new Map(apps.map((a) => [a.id, a]));
  const count = (test: (s: Assessment) => boolean) => assessments.filter(test).length;
  const isOpen = (s: Assessment) => s.status !== "completed";
  const openF = `${S("Company")},"<>",${S("Status")},"<>Completed"`;

  const total = { f: `COUNTA(${S("Company")})`, v: assessments.length };
  const completed = { f: `COUNTIF(${S("Status")},"Completed")`, v: count((s) => !isOpen(s)) };
  const dueThisWeek = {
    f: `COUNTIFS(${openF},${S("Due")},">="&NOW(),${S("Due")},"<"&(NOW()+7))`,
    v: count((s) => {
      const due = wallOf(s.due_at);
      return isOpen(s) && due !== null && due >= now && due < now + 7 * DAY;
    }),
  };
  const overdue = {
    f: `COUNTIFS(${openF},${S("Due")},"<"&NOW())`,
    v: count((s) => {
      const due = wallOf(s.due_at);
      return isOpen(s) && due !== null && due < now;
    }),
  };
  const passed = { f: `COUNTIF(${S("Outcome")},${str(OUTCOMES.passed.label)})`, v: count((s) => s.outcome === "passed") };
  const failed = { f: `COUNTIF(${S("Outcome")},${str(OUTCOMES.failed.label)})`, v: count((s) => s.outcome === "failed") };
  const decided = { f: `(${passed.f}+${failed.f})`, v: passed.v + failed.v };

  const tiles: Tile[] = [
    { label: "Total", value: live(total), sub: live(cat(completed, " completed")) },
    { label: "Pending", value: live({ f: `${total.f}-${completed.f}`, v: total.v - completed.v }) },
    { label: "Due this week", value: live(dueThisWeek) },
    {
      label: "Overdue",
      value: live(overdue),
      sub: live(when({ f: `${overdue.f}>0`, v: overdue.v > 0 }, cat("still pending"))),
    },
    {
      label: "Pass rate",
      value: share(passed, decided),
      sub: live(when({ f: `${decided.f}>0`, v: decided.v > 0 }, cat(passed, " of ", decided, " with a result"), "no results yet")),
    },
    {
      label: "Waiting on results",
      value: live({ f: `MAX(0,${completed.f}-${decided.f})`, v: Math.max(0, completed.v - decided.v) }),
      sub: "completed, no pass/fail",
    },
  ];

  // Hours between finishing an OA and its due time.
  const oaDoneF =
    `(${S("Type")}=${str(kindLabel("oa"))})*(${S("Status")}="Completed")` +
    `*ISNUMBER(${S("Due")})*ISNUMBER(${S("Completed at")})`;
  const marginF = `(${S("Due")}-${S("Completed at")})*24`;
  const margins = assessments.flatMap((s) => {
    const due = wallOf(s.due_at);
    const done = wallOf(s.completed_at);
    return s.kind === "oa" && !isOpen(s) && due !== null && done !== null ? [(due - done) / HOUR] : [];
  });
  const m = { f: `_xlfn.AGGREGATE(16,6,${marginF}/(${oaDoneF}),0.5)`, v: median(margins) ?? 0 };
  const lastDay = { f: `SUMPRODUCT(${oaDoneF}*(${marginF}>=0)*(${marginF}<24))`, v: margins.filter((h) => h >= 0 && h < 24).length };
  const timed = { f: `SUMPRODUCT(${oaDoneF})`, v: margins.length };

  const minutes = {
    f: `SUMIFS(${S("Duration (min)")},${S("Status")},"Completed")`,
    v: assessments.reduce((n, s) => n + (!isOpen(s) && s.duration_min ? s.duration_min : 0), 0),
  };

  const D = S("Difficulty");
  const ratings = assessments.filter((s) => s.difficulty != null);
  const rated = { f: `COUNT(${D})`, v: ratings.length };
  const hardest = ratings.reduce<Assessment | null>((best, s) => (!best || s.difficulty! > best.difficulty! ? s : best), null);
  const hardestRow = `MATCH(MAX(${D}),${D},0)`;

  const facts = [
    fact(
      "Procrastination index",
      cat(
        {
          f: `IF(${m.f}>=48,ROUND(${m.f}/24,0)&" days early",IF(${m.f}>=0,ROUND(${m.f},0)&"h before due",ROUND(-${m.f},0)&"h late"))`,
          v: m.v >= 48 ? `${Math.round(m.v / 24)} days early` : m.v >= 0 ? `${Math.round(m.v)}h before due` : `${Math.round(-m.v)}h late`,
        },
        " — ",
        percent(lastDay, timed),
        " done in the final 24h"
      ),
      margins.length > 0,
      "no completed OAs with a due date yet"
    ),
    fact(
      "Time in assessments",
      cat(
        {
          f: `IF(${minutes.f}>=90,ROUND(${minutes.f}/60,1)&" h",${minutes.f}&" min")`,
          v: minutes.v >= 90 ? `${round1(minutes.v / 60)} h` : `${minutes.v} min`,
        },
        " — completed ones, from the listed durations"
      )
    ),
    fact(
      "Average difficulty",
      cat(
        {
          f: `FIXED(AVERAGE(${D}),1)`,
          v: ratings.length ? (ratings.reduce((n, s) => n + s.difficulty!, 0) / ratings.length).toFixed(1) : "",
        },
        " / 5 — over ",
        rated,
        when({ f: `${rated.f}=1`, v: rated.v === 1 }, cat(" rated one"), " rated ones")
      ),
      ratings.length > 0,
      "none rated yet"
    ),
    fact(
      "Hardest so far",
      cat(
        { f: `MAX(${D})`, v: hardest?.difficulty ?? 0 },
        " / 5 — ",
        { f: `INDEX(${S("Company")},${hardestRow})`, v: (hardest && byId.get(hardest.application_id)?.company) ?? "" },
        " · ",
        { f: `INDEX(${S("Title")},${hardestRow})`, v: hardest?.title ?? "" }
      ),
      hardest !== null,
      "none rated yet"
    ),
  ];
  return { tiles, facts };
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
  questions: Question[]
): Promise<ArrayBuffer> {
  const wb = await newWorkbook();
  const exported = `Exported ${todayISO()}`;
  addSheet(wb, {
    name: "Applications",
    title: "Applications",
    subtitle: `${exported} · ${plural(apps.length, "application")}, all statuses`,
    ...applicationSummary(apps, assessments),
    headers: Object.keys(APP_LAYOUT),
    layout: APP_LAYOUT,
    rows: applicationRows(apps),
  });
  addSheet(wb, {
    name: "Assessments",
    title: "Assessments & interviews",
    subtitle: `${exported} · ${plural(assessments.length, "assessment")}`,
    ...assessmentSummary(apps, assessments),
    headers: Object.keys(ASSESSMENT_LAYOUT),
    layout: ASSESSMENT_LAYOUT,
    rows: assessmentRows(assessments, apps, questions),
  });
  // The cached results are right as of now; this makes Excel redo the
  // date-relative ones (this week, overdue) when the file is opened later.
  wb.calcProperties.fullCalcOnLoad = true;
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
  questions: Question[]
): Promise<string[]> {
  if (format === "xlsx") {
    const name = `job-tracker-${stamp()}.xlsx`;
    download(new Blob([await buildExportXlsx(apps, assessments, questions)], { type: XLSX_TYPE }), name);
    return [name];
  }
  const XLSX = await import("xlsx");
  const csv = (rows: Record<string, unknown>[]) =>
    new Blob([XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows))], { type: "text/csv;charset=utf-8" });
  const names = [`job-tracker-applications-${stamp()}.csv`, `job-tracker-assessments-${stamp()}.csv`];
  download(csv(applicationRows(apps)), names[0]);
  download(csv(assessmentRows(assessments, apps, questions)), names[1]);
  return names;
}

export async function downloadTemplate() {
  download(new Blob([await buildTemplateXlsx()], { type: XLSX_TYPE }), "job-tracker-template.xlsx");
}
