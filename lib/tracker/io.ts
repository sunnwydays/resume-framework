// CSV/XLSX import and export for the job tracker. Reading/writing files
// goes through SheetJS (dynamically imported, so it only loads when used);
// everything else here is pure so the header matching can be tested on its
// own.

import {
  STATUSES,
  formatDate,
  parseDuration as parseClockDuration,
  sameUrl,
  statusLabel,
  todayISO,
  type AppStatus,
  type Application,
  type Assessment,
  type AssessmentKind,
  type Outcome,
  type QuestionSource,
} from "@/lib/tracker/format";

const pad = (n: number) => String(n).padStart(2, "0");

// ------------------------------------------------------------------ import

export interface RawSheet {
  name: string;
  rows: unknown[][];
}

// A workbook is a zip (.xlsx, "PK") or an old OLE file (.xls); anything else
// is text, which SheetJS would decode as Latin-1 and garble "é" and "→".
function isWorkbook(bytes: Uint8Array): boolean {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  return starts(0x50, 0x4b) || starts(0xd0, 0xcf, 0x11, 0xe0);
}

// UTF-8 (what we export), or Windows-1252 (what Excel's plain "CSV" saves).
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export async function readSheets(file: File): Promise<RawSheet[]> {
  const XLSX = await import("xlsx");
  const bytes = new Uint8Array(await file.arrayBuffer());
  // raw: keep CSV cells as the text they are. Left to guess, SheetJS turns
  // "03/04/26" into March 4 (the importer reads it day-first) and an ISO
  // timestamp into a serial that then shifts by the UTC offset. Real
  // spreadsheets carry their own types, so it doesn't apply to them.
  const wb = isWorkbook(bytes)
    ? XLSX.read(bytes, { type: "array" })
    : XLSX.read(decodeText(bytes), { type: "string", raw: true });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    // A hyperlinked cell ("CodeSignal") is more useful as its target URL.
    for (const [addr, c] of Object.entries(ws)) {
      if (addr.startsWith("!")) continue;
      const target = (c as { l?: { Target?: string } }).l?.Target;
      if (target && /^https?:\/\//i.test(target)) {
        Object.assign(c, { t: "s", v: target, w: target });
      }
    }
    return {
      name,
      rows: XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        raw: true,
        defval: "",
        blankrows: false,
      }),
    };
  });
}

// "Date\n(dd/mm/yy)" -> "date", "Response (Drop Down List)" -> "response",
// "Interview Time, Date & Interviewer Name" -> "interview time date interviewer name"
export function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// One importable column. `label` is the name we suggest (and export under);
// `aliases` are normalized headers we also accept, best first.
export interface FieldSpec {
  label: string;
  hint: string;
  aliases: readonly string[];
}

const COMPANY: FieldSpec = {
  label: "Company",
  hint: "Required",
  aliases: ["company", "company name", "employer", "organization", "organisation", "org", "firm", "business"],
};
const NOTES: FieldSpec = {
  label: "Notes",
  hint: "Anything else",
  aliases: ["notes", "note", "comments", "comment", "remarks"],
};

export const APP_FIELDS = {
  company: COMPANY,
  role: {
    label: "Role",
    hint: "Required",
    aliases: ["role", "role title", "position", "job title", "title", "job", "job role", "position title", "opening"],
  },
  url: {
    label: "Link",
    hint: "Job posting URL",
    aliases: ["link", "link to job advert", "url", "job link", "posting", "job url", "job posting", "advert", "job ad", "listing"],
  },
  location: { label: "Location", hint: "", aliases: ["location", "city", "office"] },
  applied_on: {
    label: "Applied",
    hint: "Date, e.g. 25/09/26 (day first) or 2026-09-25. Blank = today",
    aliases: ["applied", "date applied", "applied date", "applied on", "application date", "date", "submitted", "date submitted"],
  },
  status: {
    label: "Status",
    hint: "Applied, OA, Video interview, Interview, Offer, Rejected or Withdrawn",
    aliases: ["status", "response", "stage", "outcome", "result", "progress"],
  },
  status_changed_at: {
    label: "Status changed",
    hint: "Date of the last status change",
    aliases: ["status changed", "last updated", "updated", "last change", "status date"],
  },
  notes: NOTES,
  interview: {
    label: "Interview",
    hint: "Free text, added to notes",
    aliases: ["interview", "interviews", "interview time date interviewer name", "interviewer"],
  },
  description: { label: "Description", hint: "Job description", aliases: ["description", "job description", "jd"] },
} satisfies Record<string, FieldSpec>;

