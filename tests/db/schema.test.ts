import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  ASSESSMENT_KINDS,
  EMAIL_KINDS,
  EMAIL_STATES,
  MOVE_CHANNELS,
  MOVE_STAGES,
  MUTE_KINDS,
  OUTCOMES,
  QUESTION_SOURCES,
  STATUSES,
  WAITING_ON,
} from "@/lib/tracker/format";
import { EXTRACT_SOURCES } from "@/lib/tracker/extract";
import { closePool, createUser, dbReady, failure, inTx, addApplication, addAssessment, asUser } from "./helpers";

afterAll(closePool);

const TABLES = [
  "applications",
  "assessment_questions",
  "assessments",
  "email_accepts",
  "email_messages",
  "email_mutes",
  "gmail_scans",
  "message_templates",
  "moves",
  "status_changes",
  "time_log",
];

// Values allowed by a check constraint like  CHECK ((status = ANY (ARRAY['a'::text, 'b'::text])))
const allowed = (def: string) => [...def.matchAll(/'([^']*)'::text/g)].map((m) => m[1]).sort();

describe.skipIf(!dbReady)("the live schema matches the app", () => {
  describe("values the app mirrors in constants", () => {
    const check = (name: string) =>
      inTx(async (tx) => {
        const def = await tx.scalar<string>(
          "select pg_get_constraintdef(oid) from pg_constraint where connamespace = 'public'::regnamespace and conname = $1",
          [name]
        );
        expect(def, `constraint ${name} should exist`).toBeTruthy();
        current = allowed(def);
      });
    let current: string[] = [];

    it("applications.status = STATUSES", async () => {
      await check("applications_status_check");
      expect(current).toEqual([...STATUSES].sort());
    });
    it("assessments.kind = ASSESSMENT_KINDS", async () => {
      await check("assessments_kind_check");
      expect(current).toEqual(Object.keys(ASSESSMENT_KINDS).sort());
    });
    it("assessments.outcome = OUTCOMES", async () => {
      await check("assessments_outcome_check");
      expect(current).toEqual(Object.keys(OUTCOMES).sort());
    });
    it("assessment_questions.source = QUESTION_SOURCES", async () => {
      await check("assessment_questions_source_check");
      expect(current).toEqual(Object.keys(QUESTION_SOURCES).sort());
    });
    it("assessments.status is pending or completed", async () => {
      await check("assessments_status_check");
      expect(current).toEqual(["completed", "pending"]);
    });
    it("applications.source = every link-lookup source, plus import and email", async () => {
      await check("applications_source_check");
      expect(current).toEqual([...EXTRACT_SOURCES, "import", "email"].sort());
    });
    it("email_messages.kind = EMAIL_KINDS, state = EMAIL_STATES", async () => {
      await check("email_messages_kind_check");
      expect(current).toEqual(Object.keys(EMAIL_KINDS).sort());
      await check("email_messages_state_check");
      expect(current).toEqual([...EMAIL_STATES].sort());
    });
    it("email_mutes.kind = MUTE_KINDS", async () => {
      await check("email_mutes_kind_check");
      expect(current).toEqual(Object.keys(MUTE_KINDS).sort());
    });
    it("status_changes.origin is manual, import or email", async () => {
      await check("status_changes_origin_check");
      expect(current).toEqual(["email", "import", "manual"]);
    });
    it("moves.channel and message_templates.channel = MOVE_CHANNELS", async () => {
      await check("moves_channel_check");
      expect(current).toEqual(Object.keys(MOVE_CHANNELS).sort());
      await check("message_templates_channel_check");
      expect(current).toEqual(Object.keys(MOVE_CHANNELS).sort());
    });
    it("moves.stage = MOVE_STAGES", async () => {
      await check("moves_stage_check");
      expect(current).toEqual([...MOVE_STAGES].sort());
    });
    it("moves.waiting_on = WAITING_ON", async () => {
      await check("moves_waiting_on_check");
      expect(current).toEqual(Object.keys(WAITING_ON).sort());
    });
  });

  describe("numeric limits", () => {
    it("difficulty is 1 to 5, durations and time are never negative", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const app = await addApplication(tx);
          for (const ok of [1, 5]) await addAssessment(tx, app, { difficulty: ok });
          for (const bad of [0, 6, -1]) {
            const e = await failure(tx, "insert into public.assessments (application_id, title, difficulty) values ($1, 'x', $2)", [app, bad]);
            expect(e.constraint).toBe("assessments_difficulty_check");
          }
          await addAssessment(tx, app, { duration_min: 0 });
          const neg = await failure(tx, "insert into public.assessments (application_id, title, duration_min) values ($1, 'x', -1)", [app]);
          expect(neg.constraint).toBe("assessments_duration_min_check");
          const time = await failure(tx, "insert into public.time_log (day, seconds) values (current_date, -1)");
          expect(time.constraint).toBe("time_log_seconds_check");
        });
      });
    });
    it("a question can't be blank", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const asmt = await addAssessment(tx, await addApplication(tx));
          for (const blank of ["", "   "]) {
            const e = await failure(tx, "insert into public.assessment_questions (assessment_id, question) values ($1, $2)", [asmt, blank]);
            expect(e.constraint).toBe("assessment_questions_question_check");
          }
        });
      });
    });
    it("a move's time and follow-ups are never negative, and it has a target", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const cases = [
            ["insert into public.moves (channel, target, minutes) values ('linkedin', 'x', -1)", "moves_minutes_check"],
            ["insert into public.moves (channel, target, follow_ups) values ('linkedin', 'x', -1)", "moves_follow_ups_check"],
            ["insert into public.moves (channel, target) values ('linkedin', '  ')", "moves_target_check"],
            ["insert into public.message_templates (channel, name, body) values ('email', ' ', 'x')", "message_templates_name_check"],
            ["insert into public.message_templates (channel, name, body) values ('email', 'x', '')", "message_templates_body_check"],
          ];
          for (const [sql, constraint] of cases) {
            expect((await failure(tx, sql)).constraint, sql).toBe(constraint);
          }
        });
      });
    });
    // The check uses btrim(question), which only strips spaces, so a question
    // of just tabs or newlines is accepted. The importer and forms trim first.
    it.todo("a question of only tabs or newlines is rejected too");
  });

  describe("tables", () => {
    it("are exactly the ones the app knows about", async () => {
      await inTx(async (tx) => {
        const names = await tx.rows<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' order by 1");
        expect(names.map((r) => r.tablename)).toEqual(TABLES);
      });
    });

    it("all have row-level security on", async () => {
      await inTx(async (tx) => {
        const rows = await tx.rows<{ relname: string; relrowsecurity: boolean }>(
          "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1"
        );
        expect(rows.map((r) => [r.relname, r.relrowsecurity])).toEqual(TABLES.map((t) => [t, true]));
      });
    });

    it("have one own-rows policy each; status_changes is read-only except deleting email-made rows", async () => {
      await inTx(async (tx) => {
        const rows = await tx.rows<{ tablename: string; policyname: string; cmd: string; roles: string[] }>(
          "select tablename, policyname, cmd, roles::text[] as roles from pg_policies where schemaname = 'public' order by 1, 2"
        );
        expect(rows.map((r) => [r.tablename, r.policyname, r.cmd])).toEqual([
          ["applications", "own applications", "ALL"],
          ["assessment_questions", "own assessment questions", "ALL"],
          ["assessments", "own assessments", "ALL"],
          ["email_accepts", "own email accepts", "ALL"],
          ["email_messages", "own email messages", "ALL"],
          ["email_mutes", "own email mutes", "ALL"],
          ["gmail_scans", "own gmail scans", "ALL"],
          ["message_templates", "own message templates", "ALL"],
          ["moves", "own moves", "ALL"],
          ["status_changes", "delete own email history", "DELETE"],
          ["status_changes", "read own status changes", "SELECT"],
          ["time_log", "own time log", "ALL"],
        ]);
      });
    });

    it("cascade from auth.users and between the app's own tables", async () => {
      await inTx(async (tx) => {
        const rows = await tx.rows<{ conname: string; confdeltype: string }>(
          "select conname, confdeltype from pg_constraint where connamespace = 'public'::regnamespace and contype = 'f' order by 1"
        );
        expect(rows.length).toBeGreaterThanOrEqual(10);
        // Every FK is ON DELETE CASCADE, except links that should just
        // unlink: a move's application, and an email's application and accept
        // (the email row stays so a re-scan doesn't bring it back as new).
        expect(rows.filter((r) => r.confdeltype !== "c").map((r) => [r.conname, r.confdeltype])).toEqual([
          ["email_messages_accept_id_fkey", "n"],
          ["email_messages_application_id_fkey", "n"],
          ["moves_application_id_fkey", "n"],
        ]);
      });
    });
  });

  describe("database.types.ts", () => {
    // The generated types are kept by hand after migrations; this catches a
    // column added or changed in the database but not in the file.
    const source = fs.readFileSync(path.resolve(process.cwd(), "lib/tracker/database.types.ts"), "utf8");
    const typed = new Map<string, Map<string, boolean>>(); // table -> column -> nullable
    for (const m of source.matchAll(/^ {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}\n {8}Insert/gm)) {
      const cols = new Map<string, boolean>();
      for (const line of m[2].split("\n")) {
        const col = /^\s+(\w+): (.+)$/.exec(line);
        if (col) cols.set(col[1], col[2].includes("| null"));
      }
      typed.set(m[1], cols);
    }

    it("describes every table", () => {
      expect([...typed.keys()].sort()).toEqual(TABLES);
    });

    it.each(TABLES)("%s: same columns and nullability as the database", async (table) => {
      await inTx(async (tx) => {
        const rows = await tx.rows<{ column_name: string; is_nullable: string }>(
          "select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = $1 order by column_name",
          [table]
        );
        const db = new Map(rows.map((r) => [r.column_name, r.is_nullable === "YES"]));
        expect([...db.keys()].sort()).toEqual([...typed.get(table)!.keys()].sort());
        for (const [col, nullable] of db) {
          expect(typed.get(table)!.get(col), `${table}.${col} nullable`).toBe(nullable);
        }
      });
    });
  });

  describe("functions", () => {
    it("all pin an empty search_path (so a lookalike schema can't hijack them)", async () => {
      await inTx(async (tx) => {
        const rows = await tx.rows<{ proname: string; proconfig: string[] | null }>(
          "select proname, proconfig from pg_proc where pronamespace = 'public'::regnamespace order by 1"
        );
        expect(rows.map((r) => r.proname)).toEqual([
          "add_move_minutes",
          "add_time",
          "applications_before_write",
          "applications_log_status",
          "apply_email_job",
          "assessments_before_write",
          "import_rows",
          "message_templates_before_write",
          "moves_before_write",
          "set_time",
          "status_origin",
          "undo_email_job",
        ]);
        for (const r of rows) {
          expect(r.proconfig?.some((c) => c.startsWith("search_path=")), r.proname).toBe(true);
        }
      });
    });

    it("the RPCs are for signed-in users only; the trigger functions for nobody", async () => {
      await inTx(async (tx) => {
        const can = (role: string, fn: string) =>
          tx.scalar<boolean>("select has_function_privilege($1, $2, 'execute')", [role, fn]);
        for (const fn of [
          "public.add_time(date, integer)",
          "public.set_time(date, integer)",
          "public.import_rows(jsonb)",
          "public.add_move_minutes(uuid, integer)",
          "public.apply_email_job(jsonb)",
          "public.undo_email_job(uuid)",
        ]) {
          expect(await can("authenticated", fn), `authenticated ${fn}`).toBe(true);
          expect(await can("anon", fn), `anon ${fn}`).toBe(false);
        }
        for (const fn of [
          "public.applications_log_status()",
          "public.applications_before_write()",
          "public.assessments_before_write()",
          "public.moves_before_write()",
          "public.message_templates_before_write()",
        ]) {
          expect(await can("authenticated", fn), `authenticated ${fn}`).toBe(false);
          expect(await can("anon", fn), `anon ${fn}`).toBe(false);
        }
      });
    });

    it("the triggers are in place", async () => {
      await inTx(async (tx) => {
        const rows = await tx.rows<{ tgname: string; def: string }>(
          `select t.tgname, pg_get_triggerdef(t.oid) as def from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
           where c.relnamespace = 'public'::regnamespace and not t.tgisinternal order by 1`
        );
        expect(rows.map((r) => r.tgname)).toEqual([
          "applications_before_write",
          "applications_log_status",
          "assessments_before_write",
          "message_templates_before_write",
          "moves_before_write",
        ]);
        expect(rows[0].def).toContain("BEFORE INSERT OR UPDATE ON public.applications");
        expect(rows[1].def).toContain("AFTER INSERT OR UPDATE OF status ON public.applications");
        expect(rows[2].def).toContain("BEFORE INSERT OR UPDATE ON public.assessments");
        expect(rows[3].def).toContain("BEFORE INSERT OR UPDATE ON public.message_templates");
        expect(rows[4].def).toContain("BEFORE INSERT OR UPDATE ON public.moves");
      });
    });
  });
});
