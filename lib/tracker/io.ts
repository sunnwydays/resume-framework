// CSV/XLSX import and export for the job tracker. Reading/writing files
// goes through SheetJS (dynamically imported, so it only loads when used);
// everything else here is pure so the header matching can be tested on its
// own.

import {
  STATUSES,
  kindLabel,
  sameUrl,
  statusLabel,
  type AppStatus,
  type Application,
  type Assessment,
  type AssessmentKind,
} from "@/lib/tracker/format";

// ------------------------------------------------------------------ export

const pad = (n: number) => String(n).padStart(2, "0");
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Column names double as import aliases, so an export re-imports cleanly.
function applicationRows(apps: Application[]) {
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

function assessmentRows(assessments: Assessment[], apps: Application[]) {
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
    Notes: s.notes ?? "",
  }));
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
  assessments: Assessment[]
) {
  const XLSX = await import("xlsx");
  const appSheet = XLSX.utils.json_to_sheet(applicationRows(apps));
  const asmtSheet = XLSX.utils.json_to_sheet(assessmentRows(assessments, apps));
  if (format === "xlsx") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, appSheet, "Applications");
    XLSX.utils.book_append_sheet(wb, asmtSheet, "Assessments");
    XLSX.writeFile(wb, `job-tracker-${stamp()}.xlsx`);
  } else {
    const csv = (ws: typeof appSheet) =>
      new Blob([XLSX.utils.sheet_to_csv(ws)], { type: "text/csv;charset=utf-8" });
    download(csv(appSheet), `job-tracker-applications-${stamp()}.csv`);
    download(csv(asmtSheet), `job-tracker-assessments-${stamp()}.csv`);
  }
}

// ------------------------------------------------------------------ import

export interface RawSheet {
  name: string;
  rows: unknown[][];
}

export async function readSheets(file: File): Promise<RawSheet[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
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

const APP_COLUMNS = {
  company: ["company", "company name", "employer"],
  role: ["role", "role title", "position", "job title", "title"],
  url: ["link to job advert", "link", "url", "job link", "posting", "job url"],
  location: ["location"],
  applied_on: ["applied", "date", "date applied", "applied on", "application date"],
  status: ["status", "response"],
  status_changed_at: ["status changed"],
  notes: ["notes"],
  interview: ["interview time date interviewer name", "interview", "interviews"],
  accepted: ["accepted"],
  description: ["description", "job description"],
} as const;

const ASSESSMENT_COLUMNS = {
  company: ["company", "company name"],
  role: ["role", "role title", "position"],
  kind: ["type", "kind"],
  title: ["sub assessment", "title", "assessment", "name"],
  details: ["breakdown details", "details", "breakdown"],
  duration: ["duration", "length"],
  due: ["due", "due date", "deadline", "scheduled", "date"],
  interviewer: ["interviewer"],
  link: ["link", "url"],
  important: ["important", "priority"],
  status: ["status"],
  completed_at: ["completed at", "completed on"],
  notes: ["notes"],
} as const;

// Headers that only an assessment sheet would have.
const ASSESSMENT_MARKERS = ["sub assessment", "breakdown details", "due date", "due", "duration", "deadline", "type"];

type ColumnMap<K extends string> = Partial<Record<K, number>>;

function mapColumns<K extends string>(
  headers: string[],
  spec: Record<K, readonly string[]>
): ColumnMap<K> {
  const map: ColumnMap<K> = {};
  const used = new Set<number>();
  // Exact alias matches, in alias priority order, so "role title" wins
  // over a later "title" column.
  for (const key of Object.keys(spec) as K[]) {
    for (const alias of spec[key]) {
      const idx = headers.findIndex((h, i) => h === alias && !used.has(i));
      if (idx >= 0) {
        map[key] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return map;
}

// The header row is the first row (in the top 15) with a "company" column;
// anything above it (titles, hand-typed totals) is ignored.
function findHeader(rows: unknown[][]): { index: number; headers: string[] } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const headers = rows[i].map(normalizeHeader);
    if (headers.some((h) => APP_COLUMNS.company.includes(h as never))) {
      return { index: i, headers };
    }
  }
  return null;
}

const cell = (row: unknown[], idx: number | undefined): string =>
  idx === undefined ? "" : String(row[idx] ?? "").trim();

// Excel serial (days since 1899-12-30) -> Date (UTC midnight).
function fromSerial(n: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000));
}