export const ASSESSMENT_FIELDS = {
  company: COMPANY,
  role: {
    label: "Role",
    hint: "Helps pick the right application when a company has several",
    aliases: ["role", "role title", "position", "job title"],
  },
  kind: { label: "Type", hint: "OA, Video interview or Interview", aliases: ["type", "kind", "assessment type"] },
  title: {
    label: "Title",
    hint: "Required, e.g. \"Coding round\"",
    aliases: ["sub assessment", "title", "assessment", "name", "assessment name", "task"],
  },
  details: { label: "Details", hint: "", aliases: ["breakdown details", "details", "breakdown", "description"] },
  duration: { label: "Duration (min)", hint: "Minutes, or \"1.5h\"", aliases: ["duration", "length", "time limit", "minutes"] },
  due: {
    label: "Due",
    hint: "Deadline or scheduled date/time",
    aliases: ["due", "due date", "deadline", "scheduled", "date"],
  },
  interviewer: { label: "Interviewer", hint: "", aliases: ["interviewer", "interviewer name", "interviewers"] },
  link: { label: "Link", hint: "URL, or a platform name like CodeSignal", aliases: ["link", "url", "platform"] },
  important: { label: "Important", hint: "yes / no", aliases: ["important", "priority", "starred"] },
  status: { label: "Status", hint: "Pending or Completed", aliases: ["status", "progress"] },
  completed_at: { label: "Completed at", hint: "", aliases: ["completed at", "completed on", "date completed"] },
  difficulty: {
    label: "Difficulty",
    hint: "1–5, or easy / medium / hard",
    aliases: ["difficulty", "difficulty level", "level", "how hard", "hardness"],
  },
  outcome: {
    label: "Outcome",
    hint: "Waiting, Passed or Failed",
    aliases: ["outcome", "result", "results", "passed", "verdict"],
  },
  score: { label: "Score", hint: "Free text, e.g. 800/850", aliases: ["score", "grade", "marks", "points"] },
  prep_notes: {
    label: "Prep notes",
    hint: "What to study",
    aliases: ["prep notes", "prep", "preparation", "topics", "to study", "study notes"],
  },
  reflection: {
    label: "Reflection",
    hint: "How it went",
    aliases: ["reflection", "how it went", "takeaways", "lessons", "retro", "feedback"],
  },
  expected_questions: {
    label: "Expected questions",
    hint: "One per line; \"question → answer\" to include an answer",
    aliases: ["expected questions", "questions", "possible questions", "prep questions", "practice questions"],
  },
  asked_questions: {
    label: "Asked questions",
    hint: "Same format, for questions that came up",
    aliases: ["asked questions", "questions asked", "asked", "actual questions"],
  },
  notes: NOTES,
} satisfies Record<string, FieldSpec>;

// Headers that only an assessment sheet would have.
const ASSESSMENT_MARKERS = [
  "sub assessment", "breakdown details", "due date", "due", "duration", "deadline", "type", "difficulty",
];

// Optimal string alignment distance: edits plus adjacent swaps.
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

const EXACT = 1000;
const KEYWORD = 500;
const TYPO = 300;

// How well a header fits a field: an exact alias (earlier aliases win), a
// header containing an alias as whole words ("Company Name (legal)"), or
// one typo away from an alias ("Roll", "Compnay"). Longer aliases beat
// shorter ones, so "Interview Date" goes to Interview, not Applied.
function score(header: string, aliases: readonly string[]): number {
  let best = 0;
  aliases.forEach((alias, i) => {
    if (header === alias) best = Math.max(best, EXACT - i);
    else if (` ${header} `.includes(` ${alias} `)) best = Math.max(best, KEYWORD + alias.length);
    else if (alias.length >= 4) {
      const words = alias.includes(" ") ? [header] : [header, ...header.split(" ")];
      if (words.some((w) => editDistance(w, alias) === 1)) best = Math.max(best, TYPO + alias.length);
    }
  });
  return best;
}

