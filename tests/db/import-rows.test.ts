import { afterAll, describe, expect, it } from "vitest";
import { buildImportPlan, toImportPayload, type RawSheet } from "@/lib/tracker/io";
import { local, makeApp } from "../helpers/fixtures";
import { addApplication, asUser, closePool, createUser, dbReady, failure, inTx, type Tx } from "./helpers";

afterAll(closePool);

// import_rows is fed by the app's own plan builder here, so a mismatch
// between what the app sends and what the SQL reads fails this file.

const TODAY = "2026-10-03";

const APPLICATIONS: RawSheet = {
  name: "Applications",
  rows: [
    ["Company", "Role", "Link", "Location", "Applied", "Status", "Status changed", "Notes", "Description"],
    ["Acme", "SWE Intern", "https://acme.com/1", "Toronto", "25/09/26", "OA", "2026-09-30T14:00:00Z", "from sheet", "Build things"],
    ["Beta", "Data Intern", "", "", "", "Rejected", "", "", ""],
  ],
};

const ASSESSMENTS: RawSheet = {
  name: "Assessments",
  rows: [
    [
      "Company", "Role", "Type", "Title", "Details", "Duration", "Due", "Interviewer", "Link", "Important", "Status",
      "Completed at", "Difficulty", "Outcome", "Score", "Prep notes", "Reflection", "Expected questions", "Asked questions", "Notes",
    ],
    [
      "Acme", "SWE Intern", "OA", "GCA", "Four problems", "1h 30m", "2026-10-10", "Sam", "https://codesignal.com/x", "yes", "Completed",
      "2026-10-08T16:45:00Z", "hard", "Passed", "800/850", "Graphs", "Ran out of time", "Q1 → A1\nQ2", "Q3 → A3", "calm",
    ],
    ["Existing Co", "Role", "Interview", "Final round", "", "45", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ],
};

async function run(tx: Tx, payload: unknown) {
  return tx.scalar<{ applications: number; assessments: number }>("select public.import_rows($1::jsonb)", [JSON.stringify(payload)]);
}

const count = (tx: Tx, table: string) => tx.scalar<number>(`select count(*)::int from public.${table}`);

describe.skipIf(!dbReady)("import_rows", () => {
  describe("a real plan from the app's importer", () => {
    it("lands every field in the right place", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const existingId = await addApplication(tx, { company: "Existing Co", role: "Role" });
          const existing = [makeApp({ id: existingId, company: "Existing Co", role: "Role" })];
          const plan = buildImportPlan([APPLICATIONS, ASSESSMENTS], existing, [], {}, TODAY);
          expect(plan.apps.every((a) => a.include)).toBe(true);
          expect(plan.assessments.map((a) => a.match)).toEqual(["exact", "exact"]);

          expect(await run(tx, toImportPayload(plan))).toEqual({ applications: 2, assessments: 2 });

          const acme = await tx.one<Record<string, unknown>>(
            "select *, applied_on::text as applied_text from public.applications where company = 'Acme'"
          );
          expect(acme).toMatchObject({
            role: "SWE Intern",
            url: "https://acme.com/1",
            location: "Toronto",
            description: "Build things",
            source: "import",
            applied_text: "2026-09-25",
            status: "oa",
            notes: "from sheet",
            user_id: user,
          });
          expect((acme.status_changed_at as Date).toISOString()).toBe("2026-09-30T14:00:00.000Z");

          const beta = await tx.one<Record<string, unknown>>(
            "select *, applied_on::text as applied_text from public.applications where company = 'Beta'"
          );
          expect(beta).toMatchObject({ status: "rejected", applied_text: TODAY, source: "import", status_changed_at: null });

          const gca = await tx.one<Record<string, unknown>>("select * from public.assessments where title = 'GCA'");
          expect(gca).toMatchObject({
            kind: "oa",
            details: "Four problems",
            duration_min: 90,
            interviewer: "Sam",
            link: "https://codesignal.com/x",
            important: true,
            status: "completed",
            difficulty: 4,
            outcome: "passed",
            score: "800/850",
            prep_notes: "Graphs",
            reflection: "Ran out of time",
            notes: "calm",
            user_id: user,
          });
          expect((gca.due_at as Date).toISOString()).toBe(local(2026, 10, 10, 23, 59));
          expect((gca.completed_at as Date).toISOString()).toBe("2026-10-08T16:45:00.000Z");
          expect(gca.application_id).toBe(await tx.scalar("select id from public.applications where company = 'Acme'"));

          const final = await tx.one<Record<string, unknown>>("select * from public.assessments where title = 'Final round'");
          expect(final).toMatchObject({ kind: "interview", duration_min: 45, status: "pending", application_id: existingId });

          const questions = await tx.rows<{ source: string; question: string; answer: string | null }>(
            "select source, question, answer from public.assessment_questions where assessment_id = $1 order by source, question",
            [gca.id]
          );
          expect(questions).toEqual([
            { source: "asked", question: "Q3", answer: "A3" },
            { source: "expected", question: "Q1", answer: "A1" },
            { source: "expected", question: "Q2", answer: null },
          ]);
        });
      });
    });

    it("tags the history 'import' and keeps the dates it was given (or none)", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const plan = buildImportPlan([APPLICATIONS], [], [], {}, TODAY);
          await run(tx, toImportPayload(plan));
          const rows = await tx.rows<{ company: string; status: string; origin: string; changed_at: Date | null }>(
            `select a.company, h.status, h.origin, h.changed_at from public.status_changes h
             join public.applications a on a.id = h.application_id order by a.company`
          );
          expect(rows.map((r) => [r.company, r.status, r.origin, r.changed_at?.toISOString() ?? null])).toEqual([
            ["Acme", "oa", "import", "2026-09-30T14:00:00.000Z"],
            ["Beta", "rejected", "import", null],
          ]);
        });
      });
    });

    it("an assessment imported as completed keeps its own completed_at, or none (never 'now')", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const sheet: RawSheet = {
            name: "A",
            rows: [["Company", "Role", "Type", "Title", "Status"], ["Acme", "SWE", "OA", "Round", "Completed"]],
          };
          const apps: RawSheet = { name: "Apps", rows: [["Company", "Role"], ["Acme", "SWE"]] };
          await run(tx, toImportPayload(buildImportPlan([apps, sheet], [], [], {}, TODAY)));
          expect(await tx.scalar("select completed_at from public.assessments where title = 'Round'")).toBeNull();
        });
      });
    });

    it("handles a spreadsheet-sized import in one call", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const apps: RawSheet = {
            name: "Apps",
            rows: [["Company", "Role", "Applied"], ...Array.from({ length: 200 }, (_, i) => [`Company ${i}`, "SWE", `${(i % 28) + 1}/09/26`])],
          };
          const asmts: RawSheet = {
            name: "OAs",
            rows: [["Company", "Role", "Type", "Title"], ...Array.from({ length: 200 }, (_, i) => [`Company ${i}`, "SWE", "OA", `Round ${i}`])],
          };
          const plan = buildImportPlan([apps, asmts], [], [], {}, TODAY);
          expect(await run(tx, toImportPayload(plan))).toEqual({ applications: 200, assessments: 200 });
          expect(await count(tx, "applications")).toBe(200);
          expect(await count(tx, "status_changes")).toBe(200);
        });
      });
    });
  });

  describe("payload handling", () => {
    it("an empty payload imports nothing", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          for (const payload of [{}, { applications: [] }, { assessments: [] }, { applications: [], assessments: [] }]) {
            expect(await run(tx, payload)).toEqual({ applications: 0, assessments: 0 });
          }
          expect(await count(tx, "applications")).toBe(0);
        });
      });
    });

    it("fills in defaults for what the payload leaves out", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          await run(tx, {
            applications: [{ ref: "r", company: "Acme", role: "SWE" }],
            assessments: [{ application_ref: "r", title: "Round", questions: [{ question: "Q" }] }],
          });
          const row = await tx.one<Record<string, unknown>>(
            "select status, source, applied_on = current_date as applied_today from public.applications"
          );
          expect(row).toEqual({ status: "applied", source: "import", applied_today: true });
          const asmt = await tx.one<Record<string, unknown>>("select kind, status, important from public.assessments");
          expect(asmt).toEqual({ kind: "oa", status: "pending", important: false });
          expect(await tx.scalar("select source from public.assessment_questions")).toBe("expected");
        });
      });
    });

    it("an assessment can name a new application by ref, or an existing one by id", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const existing = await addApplication(tx, { company: "Old" });
          await run(tx, {
            applications: [
              { ref: "a", company: "A", role: "x" },
              { ref: "b", company: "B", role: "y" },
            ],
            assessments: [
              { application_ref: "b", title: "for B" },
              { application_id: existing, title: "for Old" },
              { application_ref: "a", title: "for A" },
            ],
          });
          const rows = await tx.rows<{ title: string; company: string }>(
            "select s.title, a.company from public.assessments s join public.applications a on a.id = s.application_id order by s.title"
          );
          expect(rows).toEqual([
            { title: "for A", company: "A" },
            { title: "for B", company: "B" },
            { title: "for Old", company: "Old" },
          ]);
        });
      });
    });

    it("marks the transaction as an import, so the status triggers keep given dates", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          await run(tx, {});
          // In the app each RPC call is its own transaction, so this resets after.
          expect(await tx.scalar("select public.status_origin()")).toBe("import");
        });
      });
    });
  });

  describe("all or nothing", () => {
    // A bad value anywhere cancels the whole import. That is why the app's
    // importer never sends a date, number or status it can't vouch for.
    const good = { ref: "ok", company: "Fine", role: "Role" };
    const bad = (name: string, payload: unknown, error: RegExp) =>
      it(name, async () => {
        await inTx(async (tx) => {
          const user = await createUser(tx);
          await asUser(tx, user, async () => {
            const e = await failure(tx, "select public.import_rows($1::jsonb)", [JSON.stringify(payload)]);
            expect(e.message).toMatch(error);
            expect(await count(tx, "applications")).toBe(0);
            expect(await count(tx, "assessments")).toBe(0);
            expect(await count(tx, "status_changes")).toBe(0);
          });
        });
      });

    bad("an assessment with no application", { applications: [good], assessments: [{ title: "Orphan", application_ref: "nope" }] }, /assessment "Orphan" has no application/);
    bad("an impossible date (what parseDate's old output could be)", { applications: [good, { company: "X", role: "Y", applied_on: "2026-02-30" }] }, /out of range/);
    bad("a month-first date read as day-first", { applications: [good, { company: "X", role: "Y", applied_on: "2026-25-09" }] }, /out of range/);
    bad("an unknown status", { applications: [good, { company: "X", role: "Y", status: "ghosted" }] }, /applications_status_check/);
    bad("a difficulty outside 1 to 5", { applications: [good], assessments: [{ application_ref: "ok", title: "T", difficulty: 9 }] }, /assessments_difficulty_check/);
    bad("a difficulty of NaN", { applications: [good], assessments: [{ application_ref: "ok", title: "T", difficulty: "NaN" }] }, /invalid input syntax/);
    bad("an unreadable due date", { applications: [good], assessments: [{ application_ref: "ok", title: "T", due_at: "next Friday" }] }, /invalid input syntax/);
    bad("a duration too big for an integer", { applications: [good], assessments: [{ application_ref: "ok", title: "T", duration_min: 99999999999 }] }, /out of range/);
    bad("an unknown outcome", { applications: [good], assessments: [{ application_ref: "ok", title: "T", outcome: "maybe" }] }, /assessments_outcome_check/);
    bad("a blank question", { applications: [good], assessments: [{ application_ref: "ok", title: "T", questions: [{ question: "  " }] }] }, /assessment_questions_question_check/);
    bad("an unknown question source", { applications: [good], assessments: [{ application_ref: "ok", title: "T", questions: [{ question: "Q", source: "guessed" }] }] }, /assessment_questions_source_check/);
    bad("an application with no company", { applications: [good, { role: "Y" }] }, /null value|not-null/);
  });

  describe("who it acts as", () => {
    it("can't attach an assessment to someone else's application", async () => {
      await inTx(async (tx) => {
        const a = await createUser(tx, "a");
        const b = await createUser(tx, "b");
        let app = "";
        await asUser(tx, a, async () => {
          app = await addApplication(tx);
        });
        await asUser(tx, b, async () => {
          const e = await failure(tx, "select public.import_rows($1::jsonb)", [
            JSON.stringify({ assessments: [{ application_id: app, title: "sneaky" }] }),
          ]);
          expect(e.message).toMatch(/row-level security/);
        });
        await asUser(tx, a, async () => {
          expect(await count(tx, "assessments")).toBe(0);
        });
      });
    });

    it("everything it creates belongs to the caller", async () => {
      await inTx(async (tx) => {
        const a = await createUser(tx, "a");
        const b = await createUser(tx, "b");
        await asUser(tx, a, async () => {
          await run(tx, {
            applications: [{ ref: "r", company: "Mine", role: "x" }],
            assessments: [{ application_ref: "r", title: "T", questions: [{ question: "Q" }] }],
          });
        });
        await asUser(tx, b, async () => {
          for (const table of ["applications", "assessments", "assessment_questions", "status_changes"]) {
            expect(await count(tx, table), table).toBe(0);
          }
        });
        await asUser(tx, a, async () => {
          for (const table of ["applications", "assessments", "assessment_questions", "status_changes"]) {
            expect(await count(tx, table), table).toBe(1);
          }
        });
      });
    });
  });
});
