import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  applicationRows,
  assessmentRows,
  buildExportXlsx,
  buildTemplateXlsx,
} from "@/lib/tracker/export";
import {
  APP_FIELDS,
  ASSESSMENT_FIELDS,
  buildImportPlan,
  readSheets,
  type ImportPlan,
  type RawSheet,
} from "@/lib/tracker/io";
import { makeApp, makeAssessment, makeQuestion, local } from "../helpers/fixtures";

// What the user exports is what they should be able to import: through the
// real XLSX writer and reader, not just the plan builder.

const apps = [
  makeApp({
    id: "app-1",
    company: "Acme",
    role: "Software Engineer Intern",
    url: "https://acme.com/jobs/1",
    location: "Toronto, ON",
    applied_on: "2026-09-01",
    status: "oa",
    status_changed_at: local(2026, 9, 10, 14, 30),
    notes: "Referred by Priya\nFollow up Friday",
    description: "Build things.",
  }),
  makeApp({ id: "app-2", company: "Beta Labs", role: "Data Intern", applied_on: "2026-09-05" }),
  makeApp({
    id: "app-3",
    company: "Gamma",
    role: "Front End SWE",
    url: "https://gamma.io/careers/42?gh_src=x",
    applied_on: "2026-09-08",
    status: "rejected",
    status_changed_at: local(2026, 9, 20, 9, 5),
  }),
];

const assessments = [
  makeAssessment({
    id: "asmt-1",
    application_id: "app-1",
    kind: "oa",
    title: "CodeSignal GCA",
    details: "Four problems\nOne hard",
    duration_min: 70,
    due_at: local(2026, 10, 10, 23, 59),
    link: "https://codesignal.com/s/abc",
    important: true,
    status: "completed",
    completed_at: local(2026, 10, 8, 16, 45),
    difficulty: 4,
    outcome: "passed",
    score: "800/850",
    prep_notes: "Graphs, DP",
    reflection: "Ran out of time on Q4",
    notes: "Quiet room",
  }),
  makeAssessment({
    id: "asmt-2",
    application_id: "app-1",
    kind: "interview",
    title: "Technical interview",
    due_at: local(2026, 10, 15, 10, 0),
    interviewer: "Sam Lee",
    duration_min: 45,
  }),
  makeAssessment({ id: "asmt-3", application_id: "app-2", kind: "video_interview", title: "HireVue" }),
];

const questions = [
  makeQuestion({ assessment_id: "asmt-1", source: "expected", question: "Reverse a linked list", answer: "Iterate with prev/next" }),
  makeQuestion({ assessment_id: "asmt-1", source: "expected", question: "Detect a cycle", answer: null }),
  makeQuestion({ assessment_id: "asmt-1", source: "asked", question: "Longest substring", answer: "Sliding window" }),
  makeQuestion({ assessment_id: "asmt-2", source: "expected", question: "Explain the CAP theorem", answer: null }),
];

async function readBytes(bytes: ArrayBuffer | string, name: string): Promise<RawSheet[]> {
  return readSheets(new File([bytes], name));
}

const importedApps = (p: ImportPlan) =>
  p.apps.map((a) => Object.fromEntries(Object.entries(a.row).filter(([key]) => key !== "ref")));