type ColumnMap<K extends string> = Partial<Record<K, number>>;

// Best-scoring header/field pairs first; each header and field used once.
// `overrides` are the user's choices (column index -> field key, or null for
// "keep in notes"); they win, and those columns skip automatic matching.
function mapColumns<K extends string>(
  headers: string[],
  spec: Record<K, FieldSpec>,
  overrides: Record<number, string | null> = {}
): { map: ColumnMap<K>; guessed: Set<number>; manual: Set<number> } {
  const map: ColumnMap<K> = {};
  const guessed = new Set<number>();
  const manual = new Set<number>();
  for (const [idx, key] of Object.entries(overrides)) {
    manual.add(Number(idx));
    if (key && key in spec) map[key as K] = Number(idx);
  }
  const pairs: { key: K; idx: number; score: number }[] = [];
  for (const key of Object.keys(spec) as K[]) {
    headers.forEach((h, idx) => {
      const s = h && !manual.has(idx) ? score(h, spec[key].aliases) : 0;
      if (s > 0) pairs.push({ key, idx, score: s });
    });
  }
  pairs.sort((a, b) => b.score - a.score || a.idx - b.idx);
  for (const p of pairs) {
    if (map[p.key] !== undefined || Object.values(map).includes(p.idx)) continue;
    map[p.key] = p.idx;
    if (p.score < EXACT - 100) guessed.add(p.idx);
  }
  return { map, guessed, manual };
}

interface HeaderRow {
  index: number;
  headers: string[];
  labels: string[];
}

function headerAt(rows: unknown[][], index: number): HeaderRow {
  return {
    index,
    headers: rows[index].map(normalizeHeader),
    // As typed, minus line breaks: "Date\n(dd/mm/yy)" -> "Date (dd/mm/yy)".
    labels: rows[index].map((h) => String(h ?? "").replace(/\s+/g, " ").trim()),
  };
}

// The header row is the first row (in the top 15) with a company column
// and at least one other recognized column; anything above it (titles,
// hand-typed totals) is ignored.
function findHeader(rows: unknown[][]): HeaderRow | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const headers = rows[i].map(normalizeHeader);
    const found = [mapColumns(headers, APP_FIELDS).map, mapColumns(headers, ASSESSMENT_FIELDS).map].some(
      (map) => map.company !== undefined && Object.keys(map).length >= 2
    );
    if (found) return headerAt(rows, i);
  }
  return null;
}

// When nothing was recognized but the user says how to read the sheet, its
// first non-empty row is the header.
function firstRowHeader(rows: unknown[][]): HeaderRow | null {
  const index = rows.findIndex((r) => r.some((c) => String(c ?? "").trim()));
  return index < 0 ? null : headerAt(rows, index);
}

const cell = (row: unknown[], idx: number | undefined): string =>
  idx === undefined ? "" : String(row[idx] ?? "").trim();

// Columns nothing matched: kept in notes as "Header: value" rather than dropped.
function extraNotes(row: unknown[], labels: string[], unmapped: number[]): string[] {
  return unmapped.map((i) => cell(row, i) && `${labels[i]}: ${cell(row, i)}`).filter(Boolean);
}

// Excel serial (days since 1899-12-30) -> Date (UTC midnight).
function fromSerial(n: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000));
}

// A number (or numeric text, from a CSV) in the range Excel uses for dates
// from 1954 to 2118.
function serialOf(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d{5}(\.\d+)?$/.test(value.trim())
        ? Number(value)
        : NaN;
  return n > 20000 && n < 80000 ? n : null;
}

// YYYY-MM-DD for a real calendar date in a believable year, else null.
// Anything else would make Postgres reject the date, and with it the whole
// import (it runs as one transaction).
function isoDate(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  return d > new Date(Date.UTC(y, m, 0)).getUTCDate() ? null : `${y}-${pad(m)}-${pad(d)}`;
}

