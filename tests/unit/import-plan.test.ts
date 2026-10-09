import { describe, expect, it } from "vitest";
import {
  buildImportPlan,
  suggestApplications,
  toImportPayload,
  type ApplicationOption,
  type ImportOverrides,
  type RawSheet,
} from "@/lib/tracker/io";
import type { Application, Assessment } from "@/lib/tracker/format";
import { makeApp, makeAssessment } from "../helpers/fixtures";

const TODAY = "2026-10-03";
const sheet = (rows: unknown[][], name = "Sheet1"): RawSheet => ({ name, rows });
const plan = (
  sheets: RawSheet[],
  existing: Application[] = [],
  existingAsmts: Assessment[] = [],
  overrides: ImportOverrides = {}
) => buildImportPlan(sheets, existing, existingAsmts, overrides, TODAY);

const APP_HEADER = ["Company", "Role", "Link", "Location", "Applied", "Status", "Notes"];
const ASMT_HEADER = ["Company", "Role", "Type", "Title", "Duration", "Due", "Link", "Important", "Status"];

describe("applications sheet", () => {
  it("reads a well-formed row", () => {
    const p = plan([
      sheet([APP_HEADER, ["Acme", "SWE Intern", "https://acme.com/jobs/1", "Toronto", "25/09/26", "OA", "referral"]]),
    ]);
    expect(p.apps).toHaveLength(1);
    expect(p.apps[0]).toMatchObject({
      include: true,
      duplicateOf: null,
      row: {
        ref: "new-0",
        company: "Acme",
        role: "SWE Intern",
        url: "https://acme.com/jobs/1",
        location: "Toronto",
        description: null,
        applied_on: "2026-09-25",
        status: "oa",
        status_changed_at: null,
        notes: "referral",
      },
    });
    expect(p.warnings).toEqual([]);
    expect(p.sheets[0]).toMatchObject({ kind: "applications", autoKind: "applications", problem: null });
  });

  it("skips title and totals rows above the header", () => {
    const p = plan([
      sheet([["My job hunt 2026"], ["Total applied: 12"], [], APP_HEADER, ["Acme", "SWE", "", "", "2026-09-01", "", ""]]),
    ]);
    expect(p.apps.map((a) => a.row.company)).toEqual(["Acme"]);
  });

  it("skips rows without a company or a role", () => {
    const p = plan([sheet([APP_HEADER, ["", "SWE"], ["Acme", ""], ["  ", "  "], ["Real", "Role"]])]);
    expect(p.apps.map((a) => a.row.company)).toEqual(["Real"]);
  });

  it("trims cell text and tolerates short rows", () => {
    const p = plan([sheet([APP_HEADER, ["  Acme  ", "  SWE  "]])]);
    expect(p.apps[0].row).toMatchObject({ company: "Acme", role: "SWE", url: null, location: null, notes: null });
  });

  it("reads numbers in text cells (spreadsheet cells arrive as numbers)", () => {
    const p = plan([sheet([APP_HEADER, ["Acme", "SWE", "", "", 46290]])]);
    expect(p.apps[0].row.applied_on).toBe("2026-09-25");
  });

  describe("headers", () => {
    it("accepts the old sheet's wording, typos and decorations", () => {
      const p = plan([
        sheet([
          ["Compnay Name", "Positon", "Date\n(dd/mm/yy)", "Response (Drop Down List)"],
          ["Acme", "SWE", "25/09/26", "Rejected"],
        ]),
      ]);
      expect(p.apps[0].row).toMatchObject({ company: "Acme", role: "SWE", applied_on: "2026-09-25", status: "rejected" });
      const cols = p.sheets[0].columns;
      expect(cols.map((c) => c.key)).toEqual(["company", "role", "applied_on", "status"]);
      expect(cols[0].guessed).toBe(true); // keyword/typo match, not exact
      expect(cols[1].guessed).toBe(true);
      expect(cols[2].header).toBe("Date (dd/mm/yy)"); // line break collapsed
    });

    it("a longer alias beats a shorter one ('Interview Date' is not 'Applied')", () => {
      const p = plan([
        sheet([
          ["Company", "Role", "Applied", "Interview Date"],
          ["Acme", "SWE", "01/09/26", "Phone screen Mon"],
        ]),
      ]);
      expect(p.sheets[0].columns.map((c) => c.key)).toEqual(["company", "role", "applied_on", "interview"]);
      expect(p.apps[0].row.applied_on).toBe("2026-09-01");
      expect(p.apps[0].row.notes).toBe("Interview: Phone screen Mon");
    });

    it("each column feeds one field and each field takes one column", () => {
      const p = plan([sheet([["Company", "Company Name", "Role", "Position"], ["A", "B", "C", "D"]])]);
      const keys = p.sheets[0].columns.map((c) => c.key).filter(Boolean);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("keeps unrecognized columns in the notes as 'Header: value'", () => {
      const p = plan([sheet([[...APP_HEADER, "Referrer", "Salary"], ["Acme", "SWE", "", "", "", "", "ref", "Priya", ""]])]);
      expect(p.apps[0].row.notes).toBe("ref\nReferrer: Priya");
      expect(p.sheets[0].columns.find((c) => c.header === "Referrer")?.key).toBeNull();
    });

    it("reports a sample value per column, shortened", () => {
      const long = "x".repeat(60);
      const p = plan([sheet([["Company", "Role", "Notes"], ["Acme", "SWE", ""], ["Beta", "SDE", long]])]);
      const [company, , notes] = p.sheets[0].columns;
      expect(company.sample).toBe("Acme");
      expect(notes.sample).toBe(`${"x".repeat(40)}…`);
    });
  });

  describe("applied date", () => {
    const row = (applied: unknown) => plan([sheet([APP_HEADER, ["Acme", "SWE", "", "", applied]])]);

    it("a blank date becomes today, with one summary warning", () => {
      const p = plan([sheet([APP_HEADER, ["Acme", "SWE"], ["Beta", "SDE"]])]);
      expect(p.apps.map((a) => a.row.applied_on)).toEqual([TODAY, TODAY]);
      expect(p.warnings).toEqual(["2 applications have no applied date, set to today (03/10/26)."]);
    });
    it("uses the singular for one", () => {
      expect(row("").warnings).toEqual(["1 application has no applied date, set to today (03/10/26)."]);
    });
    it("a missing Applied column behaves the same", () => {
      const p = plan([sheet([["Company", "Role"], ["Acme", "SWE"]])]);
      expect(p.apps[0].row.applied_on).toBe(TODAY);
      expect(p.warnings).toHaveLength(1);
    });
    it("an unreadable date becomes today and names the bad text", () => {
      const p = row("TBD");
      expect(p.apps[0].row.applied_on).toBe(TODAY);
      expect(p.warnings).toEqual([`Acme · SWE: couldn't read the applied date "TBD", set to today.`]);
    });
    it("an impossible date doesn't break the import", () => {
      const p = row("31/02/26");
      expect(p.apps).toHaveLength(1);
      expect(p.apps[0].row.applied_on).toBe(TODAY);
    });
    it("month-first dates are read as such", () => {
      expect(row("09/25/26").apps[0].row.applied_on).toBe("2026-09-25");
      expect(row("09/25/26").warnings).toEqual([]);
    });
    it("rows that won't be imported don't add warnings", () => {
      const existing = makeApp({ company: "Acme", role: "SWE" });
      expect(plan([sheet([APP_HEADER, ["Acme", "SWE"]])], [existing]).warnings).toEqual([]);
    });
  });

  describe("status", () => {
    it("reads the status", () => {
      const p = plan([sheet([APP_HEADER, ["Acme", "SWE", "", "", "01/09/26", "Withdrawn"]])]);
      expect(p.apps[0].row.status).toBe("withdrawn");
    });
    it("an unknown status imports as Applied, with a warning and the original kept", () => {
      const p = plan([sheet([APP_HEADER, ["Acme", "SWE", "", "", "01/09/26", "Ghosted"]])]);
      expect(p.apps[0].row.status).toBe("applied");
      expect(p.apps[0].row.notes).toBe("Original status: Ghosted");
      expect(p.warnings).toEqual([`Acme · SWE: unknown status "Ghosted", imported as Applied.`]);
    });
    it("reads a status-changed column", () => {
      const p = plan([
        sheet([[...APP_HEADER, "Status changed"], ["Acme", "SWE", "", "", "01/09/26", "OA", "", "2026-09-10T15:00:00Z"]]),
      ]);
      expect(p.apps[0].row.status_changed_at).toBe("2026-09-10T15:00:00.000Z");
    });
  });

  describe("duplicates", () => {
    it("flags an existing application with the same link, ignoring tracking params", () => {
      const existing = makeApp({ company: "Other", role: "Other", url: "https://www.acme.com/jobs/1/" });
      const p = plan([sheet([APP_HEADER, ["Acme", "SWE", "https://acme.com/jobs/1?utm_source=x"]])], [existing]);
      expect(p.apps[0]).toMatchObject({ include: false, duplicateOf: existing });
    });
    it("flags the same company and role, ignoring case and spacing", () => {
      const existing = makeApp({ company: "Acme", role: "Software  Engineer" });
      const p = plan([sheet([APP_HEADER, ["  ACME ", "software engineer"]])], [existing]);
      expect(p.apps[0]).toMatchObject({ include: false, duplicateOf: existing });
    });
    it("same company, different role is a new application", () => {
      const existing = makeApp({ company: "Acme", role: "SWE" });
      const p = plan([sheet([APP_HEADER, ["Acme", "Data"]])], [existing]);
      expect(p.apps[0]).toMatchObject({ include: true, duplicateOf: null });
    });
    it("drops repeats inside the file, keeping the first", () => {
      const p = plan([sheet([APP_HEADER, ["Acme", "SWE", "", "", "01/09/26"], ["acme", "swe", "", "", "05/09/26"], ["Acme", "Data"]])]);
      expect(p.apps.map((a) => [a.row.role, a.row.applied_on])).toEqual([
        ["SWE", "2026-09-01"],
        ["Data", TODAY],
      ]);
    });
    it("refs are unique per kept row", () => {
      const p = plan([sheet([APP_HEADER, ["A", "x"], ["B", "y"], ["C", "z"]])]);
      expect(p.apps.map((a) => a.row.ref)).toEqual(["new-0", "new-1", "new-2"]);
    });
  });

  describe("sheet problems", () => {
    it("says so when no header is found", () => {
      const p = plan([sheet([["foo", "bar"], ["1", "2"]])]);
      expect(p.sheets[0]).toMatchObject({
        kind: null,
        autoKind: null,
        problem: "Couldn't find a header row with a Company column.",
        columns: [],
      });
      expect(p.apps).toEqual([]);
    });
    it("needs a Role column too", () => {
      const p = plan([sheet([["Company", "Applied"], ["Acme", "01/09/26"]])]);
      expect(p.sheets[0].problem).toBe("Choose which column is the Company and which is the Role.");
      expect(p.sheets[0].columns.length).toBe(2);
      expect(p.apps).toEqual([]);
    });
    it("handles an empty sheet", () => {
      const p = plan([sheet([])]);
      expect(p.sheets[0].problem).toBeTruthy();
      expect(p.apps).toEqual([]);
    });
    it("keeps reading other sheets when one is unreadable", () => {
      const p = plan([sheet([["junk"]], "Notes"), sheet([APP_HEADER, ["Acme", "SWE"]], "Applications")]);
      expect(p.sheets.map((s) => s.name)).toEqual(["Notes", "Applications"]);
      expect(p.apps).toHaveLength(1);
    });
  });
});

describe("assessments sheet", () => {
  const FULL = [
    "Company",
    "Role",
    "Type",
    "Title",
    "Duration",
    "Due",
    "Link",
    "Important",
    "Status",
    "Difficulty",
    "Outcome",
    "Score",
    "Expected questions",
    "Notes",
  ];
  const existing = [makeApp({ id: "app-ramp", company: "Ramp", role: "SWE Intern" })];
  const read = (rows: unknown[][], overrides: ImportOverrides = {}) =>
    plan([sheet(rows)], existing, [], overrides).assessments;

  it("reads every field", () => {
    const [a] = read([
      FULL,
      [
        "Ramp",
        "SWE Intern",
        "OA",
        "CodeSignal GCA",
        "90 min",
        "2026-10-10",
        "https://codesignal.com/x",
        "yes",
        "Completed",
        "hard",
        "Passed",
        "800/850",
        "Two sum → hash map\nLRU cache",
        "calm",
      ],
    ]);
    expect(a.company).toBe("Ramp");
    expect(a.row).toEqual({
      kind: "oa",
      title: "CodeSignal GCA",
      details: null,
      sections: [],
      duration_min: 90,
      due_at: new Date(2026, 9, 10, 23, 59).toISOString(),
      interviewer: null,
      link: "https://codesignal.com/x",
      important: true,
      status: "completed",
      completed_at: null,
      notes: "calm",
      difficulty: 4,
      outcome: "passed",
      score: "800/850",
      prep_notes: null,
      reflection: null,
      questions: [
        { source: "expected", question: "Two sum", answer: "hash map" },
        { source: "expected", question: "LRU cache", answer: null },
      ],
    });
  });

  it("detects the sheet as assessments from its headers", () => {
    const p = plan([sheet([ASMT_HEADER, ["Ramp", "SWE Intern", "OA", "GCA"]])], existing);
    expect(p.sheets[0]).toMatchObject({ kind: "assessments", autoKind: "assessments" });
  });

  it("needs a Title", () => {
    const p = plan([sheet([["Company", "Role", "Due"], ["Ramp", "SWE Intern", "01/10/26"]])], existing, [], {
      Sheet1: { kind: "assessments" },
    });
    expect(p.sheets[0].problem).toBe("Choose which column is the Company and which is the assessment Title.");
    expect(p.assessments).toEqual([]);
  });

  it("skips rows without a company or title", () => {
    expect(read([ASMT_HEADER, ["", "", "OA", "x"], ["Ramp", "", "OA", ""], ["Ramp", "", "OA", "Real"]]).map((a) => a.row.title)).toEqual(["Real"]);
  });

  describe("kind", () => {
    const kindOf = (type: string, title: string) => read([ASMT_HEADER, ["Ramp", "SWE Intern", type, title]])[0].row.kind;
    it.each([
      ["OA", "Coding round", "oa"],
      ["", "Online assessment", "oa"],
      ["Video interview", "Intro", "video_interview"],
      ["", "HireVue", "video_interview"],
      ["", "One-way video", "video_interview"],
      ["Interview", "Final round", "interview"],
      ["", "Technical interview", "interview"],
      ["OA", "Interview prep quiz", "oa"],
    ])("type %j, title %j -> %s", (type, title, expected) => expect(kindOf(type, title)).toBe(expected));
  });

  describe("status and outcome", () => {
    const run = (status: string, outcome = "") => {
      const [a] = read([["Company", "Role", "Type", "Title", "Status", "Outcome"], ["Ramp", "SWE Intern", "OA", "GCA", status, outcome]]);
      return { status: a.row.status, outcome: a.row.outcome };
    };
    it("'Completed' alone is completed with no result", () => {
      expect(run("Completed")).toEqual({ status: "completed", outcome: null });
    });
    it("a pass or fail written in Status means done", () => {
      expect(run("Passed")).toEqual({ status: "completed", outcome: "passed" });
      expect(run("Rejected")).toEqual({ status: "completed", outcome: "failed" });
    });
    it("an Outcome column of pass or fail also means done", () => {
      expect(run("", "Failed")).toEqual({ status: "completed", outcome: "failed" });
      expect(run("Pending", "Passed")).toEqual({ status: "completed", outcome: "passed" });
    });
    it("waiting stays pending", () => {
      expect(run("Waiting")).toEqual({ status: "pending", outcome: null });
      expect(run("", "Waiting")).toEqual({ status: "pending", outcome: "waiting" });
    });
    it("blank is pending", () => {
      expect(run("")).toEqual({ status: "pending", outcome: null });
    });
  });

  describe("values it can't read are kept in the notes, not dropped", () => {
    const [a] = read([
      ["Company", "Role", "Title", "Difficulty", "Outcome", "Due", "Link", "Referrer"],
      ["Ramp", "SWE Intern", "GCA", "super spicy", "maybe", "next Friday", "CodeSignal", "Priya"],
    ]);
    it("keeps them", () => {
      expect(a.row.difficulty).toBeNull();
      expect(a.row.outcome).toBeNull();
      expect(a.row.due_at).toBeNull();
      expect(a.row.link).toBeNull();
      expect(a.row.notes).toBe(
        "Platform: CodeSignal · Difficulty: super spicy · Outcome: maybe · Due: next Friday · Referrer: Priya"
      );
    });
  });

  it("an impossible due date is dropped to notes instead of breaking the import", () => {
    const [a] = read([["Company", "Role", "Title", "Due"], ["Ramp", "SWE Intern", "GCA", "31/02/26"]]);
    expect(a.row.due_at).toBeNull();
    expect(a.row.notes).toBe("Due: 31/02/26");
  });

  it("completed_at only applies to completed ones", () => {
    const rows = [
      ["Company", "Role", "Type", "Title", "Status", "Completed at"],
      ["Ramp", "SWE Intern", "OA", "Done", "Completed", "2026-09-30T10:00:00Z"],
      ["Ramp", "SWE Intern", "OA", "Open", "Pending", "2026-09-30T10:00:00Z"],
    ];
    const [done, open] = read(rows);
    expect(done.row.completed_at).toBe("2026-09-30T10:00:00.000Z");
    expect(open.row.completed_at).toBeNull();
  });

  it("an absurd duration is dropped rather than breaking the import", () => {
    const [a] = read([["Company", "Role", "Title", "Duration"], ["Ramp", "SWE Intern", "GCA", "99999999999"]]);
    expect(a.row.duration_min).toBeNull();
  });
});

describe("column overrides", () => {
  const rows = [["Company", "Role", "Where", "Status"], ["Acme", "SWE", "Toronto", "Rejected"]];

  it("a chosen field wins and is marked manual", () => {
    const p = plan([sheet(rows)], [], [], { Sheet1: { columns: { 2: "location" } } });
    expect(p.apps[0].row.location).toBe("Toronto");
    expect(p.sheets[0].columns[2]).toMatchObject({ key: "location", manual: true });
  });

  it("null sends a column to the notes, even one that would match by name", () => {
    const p = plan([sheet(rows)], [], [], { Sheet1: { columns: { 3: null } } });
    expect(p.apps[0].row.status).toBe("applied");
    expect(p.apps[0].row.notes).toBe("Where: Toronto\nStatus: Rejected");
    expect(p.sheets[0].columns[3]).toMatchObject({ key: null, manual: true });
  });

  it("an override takes the field from the column that matched it automatically", () => {
    const p = plan([sheet([["Company", "Role", "Where", "Location"], ["Acme", "SWE", "A", "B"]])], [], [], {
      Sheet1: { columns: { 2: "location" } },
    });
    expect(p.apps[0].row.location).toBe("A");
    expect(p.apps[0].row.notes).toBe("Location: B");
  });

  it("skip leaves the sheet out without calling it a problem", () => {
    const p = plan([sheet(rows)], [], [], { Sheet1: { kind: "skip" } });
    expect(p.apps).toEqual([]);
    expect(p.sheets[0]).toMatchObject({ kind: null, autoKind: "applications", problem: null });
  });

  it("a kind can be chosen for a sheet with no recognizable header (first row is the header)", () => {
    const unknown = sheet([["Firm", "Job"], ["Acme", "SWE"]]);
    const p = plan([unknown], [], [], { Sheet1: { kind: "applications" } });
    expect(p.apps.map((a) => [a.row.company, a.row.role])).toEqual([["Acme", "SWE"]]);
  });

  it("overrides are per sheet name", () => {
    const p = plan([sheet(rows, "A"), sheet(rows, "B")], [], [], { A: { columns: { 2: "location" } } });
    expect(p.sheets[0].columns[2].key).toBe("location");
    expect(p.sheets[1].columns[2].key).toBeNull();
  });

  it("ignores an override naming a field this kind of sheet doesn't have", () => {
    const p = plan([sheet(rows)], [], [], { Sheet1: { columns: { 2: "difficulty" } } });
    expect(p.sheets[0].columns[2]).toMatchObject({ key: null, manual: true });
    expect(p.apps).toHaveLength(1);
  });
});

describe("attaching assessments to applications", () => {
  const HEADER = ["Company", "Role", "Type", "Title", "Link", "Notes"];
  const attach = (rows: unknown[][], existing: Application[], existingAsmts: Assessment[] = []) =>
    plan([sheet([HEADER, ...rows])], existing, existingAsmts).assessments;

  it("exact company and role", () => {
    const a1 = makeApp({ id: "a1", company: "Acme", role: "SWE" });
    const a2 = makeApp({ id: "a2", company: "Acme", role: "Data" });
    const [m] = attach([["Acme", "data", "OA", "OA"]], [a1, a2]);
    expect(m).toMatchObject({ match: "exact", target: { existing: "a2" }, include: true, duplicate: false });
  });

  it("company alone when it has one application, whatever the role says", () => {
    const [m] = attach([["acme ", "Something else", "OA", "OA"]], [makeApp({ id: "a1", company: "Acme", role: "SWE" })]);
    expect(m).toMatchObject({ match: "company", target: { existing: "a1" }, include: true });
  });

  it("a job id shared with exactly one posting URL", () => {
    const a1 = makeApp({ id: "a1", company: "Acme", role: "X", url: "https://acme.com/jobs/131999" });
    const a2 = makeApp({ id: "a2", company: "Acme", role: "Y", url: "https://acme.com/jobs/200000" });
    const [m] = attach([["Acme", "", "OA", "Assessment (Ref: 131999)"]], [a1, a2]);
    expect(m).toMatchObject({ match: "ref-number", target: { existing: "a1" }, include: true });
  });

  it("looks for the job id in notes and the link too", () => {
    const a1 = makeApp({ id: "a1", company: "Acme", role: "X", url: "https://acme.com/jobs/131999" });
    const a2 = makeApp({ id: "a2", company: "Acme", role: "Y", url: "https://acme.com/jobs/200000" });
    expect(attach([["Acme", "", "OA", "OA", "", "req 200000"]], [a1, a2])[0].target).toEqual({ existing: "a2" });
    expect(attach([["Acme", "", "OA", "OA", "https://hr.example/131999/start"]], [a1, a2])[0].target).toEqual({ existing: "a1" });
  });

  it("is ambiguous when several applications fit and nothing narrows it", () => {
    const apps = [makeApp({ id: "a1", company: "Acme", role: "X" }), makeApp({ id: "a2", company: "Acme", role: "Y" })];
    const [m] = attach([["Acme", "", "OA", "OA"]], apps);
    expect(m).toMatchObject({ match: "ambiguous", target: null, include: false });
  });

  it("is ambiguous when the same job id matches two postings", () => {
    const apps = [
      makeApp({ id: "a1", company: "Acme", role: "X", url: "https://acme.com/jobs/131999?v=1" }),
      makeApp({ id: "a2", company: "Acme", role: "Y", url: "https://acme.com/other/131999" }),
    ];
    expect(attach([["Acme", "", "OA", "Ref 131999"]], apps)[0].match).toBe("ambiguous");
  });

  it("two identical applications fall back to ambiguous, not a guess", () => {
    const apps = [makeApp({ id: "a1", company: "Acme", role: "SWE" }), makeApp({ id: "a2", company: "Acme", role: "SWE" })];
    expect(attach([["Acme", "SWE", "OA", "OA"]], apps)[0]).toMatchObject({ match: "ambiguous", target: null });
  });

  it("no match when the company isn't tracked", () => {
    const [m] = attach([["Nobody", "SWE", "OA", "OA"]], [makeApp({ company: "Acme" })]);
    expect(m).toMatchObject({ match: "none", target: null, include: false });
  });

  it("flags an assessment already on that application (same title, any case)", () => {
    const app = makeApp({ id: "a1", company: "Acme", role: "SWE" });
    const have = makeAssessment({ application_id: "a1", title: "Coding Round" });
    const [m] = attach([["Acme", "SWE", "OA", " coding  round "]], [app], [have]);
    expect(m).toMatchObject({ duplicate: true, include: false, target: { existing: "a1" } });
  });

  it("the same title on a different application is not a duplicate", () => {
    const apps = [makeApp({ id: "a1", company: "Acme", role: "SWE" }), makeApp({ id: "a2", company: "Beta", role: "SWE" })];
    const have = makeAssessment({ application_id: "a1", title: "Coding round" });
    expect(attach([["Beta", "SWE", "OA", "Coding round"]], apps, [have])[0]).toMatchObject({ duplicate: false, include: true });
  });

  describe("with applications from the same file", () => {
    const both = (appRows: unknown[][], asmtRows: unknown[][], existing: Application[] = []) =>
      plan(
        [
          sheet([["Company", "Role", "Applied"], ...appRows], "Applications"),
          sheet([["Company", "Role", "Sub Assessment", "Due Date"], ...asmtRows], "OAs"),
        ],
        existing
      );

    it("attaches to the new application by its ref", () => {
      const p = both([["Acme", "SWE", "01/09/26"]], [["Acme", "SWE", "GCA", "10/10/26"]]);
      expect(p.assessments[0]).toMatchObject({ match: "exact", target: { ref: "new-0" }, include: true });
    });

    it("a new row that duplicates a tracked application resolves to the tracked one", () => {
      const existing = [makeApp({ id: "a1", company: "Acme", role: "SWE" })];
      const p = both([["Acme", "SWE", "01/09/26"]], [["Acme", "SWE", "GCA", "10/10/26"]], existing);
      expect(p.apps[0].include).toBe(false);
      expect(p.assessments[0].target).toEqual({ existing: "a1" });
    });

    it("an unambiguous company match spans both tracked and new applications", () => {
      const existing = [makeApp({ id: "a1", company: "Acme", role: "SWE" })];
      const p = both([["Acme", "Data", "01/09/26"]], [["Acme", "", "GCA", "10/10/26"]], existing);
      expect(p.assessments[0].match).toBe("ambiguous"); // two Acme applications now
    });
  });
});

describe("toImportPayload", () => {
  const build = () =>
    plan(
      [
        sheet([["Company", "Role", "Applied"], ["Acme", "SWE", "01/09/26"], ["Tracked", "Dev", "02/09/26"], ["Beta", "Ops", "03/09/26"]], "Applications"),
        sheet(
          [
            ["Company", "Role", "Sub Assessment", "Due Date"],
            ["Acme", "SWE", "GCA", "10/10/26"],
            ["Tracked", "Dev", "Phone", "11/10/26"],
            ["Beta", "Ops", "Quiz", "12/10/26"],
            ["Nobody", "", "Lost", "13/10/26"],
          ],
          "OAs"
        ),
      ],
      [makeApp({ id: "t1", company: "Tracked", role: "Dev" })]
    );

  it("sends included applications with their refs", () => {
    const p = toImportPayload(build());
    expect(p.applications.map((a) => [a.ref, a.company])).toEqual([
      ["new-0", "Acme"],
      ["new-2", "Beta"], // new-1 was the row already tracked
    ]);
  });

  it("points assessments at an existing id or a new ref", () => {
    const { assessments } = toImportPayload(build());
    expect(assessments.map((a) => [a.title, "application_id" in a ? a.application_id : a.application_ref])).toEqual([
      ["GCA", "new-0"],
      ["Phone", "t1"],
      ["Quiz", "new-2"],
    ]);
  });

  it("leaves out assessments the user excluded", () => {
    const p = build();
    p.assessments[0].include = false;
    expect(toImportPayload(p).assessments.map((a) => a.title)).toEqual(["Phone", "Quiz"]);
  });

  it("drops an assessment whose new application was excluded", () => {
    const p = build();
    p.apps[0].include = false;
    expect(toImportPayload(p).assessments.map((a) => a.title)).toEqual(["Phone", "Quiz"]);
  });

  it("can attach an unmatched assessment by choosing its target", () => {
    const p = build();
    const lost = p.assessments.find((a) => a.row.title === "Lost")!;
    lost.target = { existing: "t1" };
    lost.include = true;
    expect(toImportPayload(p).assessments.map((a) => a.title)).toContain("Lost");
  });
});

describe("suggestApplications", () => {
  const opt = (company: string, role: string, isNew = false): ApplicationOption => ({
    value: `existing:${company}-${role}`,
    company,
    role,
    isNew,
  });
  const names = (list: ApplicationOption[]) => list.map((o) => `${o.company} / ${o.role}`);

  it("ranks the same name above a prefix match above a typo", () => {
    const options = [
      opt("Snowflkae", "SWE"), // one transposition away
      opt("Snowflake Computing Inc.", "SWE"), // starts with it
      opt("Snowflake", "SWE"),
      opt("Microsoft", "SWE"),
    ];
    expect(names(suggestApplications(options, "Snowflake", ""))).toEqual([
      "Snowflake / SWE",
      "Snowflake Computing Inc. / SWE",
      "Snowflkae / SWE",
    ]);
  });

  it("company suffix words do not count, so \"The Snowflake Group\" is the same name", () => {
    const options = [opt("The Snowflake Group", "SWE"), opt("Snowflake Labs", "SWE")];
    expect(names(suggestApplications(options, "Snowflake", ""))).toEqual(["The Snowflake Group / SWE", "Snowflake Labs / SWE"]);
  });

  it("ignores company suffixes and punctuation", () => {
    expect(suggestApplications([opt("Acme, Inc.", "SWE")], "ACME", "")).toHaveLength(1);
    expect(suggestApplications([opt("Acme", "SWE")], "The Acme Corporation", "")).toHaveLength(1);
  });

  it("treats a prefix as close (Snowflake vs Snowflake Computing)", () => {
    expect(suggestApplications([opt("Snowflake Computing Inc.", "SWE")], "Snowflake", "")).toHaveLength(1);
  });

  it("a matching role ranks higher within the same company", () => {
    const options = [opt("Acme", "Data Analyst"), opt("Acme", "SWE Intern"), opt("Acme", "SWE")];
    expect(names(suggestApplications(options, "Acme", "SWE Intern"))[0]).toBe("Acme / SWE Intern");
    expect(names(suggestApplications(options, "Acme", "swe"))[0]).toBe("Acme / SWE");
  });

  it("a role that partly overlaps beats an unrelated one", () => {
    const options = [opt("Acme", "Data Analyst"), opt("Acme", "SWE Intern, Toronto")];
    expect(names(suggestApplications(options, "Acme", "SWE Intern"))[0]).toBe("Acme / SWE Intern, Toronto");
  });

  it("an unrelated company never suggests, whatever the role", () => {
    expect(suggestApplications([opt("Microsoft", "SWE")], "Acme", "SWE")).toEqual([]);
  });

  it("respects the limit", () => {
    const options = Array.from({ length: 10 }, (_, i) => opt("Acme", `Role ${i}`));
    expect(suggestApplications(options, "Acme", "", 3)).toHaveLength(3);
    expect(suggestApplications(options, "Acme", "")).toHaveLength(5);
  });

  it("an empty company suggests nothing", () => {
    expect(suggestApplications([opt("Acme", "SWE")], "", "SWE")).toEqual([]);
    expect(suggestApplications([opt("", "SWE")], "Acme", "SWE")).toEqual([]);
  });
});