describe("XLSX export -> import", () => {
  let sheets: RawSheet[];
  let fresh: ImportPlan;

  // The first call loads ExcelJS and SheetJS cold, which can take well over
  // the 5 s test timeout on a busy machine; doing it here keeps that from
  // failing every test below with "undefined".
  beforeAll(async () => {
    sheets = await readBytes(await buildExportXlsx(apps, assessments, questions), "export.xlsx");
    fresh = buildImportPlan(sheets, [], []);
  }, 60_000);

  it("exports a workbook the importer can read", () => {
    expect(sheets.map((s) => s.name)).toEqual(["Applications", "Assessments"]);
    expect(fresh.sheets.map((s) => [s.name, s.kind, s.problem])).toEqual([
      ["Applications", "applications", null],
      ["Assessments", "assessments", null],
    ]);
    expect(fresh.warnings).toEqual([]);
  });

  it("every exported column is recognized by its exact name", () => {
    for (const sheet of fresh.sheets) {
      for (const col of sheet.columns) {
        expect(col.key, `${sheet.name} / ${col.header}`).not.toBeNull();
        expect(col.guessed, `${sheet.name} / ${col.header}`).toBe(false);
      }
    }
  });

  it("brings the applications back unchanged", () => {
    expect(importedApps(fresh)).toEqual(
      apps.map((a) => ({
        company: a.company,
        role: a.role,
        url: a.url,
        location: a.location,
        description: a.description,
        applied_on: a.applied_on,
        status: a.status,
        status_changed_at: a.status_changed_at,
        notes: a.notes,
      }))
    );
    expect(fresh.apps.every((a) => a.include && !a.duplicateOf)).toBe(true);
  });

  it("brings the assessments back unchanged, attached to the right applications", () => {
    expect(fresh.assessments).toHaveLength(3);
    const refs = fresh.apps.map((a) => a.row.ref);
    expect(fresh.assessments.map((a) => a.target)).toEqual([{ ref: refs[0] }, { ref: refs[0] }, { ref: refs[1] }]);
    expect(fresh.assessments.every((a) => a.match === "exact" && a.include)).toBe(true);

    const [gca, tech, hirevue] = fresh.assessments.map((a) => a.row);
    expect(gca).toEqual({
      kind: "oa",
      title: "CodeSignal GCA",
      details: "Four problems\nOne hard",
      duration_min: 70,
      due_at: assessments[0].due_at,
      interviewer: null,
      link: "https://codesignal.com/s/abc",
      important: true,
      status: "completed",
      completed_at: assessments[0].completed_at,
      notes: "Quiet room",
      difficulty: 4,
      outcome: "passed",
      score: "800/850",
      prep_notes: "Graphs, DP",
      reflection: "Ran out of time on Q4",
      questions: [
        { source: "expected", question: "Reverse a linked list", answer: "Iterate with prev/next" },
        { source: "expected", question: "Detect a cycle", answer: null },
        { source: "asked", question: "Longest substring", answer: "Sliding window" },
      ],
    });
    expect(tech).toMatchObject({
      kind: "interview",
      title: "Technical interview",
      due_at: assessments[1].due_at,
      interviewer: "Sam Lee",
      duration_min: 45,
      important: false,
      status: "pending",
      completed_at: null,
      outcome: null,
      questions: [{ source: "expected", question: "Explain the CAP theorem", answer: null }],
    });
    expect(hirevue).toMatchObject({ kind: "video_interview", title: "HireVue", due_at: null, questions: [] });
  });

  it("importing it again into the same data finds only duplicates", () => {
    const again = buildImportPlan(sheets, apps, assessments);
    expect(again.apps.every((a) => !a.include && a.duplicateOf)).toBe(true);
    expect(again.assessments.every((a) => a.duplicate && !a.include)).toBe(true);
    expect(again.warnings).toEqual([]);
  });

  it("an empty tracker exports and re-imports cleanly", async () => {
    const empty = await readBytes(await buildExportXlsx([], [], []), "empty.xlsx");
    const p = buildImportPlan(empty, [], []);
    expect(p.apps).toEqual([]);
    expect(p.assessments).toEqual([]);
    expect(p.sheets.every((s) => !s.problem)).toBe(true);
  });

  it("an answer's line breaks are flattened to ' / ' (the one lossy spot)", async () => {
    const q = makeQuestion({ assessment_id: "asmt-1", source: "asked", question: "Q", answer: "Line one\nLine two" });
    const read = await readBytes(await buildExportXlsx(apps, assessments, [q]), "x.xlsx");
    const p = buildImportPlan(read, [], []);
    expect(p.assessments[0].row.questions).toEqual([{ source: "asked", question: "Q", answer: "Line one / Line two" }]);
  });
});