// -> YYYY-MM-DD, or null if it isn't a real date. Slashed dates are
// day-first (the old sheet's dd/mm/yy), unless that isn't a date and
// month-first is ("09/25/26").
export function parseDate(value: unknown): string | null {
  if (value === "" || value == null) return null;
  const serial = serialOf(value);
  if (serial !== null) {
    const d = fromSerial(serial);
    return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (typeof value === "number") return null;
  const s = String(value).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(s);
  if (iso) return isoDate(+iso[1], +iso[2], +iso[3]);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3];
    return isoDate(year, +dmy[2], +dmy[1]) ?? isoDate(year, +dmy[1], +dmy[2]);
  }
  // Written-out dates ("Sep 25, 2026"). Needs a year: without one the
  // parser invents 2001, and bare numbers aren't dates at all.
  if (!/\b(?:19|20)\d{2}\b/.test(s) || /^\d+(\.\d+)?$/.test(s)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// -> ISO timestamp. A bare date becomes 23:59 local that day (a deadline).
export function parseDateTime(value: unknown): string | null {
  if (value === "" || value == null) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const date = parseDate(value);
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const serial = serialOf(value);
  if (serial !== null && serial % 1 !== 0) {
    // Serial with a time part: treat its wall-clock as local time.
    const t = fromSerial(serial);
    return new Date(y, m - 1, d, t.getUTCHours(), t.getUTCMinutes()).toISOString();
  }
  return new Date(y, m - 1, d, 23, 59).toISOString();
}

export function parseStatus(value: string): { status: AppStatus; known: boolean } {
  const v = value.toLowerCase().trim();
  if (!v) return { status: "applied", known: true };
  const exact = STATUSES.find((s) => s === v.replace(/\s+/g, "_") || statusLabel(s).toLowerCase() === v);
  if (exact) return { status: exact, known: true };
  if (/reject|declin|unsuccessful/.test(v)) return { status: "rejected", known: true };
  if (/withdr/.test(v)) return { status: "withdrawn", known: true };
  if (/offer/.test(v)) return { status: "offer", known: true };
  if (/video/.test(v)) return { status: "video_interview", known: true };
  if (/interview/.test(v)) return { status: "interview", known: true };
  if (/\boa\b|assessment|hackerrank|codesignal/.test(v)) return { status: "oa", known: true };
  if (/appl|submit|pending|waiting/.test(v)) return { status: "applied", known: true };
  return { status: "applied", known: false };
}

function parseKind(type: string, title: string, details: string): AssessmentKind {
  const v = `${type} ${title} ${details}`.toLowerCase();
  if (/video|hirevue|vidcruiter|one.?way/.test(v)) return "video_interview";
  if (/interview/.test(v) && !/\boa\b|online assessment/.test(type.toLowerCase())) return "interview";
  return "oa";
}

// Longer than a week is a typo, not an assessment.
const MAX_MINUTES = 7 * 24 * 60;

// "90", "1h 30m", "1 hour 30 minutes", "1.5h", "1:30", "45 mins" -> minutes.
export function parseMinutes(value: string): number | null {
  const text = value
    .toLowerCase()
    .replace(/\b(?:hours?|hrs?)\b/g, "h")
    .replace(/\b(?:minutes?|mins?)\b/g, "m");
  const seconds = parseClockDuration(text);
  const n = seconds !== null ? Math.round(seconds / 60) : (/(\d+)/.exec(value)?.[1] ?? null);
  const minutes = n === null ? null : Number(n);
  return minutes !== null && minutes <= MAX_MINUTES ? minutes : null;
}

// "4", "4/5", "3.5" -> 1..5; easy / medium / hard words too.
export function parseDifficulty(value: string): number | null {
  const v = value.toLowerCase().trim();
  if (!v) return null;
  const n = /^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?/.exec(v);
  if (n) {
    const scaled = n[2] ? (parseFloat(n[1]) / parseFloat(n[2])) * 5 : parseFloat(n[1]);
    return Number.isFinite(scaled) ? Math.min(5, Math.max(1, Math.round(scaled))) : null;
  }
  if (/very\s*hard|extreme|brutal/.test(v)) return 5;
  if (/very\s*easy|trivial/.test(v)) return 1;
  if (/hard|difficult|tough/.test(v)) return 4;
  if (/med|moderate|ok|average/.test(v)) return 3;
  if (/easy|simple/.test(v)) return 2;
  return null;
}

export function parseOutcome(value: string): Outcome | null {
  const v = value.toLowerCase();
  if (/fail|reject|unsuccessful|didn.?t pass|not pass/.test(v)) return "failed";
  if (/pass|advanc|next round|moved on|offer|success/.test(v)) return "passed";
  if (/wait|pending|tbd|awaiting|unknown/.test(v)) return "waiting";
  return null;
}

// One question per line, optionally "question → answer" (or "->", " - A: ").
export function parseQuestions(value: string, source: QuestionSource): QuestionPayload[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const [question, ...rest] = line.split(/\s*(?:→|->)\s*/);
      return { source, question: question.trim(), answer: rest.join(" → ").trim() || null };
    })
    .filter((q) => q.question);
}

