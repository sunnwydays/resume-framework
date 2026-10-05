import { afterAll, describe, expect, it } from "vitest";
import {
  addApplication,
  addAssessment,
  addEmail,
  addMove,
  addPosting,
  applyEmailJob,
  asAnon,
  asUser,
  closePool,
  createUser,
  dbReady,
  failure,
  inTx,
  type Tx,
} from "./helpers";

afterAll(closePool);

// Row-level security is the tracker's only access control (the page talks to
// Supabase straight from the browser), so every table is checked from both
// sides: the owner sees and changes their rows, nobody else can.

interface World {
  a: string;
  b: string;
  app: string;
  asmt: string;
  question: string;
  move: string;
  posting: string;
  template: string;
  email: string; // pending
  accepted: string; // accepted onto `app`, so there's an email_accepts row
  mute: string;
}

// Two users; user A owns one of everything.
async function world(tx: Tx): Promise<World> {
  const a = await createUser(tx, "a");
  const b = await createUser(tx, "b");
  let app = "";
  let asmt = "";
  let question = "";
  let move = "";
  let posting = "";
  let template = "";
  let email = "";
  let accepted = "";
  let mute = "";
  await asUser(tx, a, async () => {
    app = await addApplication(tx, { company: "Owned by A" });
    asmt = await addAssessment(tx, app, { title: "A's OA" });
    question = await tx.scalar<string>(
      "insert into public.assessment_questions (assessment_id, question) values ($1, 'A''s question') returning id",
      [asmt]
    );
    await tx.query("select public.add_time(current_date, 600)");
    move = await addMove(tx, { target: "A's contact", application_id: app });
    posting = await addPosting(tx, { company: "A's posting", application_id: app });
    template = await tx.scalar<string>(
      "insert into public.message_templates (channel, name, body) values ('linkedin', 'A''s template', 'Hi {name}') returning id"
    );
    email = await addEmail(tx);
    accepted = await addEmail(tx);
    await applyEmailJob(tx, { application_id: app, message_ids: [accepted] });
    await tx.query("insert into public.gmail_scans (since) values (now() - interval '7 days')");
    mute = await tx.scalar<string>("insert into public.email_mutes (kind, value) values ('company', 'Muted Co') returning id");
  });
  return { a, b, app, asmt, question, move, posting, template, email, accepted, mute };
}

const READ_AS_OWNER = [
  ["applications", "select id from public.applications"],
  ["assessments", "select id from public.assessments"],
  ["assessment_questions", "select id from public.assessment_questions"],
  ["status_changes", "select id from public.status_changes"],
  ["time_log", "select user_id from public.time_log"],
  ["moves", "select id from public.moves"],
  ["job_postings", "select id from public.job_postings"],
  ["message_templates", "select id from public.message_templates"],
  ["email_messages", "select id from public.email_messages where state = 'pending'"],
  ["email_accepts", "select id from public.email_accepts"],
  ["gmail_scans", "select id from public.gmail_scans"],
  ["email_mutes", "select id from public.email_mutes"],
] as const;