describe("the XLSX summary", () => {
  // Each sheet's summary formula cells by address. (Read `cell.result`:
  // ExcelJS's `cell.value` drops a cached 0.)
  async function summary(bytes: ArrayBuffer) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    return wb.worksheets.map((ws) => {
      const cells: Record<string, { formula: string; result: unknown }> = {};
      for (let r = 3; r <= 10; r++) {
        for (let c = 1; c <= 6; c++) {
          const cell = ws.getCell(r, c);
          if (cell.type === ExcelJS.ValueType.Formula) cells[cell.address] = { formula: cell.formula, result: cell.result };
        }
      }
      return { ws, cells };
    });
  }

  let sheets: Awaited<ReturnType<typeof summary>>;
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 3, 12, 0));
    sheets = await summary(await buildExportXlsx(apps, assessments, questions));
    vi.useRealTimers();
  }, 60_000);

  it("every stat is a formula, with today's value cached", () => {
    const [a, s] = sheets.map((x) => Object.fromEntries(Object.entries(x.cells).map(([k, v]) => [k, v.result])));
    expect(a).toEqual({
      A4: 3, B4: 0, C4: 1, D4: 2 / 3, E4: 1, F4: 0,
      A5: "0 this week", B5: "0 last week", C5: "3 of 3", D5: "2 of 3", E5: "33%",
      A7: "Ghosted (30d+, no reply): 0% — 0 of 1 applied 30+ days ago",
      A8: "Speedrun rejection: 12 days — Gamma · Front End SWE",
      A9: "Typical time to rejection: 12 days",
    });
    expect(s).toEqual({
      A4: 3, B4: 2, C4: 0, D4: 0, E4: 1, F4: 0,
      A5: "1 completed", D5: undefined, E5: "1 of 1 with a result", // D5 is "", which reads back as nothing
      A7: "Procrastination index: 2 days early — 0% done in the final 24h",
      A8: "Time in assessments: 70 min — completed ones, from the listed durations",
      A9: "Average difficulty: 4.0 / 5 — over 1 rated one",
      A10: "Hardest so far: 4 / 5 — Acme · CodeSignal GCA",
    });
    for (const { cells } of sheets) {
      for (const { formula } of Object.values(cells)) expect(formula).toMatch(/Applications\[|Assessments\[/);
    }
  });

  it("the table runs at least 300 rows past the header", () => {
    for (const { ws } of sheets) {
      const header = ws.getColumn(1).values.indexOf("Company");
      expect(ws.getCell(header + 300, 1).border?.bottom).toBeDefined();
    }
  });
});

describe("CSV export -> import", () => {
  async function toCsv(rows: Record<string, unknown>[]): Promise<string> {
    const XLSX = await import("xlsx");
    return XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows));
  }

  it("brings the applications back unchanged", async () => {
    const sheets = await readBytes(await toCsv(applicationRows(apps)), "apps.csv");
    const p = buildImportPlan(sheets, [], []);
    expect(p.sheets[0]).toMatchObject({ kind: "applications", problem: null });
    expect(p.warnings).toEqual([]);
    expect(importedApps(p)).toEqual(
      apps.map((a) => ({
        company: a.company,
        role: a.role,
        url: a.url,
        location: a.location,
        description: a.description,
        applied_on: a.applied_on,
        status: a.status,
        status_changed_at: a.status_changed_at,
        notes: a.notes,
      }))
    );
  });

  it("brings the assessments back unchanged, matched to tracked applications", async () => {
    const sheets = await readBytes(await toCsv(assessmentRows(assessments, apps, questions)), "asmts.csv");
    const p = buildImportPlan(sheets, apps, []);
    expect(p.sheets[0]).toMatchObject({ kind: "assessments", problem: null });
    expect(p.assessments.map((a) => [a.row.title, a.target])).toEqual([
      ["CodeSignal GCA", { existing: "app-1" }],
      ["Technical interview", { existing: "app-1" }],
      ["HireVue", { existing: "app-2" }],
    ]);
    const [gca, tech] = p.assessments.map((a) => a.row);
    expect(gca).toMatchObject({
      due_at: assessments[0].due_at,
      completed_at: assessments[0].completed_at,
      status: "completed",
      outcome: "passed",
      difficulty: 4,
      duration_min: 70,
      important: true,
    });
    expect(gca.questions).toHaveLength(3);
    expect(tech.due_at).toBe(assessments[1].due_at);
  });
});