const parseBool = (v: string) => /^(y|yes|true|1|x|✓|✔|important|high)$/i.test(v.trim());

export interface AppPayload {
  ref: string;
  company: string;
  role: string;
  url: string | null;
  location: string | null;
  description: string | null;
  applied_on: string;
  status: AppStatus;
  status_changed_at: string | null;
  notes: string | null;
}

export interface QuestionPayload {
  source: QuestionSource;
  question: string;
  answer: string | null;
}

export interface AssessmentPayload {
  kind: AssessmentKind;
  title: string;
  details: string | null;
  duration_min: number | null;
  due_at: string | null;
  interviewer: string | null;
  link: string | null;
  important: boolean;
  status: "pending" | "completed";
  completed_at: string | null;
  notes: string | null;
  difficulty: number | null;
  outcome: Outcome | null;
  score: string | null;
  prep_notes: string | null;
  reflection: string | null;
  questions: QuestionPayload[];
}

export type AssessmentTarget = { existing: string } | { ref: string } | null;

export interface PlannedApp {
  row: AppPayload;
  duplicateOf: Application | null;
  include: boolean;
}

export interface PlannedAssessment {
  row: AssessmentPayload;
  company: string;
  role: string;
  target: AssessmentTarget;
  // Why target is null / how it was matched, for the preview.
  match: "exact" | "company" | "ref-number" | "ambiguous" | "none";
  duplicate: boolean;
  include: boolean;
}

export type SheetKind = "applications" | "assessments";

// The user's corrections to the automatic reading, per sheet name.
export interface SheetOverride {
  kind?: SheetKind | "skip"; // unset = whatever was detected
  columns?: Record<number, string | null>; // column index -> field key; null = keep in notes
}
export type ImportOverrides = Record<string, SheetOverride>;

// How each column of a sheet was read, for the preview.
export interface ColumnReport {
  index: number;
  header: string;
  key: string | null; // field key it feeds (see APP_FIELDS / ASSESSMENT_FIELDS), or null (kept in notes)
  guessed: boolean; // matched by keyword or typo, not an exact name
  manual: boolean; // chosen by the user
  sample: string; // first non-empty value, to show what's in the column
}

export interface SheetReport {
  name: string;
  kind: SheetKind | null; // how it's being read; null = skipped on purpose
  autoKind: SheetKind | null; // what detection alone would pick
  problem: string | null; // why nothing is imported from it
  columns: ColumnReport[];
}

export interface ImportPlan {
  apps: PlannedApp[];
  assessments: PlannedAssessment[];
  sheets: SheetReport[];
  warnings: string[];
}

function sampleOf(body: unknown[][], idx: number): string {
  for (const row of body.slice(0, 25)) {
    const v = cell(row, idx).replace(/\s+/g, " ");
    if (v) return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  }
  return "";
}