// -> YYYY-MM-DD. Slashed dates are day-first (the old sheet's dd/mm/yy).
export function parseDate(value: unknown): string | null {
  if (value === "" || value == null) return null;
  if (typeof value === "number" && value > 20000 && value < 80000) {
    return fromSerial(value).toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3];
    return `${year}-${pad(+dmy[2])}-${pad(+dmy[1])}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? null
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// -> ISO timestamp. A bare date becomes 23:59 local that day (a deadline).
export function parseDateTime(value: unknown): string | null {
  if (value === "" || value == null) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === "number" && value % 1 !== 0) {
    // Serial with a time part: treat its wall-clock as local time.
    const d = fromSerial(value);
    return new Date(
      d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()
    ).toISOString();
  }
  const date = parseDate(value);
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
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

function parseDuration(value: string): number | null {
  const hours = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour)/i.exec(value);
  if (hours) return Math.round(parseFloat(hours[1]) * 60);
  const n = /(\d+)/.exec(value);
  return n ? parseInt(n[1], 10) : null;
}

const parseBool = (v: string) => /^(y|yes|true|1|x|✓|✔|important|high)$/i.test(v.trim());

export interface AppPayload {
  ref: string;
  company: string;
  role: string;
  url: string | null;
  location: string | null;
  description: string | null;
  applied_on: string | null;
  status: AppStatus;
  status_changed_at: string | null;
  notes: string | null;
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

export interface ImportPlan {
  apps: PlannedApp[];
  assessments: PlannedAssessment[];
  warnings: string[];
}

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function buildImportPlan(
  sheets: RawSheet[],
  existingApps: Application[],
  existingAssessments: Assessment[]
): ImportPlan {
  const warnings: string[] = [];
  const apps: PlannedApp[] = [];
  const pendingAssessments: Omit<PlannedAssessment, "target" | "match" | "duplicate" | "include">[] = [];

  for (const sheet of sheets) {
    const header = findHeader(sheet.rows);
    if (!header) {
      warnings.push(`Sheet "${sheet.name}": no header row with a "Company" column, skipped.`);
      continue;
    }
    const body = sheet.rows.slice(header.index + 1);
    const isAssessmentSheet = header.headers.some((h) => ASSESSMENT_MARKERS.includes(h));

    if (isAssessmentSheet) {
      const cols = mapColumns(header.headers, ASSESSMENT_COLUMNS);
      for (const row of body) {
        const company = cell(row, cols.company);
        const title = cell(row, cols.title);
        if (!company || !title) continue;
        const details = cell(row, cols.details);
        const status = /complet|done|submitted|finished/i.test(cell(row, cols.status))
          ? "completed"
          : "pending";
        pendingAssessments.push({
          company,
          role: cell(row, cols.role),
          row: {
            kind: parseKind(cell(row, cols.kind), title, details),
            title,
            details: details || null,
            duration_min: parseDuration(cell(row, cols.duration)),
            due_at: parseDateTime(cols.due === undefined ? "" : row[cols.due]),
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
              ]
                .filter(Boolean)
                .join(" · ") || null,
          },
        });
      }
    } else {
      const cols = mapColumns(header.headers, APP_COLUMNS);
      if (cols.role === undefined) {
        warnings.push(`Sheet "${sheet.name}": no "Role" column, skipped.`);
        continue;
      }
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
          cell(row, cols.accepted) && `Accepted: ${cell(row, cols.accepted)}`,
          !known && cell(row, cols.status) && `Original status: ${cell(row, cols.status)}`,
        ]
          .filter(Boolean)
          .join("\n");
        const payload: AppPayload = {
          ref: `new-${apps.length}`,
          company,
          role,
          url: url || null,
          location: cell(row, cols.location) || null,
          description: cell(row, cols.description) || null,
          applied_on: parseDate(cols.applied_on === undefined ? "" : row[cols.applied_on]),
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

  return { apps, assessments, warnings };
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