describe("reading CSV text", () => {
  const read = async (text: string) => buildImportPlan(await readBytes(text, "in.csv"), [], []);

  it("reads slashed dates day-first, as typed (SheetJS would guess month-first)", async () => {
    const p = await read("Company,Role,Applied\nAcme,SWE,03/04/26\nBeta,SDE,25/09/26\n");
    expect(p.apps.map((a) => a.row.applied_on)).toEqual(["2026-04-03", "2026-09-25"]);
    expect(p.warnings).toEqual([]);
  });

  it("keeps an ISO timestamp as the same instant", async () => {
    const p = await read("Company,Role,Applied,Status changed\nAcme,SWE,2026-09-01,2026-09-10T18:30:00.000Z\n");
    expect(p.apps[0].row.status_changed_at).toBe("2026-09-10T18:30:00.000Z");
  });

  it("keeps accents and arrows", async () => {
    const p = await read("Company,Role,Notes\nCafé Münch,Développeur,naïve → ok\n");
    expect(p.apps[0].row).toMatchObject({ company: "Café Münch", role: "Développeur", notes: "naïve → ok" });
  });

  it("reads a Windows-1252 CSV (Excel's plain 'CSV' format)", async () => {
    const bytes = Uint8Array.from(Buffer.from("Company,Role,Notes\nCafé Münch,Développeur,naïve\n", "latin1"));
    const p = buildImportPlan(await readSheets(new File([bytes], "excel.csv")), [], []);
    expect(p.apps[0].row).toMatchObject({ company: "Café Münch", role: "Développeur", notes: "naïve" });
  });

  it("handles quoted commas, quotes and line breaks", async () => {
    const p = await read('Company,Role,Notes\n"Acme, Inc.","SWE ""Intern""","line one\nline two"\n');
    expect(p.apps[0].row).toMatchObject({ company: "Acme, Inc.", role: 'SWE "Intern"', notes: "line one\nline two" });
  });

  it("ignores a UTF-8 byte-order mark and Windows line endings", async () => {
    const p = await read("﻿Company,Role\r\nAcme,SWE\r\nBeta,SDE\r\n");
    expect(p.apps.map((a) => a.row.company)).toEqual(["Acme", "Beta"]);
  });

  it("keeps text that looks like a number exactly as written", async () => {
    const p = await read("Company,Role,Location,Notes\n007 Labs,SWE,1e3,00123\n");
    expect(p.apps[0].row).toMatchObject({ company: "007 Labs", location: "1e3", notes: "00123" });
  });
});

describe("the blank template", () => {
  it("every suggested column is recognized as the field it names", async () => {
    const sheets = await readBytes(await buildTemplateXlsx(), "template.xlsx");
    const p = buildImportPlan(sheets, [], []);
    const byName = Object.fromEntries(p.sheets.map((s) => [s.name, s]));
    expect(byName.Applications.problem).toBeNull();
    expect(byName.Assessments.problem).toBeNull();
    expect(byName.Applications.columns.map((c) => c.key)).toEqual(Object.keys(APP_FIELDS));
    expect(byName.Assessments.columns.map((c) => c.key)).toEqual(Object.keys(ASSESSMENT_FIELDS));
    expect(p.apps).toEqual([]);
    expect(p.assessments).toEqual([]);
  });
});