function describeColumns<K extends string>(
  labels: string[],
  body: unknown[][],
  map: ColumnMap<K>,
  guessed: Set<number>,
  manual: Set<number>
): { columns: ColumnReport[]; unmapped: number[] } {
  const keyAt = new Map((Object.entries(map) as [string, number][]).map(([k, i]) => [i, k]));
  const columns: ColumnReport[] = [];
  const unmapped: number[] = [];
  labels.forEach((header, index) => {
    if (!header) return;
    const key = keyAt.get(index) ?? null;
    if (!key) unmapped.push(index);
    columns.push({
      index,
      header,
      key,
      guessed: guessed.has(index),
      manual: manual.has(index),
      sample: sampleOf(body, index),
    });
  });
  return { columns, unmapped };
}

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// An application an imported assessment could be attached to.
export interface ApplicationOption {
  value: string; // "existing:<id>" or "ref:<ref>", see AssessmentTarget
  company: string;
  role: string;
  isNew: boolean; // from the file being imported, not yet tracked
}

const COMPANY_NOISE = new Set(["inc", "llc", "ltd", "limited", "corp", "corporation", "co", "company", "the", "group", "plc"]);
const companyCompact = (s: string) =>
  key(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !COMPANY_NOISE.has(w))
    .join("");

// 0 = unrelated. "Snowflake" vs "Snowflake Computing Inc." is close; vs "Microsoft" isn't.
function companyCloseness(a: string, b: string): number {
  const x = companyCompact(a);
  const y = companyCompact(b);
  if (!x || !y) return 0;
  if (x === y) return 100;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 3 && long.startsWith(short)) return 85;
  if (short.length >= 4 && long.includes(short)) return 70;
  if (short.length >= 4 && editDistance(x, y) <= (short.length >= 7 ? 2 : 1)) return 60;
  return 0;
}