describe.skipIf(!dbReady)("row-level security", () => {
  describe("the owner", () => {
    it.each(READ_AS_OWNER)("sees their own rows in %s", async (_table, sql) => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.a, async () => {
          expect((await tx.rows(sql)).length).toBe(1);
        });
      });
    });

    it("can update and delete them", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.a, async () => {
          expect((await tx.query("update public.applications set notes = 'mine' where id = $1", [w.app])).rowCount).toBe(1);
          expect((await tx.query("update public.assessments set notes = 'mine' where id = $1", [w.asmt])).rowCount).toBe(1);
          expect((await tx.query("update public.assessment_questions set answer = 'mine' where id = $1", [w.question])).rowCount).toBe(1);
          expect((await tx.query("delete from public.assessment_questions where id = $1", [w.question])).rowCount).toBe(1);
          expect((await tx.query("update public.moves set notes = 'mine' where id = $1", [w.move])).rowCount).toBe(1);
          expect((await tx.query("update public.job_postings set state = 'saved' where id = $1", [w.posting])).rowCount).toBe(1);
          expect((await tx.query("delete from public.job_postings where id = $1", [w.posting])).rowCount).toBe(1);
          expect((await tx.query("update public.message_templates set body = 'mine' where id = $1", [w.template])).rowCount).toBe(1);
          expect((await tx.query("delete from public.message_templates where id = $1", [w.template])).rowCount).toBe(1);
          expect((await tx.query("delete from public.moves where id = $1", [w.move])).rowCount).toBe(1);
          expect((await tx.query("delete from public.applications where id = $1", [w.app])).rowCount).toBe(1);
        });
      });
    });

    it("the user id is filled in from the session, never from the client", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.a, async () => {
          const owner = await tx.scalar<string>("select user_id::text from public.applications where id = $1", [w.app]);
          expect(owner).toBe(w.a);
        });
      });
    });
  });

  describe("another user", () => {
    it.each(READ_AS_OWNER)("sees nothing in %s", async (_table, sql) => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.b, async () => {
          expect(await tx.rows(sql)).toEqual([]);
        });
      });
    });

    it("can't update or delete the owner's rows (and the rows are unchanged)", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.b, async () => {
          expect((await tx.query("update public.applications set company = 'hacked' where id = $1", [w.app])).rowCount).toBe(0);
          expect((await tx.query("update public.assessments set title = 'hacked' where id = $1", [w.asmt])).rowCount).toBe(0);
          expect((await tx.query("update public.assessment_questions set question = 'hacked' where id = $1", [w.question])).rowCount).toBe(0);
          expect((await tx.query("update public.time_log set seconds = 0")).rowCount).toBe(0);
          expect((await tx.query("delete from public.assessment_questions where id = $1", [w.question])).rowCount).toBe(0);
          expect((await tx.query("delete from public.assessments where id = $1", [w.asmt])).rowCount).toBe(0);
          expect((await tx.query("delete from public.applications where id = $1", [w.app])).rowCount).toBe(0);
          expect((await tx.query("delete from public.time_log")).rowCount).toBe(0);
          expect((await tx.query("update public.moves set target = 'hacked' where id = $1", [w.move])).rowCount).toBe(0);
          expect((await tx.query("select public.add_move_minutes($1, 60)", [w.move])).rows[0].add_move_minutes).toBeNull();
          expect((await tx.query("update public.job_postings set state = 'dismissed' where id = $1", [w.posting])).rowCount).toBe(0);
          expect((await tx.query("delete from public.job_postings where id = $1", [w.posting])).rowCount).toBe(0);
          expect((await tx.query("update public.message_templates set body = 'hacked' where id = $1", [w.template])).rowCount).toBe(0);
          expect((await tx.query("delete from public.moves where id = $1", [w.move])).rowCount).toBe(0);
          expect((await tx.query("delete from public.message_templates where id = $1", [w.template])).rowCount).toBe(0);
        });
        await asUser(tx, w.a, async () => {
          expect(await tx.scalar("select target from public.moves where id = $1", [w.move])).toBe("A's contact");
          expect(await tx.scalar("select minutes from public.moves where id = $1", [w.move])).toBe(0);
          expect(await tx.scalar("select state from public.job_postings where id = $1", [w.posting])).toBe("new");
          expect(await tx.scalar("select body from public.message_templates where id = $1", [w.template])).toBe("Hi {name}");
          expect(await tx.scalar("select company from public.applications where id = $1", [w.app])).toBe("Owned by A");
          expect(await tx.scalar("select title from public.assessments where id = $1", [w.asmt])).toBe("A's OA");
          expect(await tx.scalar("select question from public.assessment_questions where id = $1", [w.question])).toBe("A's question");
          expect(await tx.scalar("select seconds from public.time_log")).toBe(600);
        });
      });
    });

    it("can't create rows in the owner's name", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.b, async () => {
          const e = await failure(tx, "insert into public.applications (company, role, user_id) values ('x', 'y', $1)", [w.a]);
          expect(e.message).toMatch(/row-level security/);
          const t = await failure(tx, "insert into public.time_log (user_id, day, seconds) values ($1, current_date - 1, 5)", [w.a]);
          expect(t.message).toMatch(/row-level security/);
        });
      });
    });

    it("can't attach an assessment to the owner's application", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.b, async () => {
          const e = await failure(tx, "insert into public.assessments (application_id, title) values ($1, 'sneaky')", [w.app]);
          expect(e.message).toMatch(/row-level security/);
          const forged = await failure(tx, "insert into public.assessments (application_id, title, user_id) values ($1, 'sneaky', $2)", [w.app, w.a]);
          expect(forged.message).toMatch(/row-level security/);
        });
      });
    });

    it("can't attach a question to the owner's assessment", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.b, async () => {
          const e = await failure(tx, "insert into public.assessment_questions (assessment_id, question) values ($1, 'sneaky')", [w.asmt]);
          expect(e.message).toMatch(/row-level security/);
        });
      });
    });

    it("can't link a move to the owner's application, on insert or update", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.b, async () => {
          const e = await failure(tx, "insert into public.moves (channel, target, application_id) values ('linkedin', 'x', $1)", [w.app]);
          expect(e.message).toMatch(/row-level security/);
          const mine = await addMove(tx);
          const u = await failure(tx, "update public.moves set application_id = $1 where id = $2", [w.app, mine]);
          expect(u.message).toMatch(/row-level security/);
          const t = await failure(tx, "insert into public.message_templates (channel, name, body, user_id) values ('email', 'x', 'y', $1)", [w.a]);
          expect(t.message).toMatch(/row-level security/);
        });
      });
    });

    it("can't link a posting to the owner's application, or create one in the owner's name", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.b, async () => {
          const e = await failure(tx, "insert into public.job_postings (source, source_id, url, company, role, first_seen_at, gmail_id, application_id) values ('jobright', 'x', 'u', 'c', 'r', now(), 'g', $1)", [w.app]);
          expect(e.message).toMatch(/row-level security/);
          const mine = await addPosting(tx);
          const u = await failure(tx, "update public.job_postings set application_id = $1 where id = $2", [w.app, mine]);
          expect(u.message).toMatch(/row-level security/);
          const forged = await failure(tx, "insert into public.job_postings (source, source_id, url, company, role, first_seen_at, gmail_id, user_id) values ('jobright', 'y', 'u', 'c', 'r', now(), 'g', $1)", [w.a]);
          expect(forged.message).toMatch(/row-level security/);
        });
      });
    });

    it("can't change the owner's emails, accepts, scans or mutes", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.b, async () => {
          expect((await tx.query("update public.email_messages set state = 'dismissed' where id = $1", [w.email])).rowCount).toBe(0);
          expect((await tx.query("delete from public.email_messages")).rowCount).toBe(0);
          expect((await tx.query("update public.email_accepts set undone_at = now()")).rowCount).toBe(0);
          expect((await tx.query("delete from public.gmail_scans")).rowCount).toBe(0);
          expect((await tx.query("delete from public.email_mutes where id = $1", [w.mute])).rowCount).toBe(0);
        });
        await asUser(tx, w.a, async () => {
          expect(await tx.scalar("select state from public.email_messages where id = $1", [w.email])).toBe("pending");
          expect(await tx.scalar("select count(*)::int from public.email_accepts where undone_at is null")).toBe(1);
          expect(await tx.scalar("select count(*)::int from public.gmail_scans")).toBe(1);
        });
      });
    });

    it("can't link an email to the owner's application, or accept onto it", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.b, async () => {
          const e = await failure(tx, "insert into public.email_messages (gmail_id, thread_id, received_at, from_address, kind, application_id) values ('x', 'x', now(), 'a@b.example', 'rejection', $1)", [w.app]);
          expect(e.message).toMatch(/row-level security/);
          const mine = await addEmail(tx, { kind: "rejection" });
          const onto = await failure(tx, "select public.apply_email_job($1::jsonb)", [JSON.stringify({ application_id: w.app, steps: [{ status: "rejected", at: "2026-09-26T10:00:00Z" }], message_ids: [mine] })]);
          expect(onto.message).toMatch(/application not found/);
          const theirs = await failure(tx, "select public.apply_email_job($1::jsonb)", [JSON.stringify({ new_application: { company: "x", role: "y" }, message_ids: [w.email] })]);
          expect(theirs.message).toMatch(/already handled/);
        });
        await asUser(tx, w.a, async () => {
          expect(await tx.scalar("select status from public.applications where id = $1", [w.app])).toBe("applied");
        });
      });
    });

    it("can't move their own assessment onto the owner's application", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.b, async () => {
          const mine = await addAssessment(tx, await addApplication(tx));
          const e = await failure(tx, "update public.assessments set application_id = $1 where id = $2", [w.app, mine]);
          expect(e.message).toMatch(/row-level security/);
        });
      });
    });

    it("has a separate time log", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.b, async () => {
          await tx.query("select public.add_time(current_date, 60)");
          expect(await tx.scalar("select seconds from public.time_log")).toBe(60);
        });
        await asUser(tx, w.a, async () => {
          expect(await tx.scalar("select seconds from public.time_log")).toBe(600);
        });
      });
    });
  });

  describe("status history is read-only, except email-made rows (for undo)", () => {
    it("the owner can delete their own email-origin rows, nothing else, and nobody else can", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.a, async () => {
          await tx.query("select set_config('app.status_origin', 'email', true)");
          await tx.query("update public.applications set status = 'rejected' where id = $1", [w.app]);
          await tx.query("select set_config('app.status_origin', '', true)");
        });
        await asUser(tx, w.b, async () => {
          expect((await tx.query("delete from public.status_changes")).rowCount).toBe(0);
        });
        await asUser(tx, w.a, async () => {
          expect((await tx.query("delete from public.status_changes")).rowCount).toBe(1);
          expect(await tx.rows("select status, origin from public.status_changes")).toEqual([{ status: "applied", origin: "manual" }]);
        });
      });
    });

    it("the owner can read it but not write it", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.a, async () => {
          const e = await failure(tx, "insert into public.status_changes (application_id, user_id, status) values ($1, $2, 'offer')", [w.app, w.a]);
          expect(e.message).toMatch(/row-level security/);
          expect((await tx.query("update public.status_changes set status = 'offer'")).rowCount).toBe(0);
          expect((await tx.query("delete from public.status_changes")).rowCount).toBe(0);
          expect(await tx.scalar("select count(*)::int from public.status_changes")).toBe(1);
        });
      });
    });
  });

  describe("signed out", () => {
    it("can't read or write anything", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asAnon(tx, async () => {
          for (const [table, sql] of READ_AS_OWNER) {
            // Either no privilege at all, or privilege but no visible rows.
            await tx.query("savepoint anon_read");
            try {
              expect(await tx.rows(sql), table).toEqual([]);
              await tx.query("release savepoint anon_read");
            } catch (e) {
              expect((e as Error).message, table).toMatch(/permission denied/);
              await tx.query("rollback to savepoint anon_read");
            }
          }
          const insert = await failure(tx, "insert into public.applications (company, role, user_id) values ('x', 'y', $1)", [w.a]);
          expect(insert.message).toMatch(/permission denied|row-level security/);
        });
      });
    });

    it("can't call the RPCs", async () => {
      await inTx(async (tx) => {
        await createUser(tx);
        await asAnon(tx, async () => {
          for (const sql of [
            "select public.add_time(current_date, 60)",
            "select public.set_time(current_date, 60)",
            "select public.import_rows('{}'::jsonb)",
            "select public.add_move_minutes(gen_random_uuid(), 5)",
          ]) {
            expect((await failure(tx, sql)).message, sql).toMatch(/permission denied/);
          }
        });
      });
    });
  });

  describe("signed in, but not as anyone in particular", () => {
    it("a session with no user id can't create rows", async () => {
      await inTx(async (tx) => {
        await tx.query("select set_config('request.jwt.claims', '{\"role\":\"authenticated\"}', true), set_config('request.jwt.claim.sub', '', true)");
        await tx.query("set local role authenticated");
        try {
          const e = await failure(tx, "insert into public.applications (company, role) values ('x', 'y')");
          expect(e.message).toMatch(/null value|row-level security/);
        } finally {
          await tx.query("reset role");
        }
      });
    });
  });

  describe("deleting things", () => {
    it("deleting an application takes its assessments, questions and history with it", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await asUser(tx, w.a, async () => {
          await tx.query("delete from public.applications where id = $1", [w.app]);
        });
        const count = (table: string, col: string, id: string) =>
          tx.scalar<number>(`select count(*)::int from public.${table} where ${col} = $1`, [id]);
        expect(await count("assessments", "id", w.asmt)).toBe(0);
        expect(await count("assessment_questions", "id", w.question)).toBe(0);
        expect(await count("status_changes", "application_id", w.app)).toBe(0);
      });
    });

    it("deleting everything for one user (the Clear all button) leaves other users alone", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        let bApp = "";
        await asUser(tx, w.b, async () => {
          bApp = await addApplication(tx, { company: "Owned by B" });
          await addAssessment(tx, bApp);
        });
        await asUser(tx, w.a, async () => {
          // what deleteAllApplications does: delete every row RLS lets you see
          await tx.query("delete from public.applications");
          expect(await tx.scalar("select count(*)::int from public.applications")).toBe(0);
          expect(await tx.scalar("select count(*)::int from public.assessments")).toBe(0);
          expect(await tx.scalar("select count(*)::int from public.assessment_questions")).toBe(0);
          expect(await tx.scalar("select count(*)::int from public.status_changes")).toBe(0);
          // Moves survive, just unlinked from the deleted application.
          expect(await tx.rows("select application_id from public.moves")).toEqual([{ application_id: null }]);
          expect(await tx.rows("select application_id, state from public.job_postings")).toEqual([{ application_id: null, state: "new" }]);
        });
        await asUser(tx, w.b, async () => {
          expect(await tx.scalar("select count(*)::int from public.applications")).toBe(1);
          expect(await tx.scalar("select count(*)::int from public.assessments")).toBe(1);
          expect(await tx.scalar("select count(*)::int from public.status_changes")).toBe(1);
        });
      });
    });

    it("deleting a user removes all of their data", async () => {
      await inTx(async (tx) => {
        const w = await world(tx);
        await tx.query("delete from auth.users where id = $1", [w.a]);
        for (const table of ["applications", "assessments", "assessment_questions", "status_changes", "time_log", "moves", "job_postings", "message_templates"]) {
          expect(await tx.scalar<number>(`select count(*)::int from public.${table} where user_id = $1`, [w.a]), table).toBe(0);
        }
      });
    });
  });
});