// The applications most likely meant by an assessment's company/role, best
// first. Only the company has to be close; a matching role just ranks higher.
export function suggestApplications(
  options: ApplicationOption[],
  company: string,
  role: string,
  limit = 5
): ApplicationOption[] {
  const wanted = key(role);
  return options
    .map((option) => {
      const closeness = companyCloseness(company, option.company);
      const have = key(option.role);
      const roleBonus =
        wanted && have === wanted ? 20 : wanted && have && (have.includes(wanted) || wanted.includes(have)) ? 10 : 0;
      return { option, score: closeness ? closeness + roleBonus : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.option);
}

export function buildImportPlan(
  sheets: RawSheet[],
  existingApps: Application[],
  existingAssessments: Assessment[],
  overrides: ImportOverrides = {},
  today: string = todayISO()
): ImportPlan {
  const warnings: string[] = [];
  let undated = 0;
  const sheetReports: SheetReport[] = [];
  const apps: PlannedApp[] = [];
  const pendingAssessments: Omit<PlannedAssessment, "target" | "match" | "duplicate" | "include">[] = [];

  for (const sheet of sheets) {
    const override = overrides[sheet.name] ?? {};
    const found = findHeader(sheet.rows);
    const autoKind: SheetKind | null = found
      ? found.headers.some((h) => ASSESSMENT_MARKERS.includes(h))
        ? "assessments"
        : "applications"
      : null;
    const kind = override.kind === "skip" ? null : (override.kind ?? autoKind);
    const header = found ?? (kind ? firstRowHeader(sheet.rows) : null);
    if (!header || !kind) {
      sheetReports.push({
        name: sheet.name,
        kind,
        autoKind,
        problem: header ? null : "Couldn't find a header row with a Company column.",
        columns: [],
      });
      continue;
    }
    const body = sheet.rows.slice(header.index + 1);
    const overrideCols = override.columns ?? {};

    if (kind === "assessments") {
      const { map: cols, guessed, manual } = mapColumns(header.headers, ASSESSMENT_FIELDS, overrideCols);
      const { columns, unmapped } = describeColumns(header.labels, body, cols, guessed, manual);
      if (cols.company === undefined || cols.title === undefined) {
        sheetReports.push({
          name: sheet.name,
          kind,
          autoKind,
          problem: "Choose which column is the Company and which is the assessment Title.",
          columns,
        });
        continue;
      }
      sheetReports.push({ name: sheet.name, kind, autoKind, problem: null, columns });
      for (const row of body) {
        const company = cell(row, cols.company);
        const title = cell(row, cols.title);
        if (!company || !title) continue;
        const details = cell(row, cols.details);
        // An OA sheet often has "Passed" / "Rejected" in Status rather than
        // a separate Outcome column; either way a pass/fail means it's done.
        const statusOutcome = parseOutcome(cell(row, cols.status));
        const outcome =
          parseOutcome(cell(row, cols.outcome)) ??
          (statusOutcome === "passed" || statusOutcome === "failed" ? statusOutcome : null);
        const status =
          /complet|done|submitted|finished/i.test(cell(row, cols.status)) ||
          outcome === "passed" ||
          outcome === "failed"
            ? "completed"
            : "pending";
        const dueAt = parseDateTime(cols.due === undefined ? "" : row[cols.due]);
        const difficultyText = cell(row, cols.difficulty);
        const difficulty = parseDifficulty(difficultyText);
        const outcomeText = cell(row, cols.outcome);
        pendingAssessments.push({
          company,
          role: cell(row, cols.role),
          row: {
            kind: parseKind(cell(row, cols.kind), title, details),
            title,
            details: details || null,
            duration_min: parseMinutes(cell(row, cols.duration)),
            due_at: dueAt,
            interviewer: cell(row, cols.interviewer) || null,
            link: /^https?:\/\//i.test(cell(row, cols.link)) ? cell(row, cols.link) : null,
            important: parseBool(cell(row, cols.important)),
            status,
            completed_at:
              status === "completed" && cols.completed_at !== undefined
                ? parseDateTime(row[cols.completed_at])
                : null,
            // A non-URL "link" cell ("CodeSignal") is still worth keeping.
            notes:
              [
                cell(row, cols.notes),
                cell(row, cols.link) && !/^https?:\/\//i.test(cell(row, cols.link))
                  ? `Platform: ${cell(row, cols.link)}`
                  : "",
                // Values we couldn't read are kept rather than dropped.
                difficultyText && difficulty === null ? `Difficulty: ${difficultyText}` : "",
                outcomeText && !parseOutcome(outcomeText) ? `Outcome: ${outcomeText}` : "",
                cell(row, cols.due) && !dueAt ? `Due: ${cell(row, cols.due)}` : "",
                ...extraNotes(row, header.labels, unmapped),
              ]
                .filter(Boolean)
                .join(" · ") || null,
            difficulty,
            outcome,
            score: cell(row, cols.score) || null,
            prep_notes: cell(row, cols.prep_notes) || null,
            reflection: cell(row, cols.reflection) || null,
            questions: [
              ...parseQuestions(cell(row, cols.expected_questions), "expected"),
              ...parseQuestions(cell(row, cols.asked_questions), "asked"),
            ],
          },
        });
      }
    } else {
      const { map: cols, guessed, manual } = mapColumns(header.headers, APP_FIELDS, overrideCols);
      const { columns, unmapped } = describeColumns(header.labels, body, cols, guessed, manual);
      if (cols.company === undefined || cols.role === undefined) {
        sheetReports.push({
          name: sheet.name,
          kind,
          autoKind,
          problem: "Choose which column is the Company and which is the Role.",
          columns,
        });
        continue;
      }
      sheetReports.push({ name: sheet.name, kind, autoKind, problem: null, columns });
      for (const row of body) {
        const company = cell(row, cols.company);
        const role = cell(row, cols.role);
        if (!company || !role) continue;
        const { status, known } = parseStatus(cell(row, cols.status));
        if (!known) {
          warnings.push(`${company} · ${role}: unknown status "${cell(row, cols.status)}", imported as Applied.`);
        }
        const url = cell(row, cols.url);
        const notes = [
          cell(row, cols.notes),
          cell(row, cols.interview) && `Interview: ${cell(row, cols.interview)}`,
          !known && cell(row, cols.status) && `Original status: ${cell(row, cols.status)}`,
          ...extraNotes(row, header.labels, unmapped),
        ]
          .filter(Boolean)
          .join("\n");
        // A blank or unreadable date becomes today, in the local calendar
        // (the database's own default would be the UTC day).
        const appliedText = cell(row, cols.applied_on);
        const applied = parseDate(cols.applied_on === undefined ? "" : row[cols.applied_on]);
        const payload: AppPayload = {
          ref: `new-${apps.length}`,
          company,
          role,
          url: url || null,
          location: cell(row, cols.location) || null,
          description: cell(row, cols.description) || null,
          applied_on: applied ?? today,
          status,
          status_changed_at:
            cols.status_changed_at === undefined ? null : parseDateTime(row[cols.status_changed_at]),
          notes: notes || null,
        };
        const sameAs = (a: { url: string | null; company: string; role: string }) =>
          (payload.url && a.url && sameUrl(a.url, payload.url)) ||
          (key(a.company) === key(company) && key(a.role) === key(role));
        const duplicateOf = existingApps.find(sameAs) ?? null;
        const repeatInFile = apps.some((p) => sameAs(p.row));
        if (repeatInFile) continue;
        if (!applied && !duplicateOf) {
          if (appliedText) warnings.push(`${company} · ${role}: couldn't read the applied date "${appliedText}", set to today.`);
          else undated++;
        }
        apps.push({ row: payload, duplicateOf, include: !duplicateOf });
      }
    }
  }

  // Match each assessment to an application: existing ones and the new
  // rows above (duplicates resolve to the existing app they duplicate).
  type Candidate = { target: Exclude<AssessmentTarget, null>; company: string; role: string; url: string | null };
  const candidates: Candidate[] = [
    ...existingApps.map((a) => ({ target: { existing: a.id }, company: a.company, role: a.role, url: a.url })),
    ...apps
      .filter((p) => !p.duplicateOf)
      .map((p) => ({ target: { ref: p.row.ref }, company: p.row.company, role: p.row.role, url: p.row.url })),
  ];

  const assessments: PlannedAssessment[] = pendingAssessments.map((a) => {
    const sameCompany = candidates.filter((c) => key(c.company) === key(a.company));
    const exact = a.role ? sameCompany.filter((c) => key(c.role) === key(a.role)) : [];
    let pick: Candidate | undefined;
    let match: PlannedAssessment["match"] = "none";
    if (exact.length === 1) {
      [pick, match] = [exact[0], "exact"];
    } else if (sameCompany.length === 1) {
      [pick, match] = [sameCompany[0], "company"];
    } else if (sameCompany.length > 1) {
      // A job id in the title/notes/link ("Ref: 131999") that appears in
      // exactly one candidate's posting URL.
      const ids = `${a.row.title} ${a.row.notes ?? ""} ${a.row.link ?? ""}`.match(/\d{5,}/g) ?? [];
      const byId = sameCompany.filter((c) => c.url && ids.some((id) => c.url!.includes(id)));
      if (byId.length === 1) [pick, match] = [byId[0], "ref-number"];
      else match = "ambiguous";
    }
    const duplicate = Boolean(
      pick &&
        "existing" in pick.target &&
        existingAssessments.some(
          (e) =>
            e.application_id === (pick!.target as { existing: string }).existing &&
            key(e.title) === key(a.row.title)
        )
    );
    return { ...a, target: pick?.target ?? null, match, duplicate, include: Boolean(pick) && !duplicate };
  });

  if (undated) {
    warnings.push(`${undated} ${undated === 1 ? "application has" : "applications have"} no applied date, set to today (${formatDate(today)}).`);
  }

  return { apps, assessments, sheets: sheetReports, warnings };
}

// What gets sent to the import_rows RPC.
export function toImportPayload(plan: ImportPlan) {
  const includedRefs = new Set(plan.apps.filter((p) => p.include).map((p) => p.row.ref));
  return {
    applications: plan.apps.filter((p) => p.include).map((p) => p.row),
    assessments: plan.assessments
      .filter((a) => a.include && a.target && ("existing" in a.target || includedRefs.has(a.target.ref)))
      .map((a) => ({
        ...a.row,
        ...(a.target && "existing" in a.target
          ? { application_id: a.target.existing }
          : { application_ref: (a.target as { ref: string }).ref }),
      })),
  };
}
