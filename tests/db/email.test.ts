import { afterAll, describe, expect, it } from "vitest";
import {
  addApplication,
  addAssessment,
  addEmail,
  applyEmailJob,
  asUser,
  closePool,
  createUser,
  dbReady,
  failure,
  inTx,
  type Tx,
} from "./helpers";

afterAll(closePool);

// apply_email_job: one reviewed Gmail card, applied all or nothing, with every
// change dated by its email and tagged origin 'email', plus a record of what
// it changed (for undo).

const T1 = "2026-09-20T15:00:00.000Z"; // confirmation
const T2 = "2026-09-23T13:30:00.000Z"; // OA invite
const T3 = "2026-09-29T18:45:00.000Z"; // rejection

const iso = (d: Date | null) => d?.toISOString() ?? null;

const history = (tx: Tx, id: string) =>
  tx.rows<{ id: string; status: string; origin: string; changed_at: Date | null }>(
    "select id, status, origin, changed_at from public.status_changes where application_id = $1 order by changed_at, status",
    [id]
  );

const appRow = (tx: Tx, id: string) =>
  tx.one<{ status: string; status_changed_at: Date | null; applied_on: string; source: string; company: string; role: string }>(
    "select status, status_changed_at, applied_on::text, source, company, role from public.applications where id = $1",
    [id]
  );

const acceptFor = (tx: Tx, id: string) =>
  tx.one<{
    created_application: boolean;
    before: Record<string, unknown> | null;
    assessments_before: Record<string, unknown>[];
    created_assessment_ids: string[];
    status_change_ids: string[];
  }>("select * from public.email_accepts where application_id = $1", [id]);

// Runs `fn` as a fresh signed-in user inside a rolled-back transaction.
const asNewUser = (fn: (tx: Tx) => Promise<void>) =>
  inTx(async (tx) => {
    const user = await createUser(tx);
    await asUser(tx, user, () => fn(tx));
  });

describe.skipIf(!dbReady)("apply_email_job", () => {
  describe("a card for a job that isn't tracked yet", () => {
    it("creates the application and walks it through each step, dated by the emails", async () => {
      await asNewUser(async (tx) => {
        const emails = [
          await addEmail(tx, { received_at: T1 }),
          await addEmail(tx, { received_at: T2, kind: "oa_invite" }),
          await addEmail(tx, { received_at: T3, kind: "rejection" }),
        ];
        const id = await applyEmailJob(tx, {
          new_application: { company: "Globex", role: "Backend Intern", applied_on: "2026-09-20", status_changed_at: T1 },
          // Out of order on purpose: the database applies them oldest first.
          steps: [
            { status: "rejected", at: T3 },
            { status: "oa", at: T2 },
          ],
          message_ids: emails,
        });

        const row = await appRow(tx, id);
        expect(row).toMatchObject({ status: "rejected", applied_on: "2026-09-20", source: "email", company: "Globex", role: "Backend Intern" });
        expect(iso(row.status_changed_at)).toBe(T3);
        expect((await history(tx, id)).map((h) => [h.status, h.origin, iso(h.changed_at)])).toEqual([
          ["applied", "email", T1],
          ["oa", "email", T2],
          ["rejected", "email", T3],
        ]);

        const states = await tx.rows<{ state: string; application_id: string; accept_id: string | null }>(
          "select state, application_id, accept_id from public.email_messages where id = any($1)",
          [emails]
        );
        expect(states.every((s) => s.state === "accepted" && s.application_id === id && s.accept_id)).toBe(true);

        const accept = await acceptFor(tx, id);
        expect(accept.created_application).toBe(true);
        expect(accept.before).toBeNull();
        expect(accept.status_change_ids).toHaveLength(3);
      });
    });

    it("adds the assessment it was invited to, and marks it done when a completion mail came", async () => {
      await asNewUser(async (tx) => {
        const email = await addEmail(tx, { kind: "oa_invite", received_at: T2 });
        const id = await applyEmailJob(tx, {
          new_application: { company: "Globex", role: "Backend Intern", status_changed_at: T2 },
          steps: [{ status: "oa", at: T2 }],
          assessments: [
            { kind: "oa", title: "Globex coding test", link: "https://assess.example/t/1", due_at: "2026-09-27T03:59:00Z", completed_at: null },
            { kind: "oa", title: "Globex take-home", completed_at: T3 },
          ],
          message_ids: [email],
        });
        const asmts = await tx.rows<{ id: string; title: string; status: string; link: string | null; completed_at: Date | null }>(
          "select id, title, status, link, completed_at from public.assessments where application_id = $1 order by title",
          [id]
        );
        expect(asmts.map((a) => [a.title, a.status, a.link, iso(a.completed_at)])).toEqual([
          ["Globex coding test", "pending", "https://assess.example/t/1", null],
          ["Globex take-home", "completed", null, T3],
        ]);
        expect((await acceptFor(tx, id)).created_assessment_ids.sort()).toEqual(asmts.map((a) => a.id).sort());
      });
    });
  });

  describe("a card for a tracked application", () => {
    it("records what the row looked like, and only the history rows it added", async () => {
      await asNewUser(async (tx) => {
        const app = await addApplication(tx, { applied_on: "2026-09-19" });
        const [manual] = await history(tx, app);
        const email = await addEmail(tx, { kind: "rejection", received_at: T3 });
        await applyEmailJob(tx, { application_id: app, steps: [{ status: "rejected", at: T3 }], message_ids: [email] });

        // The manual row is stamped now(), after the backdated email, so
        // compare without caring about order.
        const hist = await history(tx, app);
        expect(hist.map((h) => [h.status, h.origin]).sort()).toEqual([
          ["applied", "manual"],
          ["rejected", "email"],
        ]);
        const accept = await acceptFor(tx, app);
        expect(accept.created_application).toBe(false);
        expect(accept.before).toMatchObject({ status: "applied", applied_on: "2026-09-19" });
        expect(accept.status_change_ids).toEqual(hist.filter((h) => h.id !== manual.id).map((h) => h.id));
      });
    });

    it("fills an existing assessment's empty link and due date, never replacing set ones", async () => {
      await asNewUser(async (tx) => {
        const app = await addApplication(tx);
        const empty = await addAssessment(tx, app, { title: "OA" });
        const email = await addEmail(tx, { kind: "reminder" });
        await applyEmailJob(tx, {
          application_id: app,
          assessments: [{ id: empty, link: "https://assess.example/t/2", due_at: "2026-10-01T03:59:00Z" }],
          message_ids: [email],
        });
        const row = await tx.one<{ link: string; due_at: Date }>("select link, due_at from public.assessments where id = $1", [empty]);
        expect(row.link).toBe("https://assess.example/t/2");
        expect(iso(row.due_at)).toBe("2026-10-01T03:59:00.000Z");

        const set = await addAssessment(tx, app, { title: "OA 2", link: "https://mine.example", due_at: "2026-10-05T00:00:00Z" });
        const again = await addEmail(tx, { kind: "reminder" });
        await applyEmailJob(tx, {
          application_id: app,
          assessments: [{ id: set, link: "https://other.example", due_at: "2026-10-09T00:00:00Z" }],
          message_ids: [again],
        });
        const kept = await tx.one<{ link: string; due_at: Date }>("select link, due_at from public.assessments where id = $1", [set]);
        expect(kept.link).toBe("https://mine.example");
        expect(iso(kept.due_at)).toBe("2026-10-05T00:00:00.000Z");
      });
    });

    it("marks an existing assessment completed at the email's time, and remembers how it was", async () => {
      await asNewUser(async (tx) => {
        const app = await addApplication(tx);
        const oa = await addAssessment(tx, app, { title: "OA", link: "https://assess.example/t/3" });
        const email = await addEmail(tx, { kind: "assessment_done", received_at: T3 });
        await applyEmailJob(tx, { application_id: app, assessments: [{ id: oa, completed_at: T3 }], message_ids: [email] });
        const row = await tx.one<{ status: string; completed_at: Date }>("select status, completed_at from public.assessments where id = $1", [oa]);
        expect(row.status).toBe("completed");
        expect(iso(row.completed_at)).toBe(T3);
        expect((await acceptFor(tx, app)).assessments_before).toEqual([
          { id: oa, link: "https://assess.example/t/3", due_at: null, status: "pending", completed_at: null },
        ]);
      });
    });

    it("refuses an assessment that belongs to another application", async () => {
      await asNewUser(async (tx) => {
        const app = await addApplication(tx);
        const other = await addAssessment(tx, await addApplication(tx, { company: "Initech" }));
        const email = await addEmail(tx, { kind: "reminder" });
        const e = await failure(tx, "select public.apply_email_job($1::jsonb)", [
          JSON.stringify({ application_id: app, assessments: [{ id: other, link: "https://x.example" }], message_ids: [email] }),
        ]);
        expect(e.message).toMatch(/not on this application/);
      });
    });
  });

  describe("date fills never overwrite a real date", () => {
    it("status date: filled only while it's empty", async () => {
      await asNewUser(async (tx) => {
        const app = await addApplication(tx);
        await tx.query("select set_config('app.status_origin', 'import', true)");
        await tx.query("update public.applications set status = 'rejected', status_changed_at = null where id = $1", [app]);
        await tx.query("select set_config('app.status_origin', '', true)");

        const first = await addEmail(tx, { kind: "rejection", received_at: T3 });
        await applyEmailJob(tx, { application_id: app, fill: { status_changed_at: T3 }, message_ids: [first] });
        expect(iso((await appRow(tx, app)).status_changed_at)).toBe(T3);

        const second = await addEmail(tx, { kind: "rejection", received_at: T2 });
        await applyEmailJob(tx, { application_id: app, fill: { status_changed_at: T2 }, message_ids: [second] });
        expect(iso((await appRow(tx, app)).status_changed_at)).toBe(T3);
      });
    });

    it("applied date: moved only while it's still the value the page saw", async () => {
      await asNewUser(async (tx) => {
        const app = await addApplication(tx, { applied_on: "2026-09-30" });
        const stale = await addEmail(tx, { received_at: T1 });
        await applyEmailJob(tx, { application_id: app, fill: { applied_on: { from: "2026-09-28", to: "2026-09-20" } }, message_ids: [stale] });
        expect((await appRow(tx, app)).applied_on).toBe("2026-09-30");

        const fresh = await addEmail(tx, { received_at: T1 });
        await applyEmailJob(tx, { application_id: app, fill: { applied_on: { from: "2026-09-30", to: "2026-09-20" } }, message_ids: [fresh] });
        expect((await appRow(tx, app)).applied_on).toBe("2026-09-20");
      });
    });
  });

  describe("all or nothing", () => {
    it("a bad step leaves no application behind and the emails pending", async () => {
      await asNewUser(async (tx) => {
        const email = await addEmail(tx);
        const e = await failure(tx, "select public.apply_email_job($1::jsonb)", [
          JSON.stringify({ new_application: { company: "Globex", role: "Intern" }, steps: [{ status: "hired", at: T2 }], message_ids: [email] }),
        ]);
        expect(e.constraint).toBe("applications_status_check");
        expect(await tx.scalar("select count(*)::int from public.applications")).toBe(0);
        expect(await tx.scalar("select state from public.email_messages where id = $1", [email])).toBe("pending");
      });
    });

    it("refuses a card with no emails, or with emails already handled", async () => {
      await asNewUser(async (tx) => {
        const none = await failure(tx, "select public.apply_email_job($1::jsonb)", [JSON.stringify({ new_application: { company: "x", role: "y" } })]);
        expect(none.message).toMatch(/no emails/);

        const email = await addEmail(tx);
        await applyEmailJob(tx, { new_application: { company: "Globex", role: "Intern" }, message_ids: [email] });
        const twice = await failure(tx, "select public.apply_email_job($1::jsonb)", [
          JSON.stringify({ new_application: { company: "Globex", role: "Intern" }, message_ids: [email] }),
        ]);
        expect(twice.message).toMatch(/already handled/);
        expect(await tx.scalar("select count(*)::int from public.applications")).toBe(1);
      });
    });
  });
});

const undo = (tx: Tx, acceptId: string) => tx.query("select public.undo_email_job($1)", [acceptId]);
const undoFails = (tx: Tx, acceptId: string) => failure(tx, "select public.undo_email_job($1)", [acceptId]);
const acceptIdFor = (tx: Tx, app: string) =>
  tx.scalar<string>("select id from public.email_accepts where application_id = $1 and undone_at is null order by created_at desc limit 1", [app]);
// Everything in one test shares a transaction, so now() never moves: push an
// accept into the past to make a later edit or accept come "after" it.
const backdate = (tx: Tx, acceptId: string) =>
  tx.query("update public.email_accepts set created_at = now() - interval '1 minute' where id = $1", [acceptId]);

describe.skipIf(!dbReady)("undo_email_job", () => {
  it("undoing a card that created the application removes it and puts its emails back", async () => {
    await asNewUser(async (tx) => {
      const emails = [await addEmail(tx, { received_at: T1 }), await addEmail(tx, { kind: "oa_invite", received_at: T2 })];
      const id = await applyEmailJob(tx, {
        new_application: { company: "Globex", role: "Backend Intern", status_changed_at: T1 },
        steps: [{ status: "oa", at: T2 }],
        assessments: [{ kind: "oa", title: "Globex coding test", completed_at: null }],
        message_ids: emails,
      });
      await undo(tx, await acceptIdFor(tx, id));

      expect(await tx.scalar("select count(*)::int from public.applications")).toBe(0);
      expect(await tx.scalar("select count(*)::int from public.assessments")).toBe(0);
      expect(await tx.scalar("select count(*)::int from public.email_accepts")).toBe(0);
      expect(await tx.rows("select state, application_id, accept_id from public.email_messages order by received_at")).toEqual([
        { state: "pending", application_id: null, accept_id: null },
        { state: "pending", application_id: null, accept_id: null },
      ]);
    });
  });

  it("undoing a card on a tracked application restores the row, its assessments and its history", async () => {
    await asNewUser(async (tx) => {
      const app = await addApplication(tx, { applied_on: "2026-09-27" });
      const oa = await addAssessment(tx, app, { title: "OA", link: "https://mine.example" });
      const before = await appRow(tx, app);
      const manual = await history(tx, app);
      const emails = [await addEmail(tx, { received_at: T1 }), await addEmail(tx, { kind: "rejection", received_at: T3 })];
      await applyEmailJob(tx, {
        application_id: app,
        steps: [{ status: "rejected", at: T3 }],
        assessments: [{ id: oa, completed_at: T2 }, { kind: "interview", title: "Onsite", completed_at: null }],
        fill: { applied_on: { from: "2026-09-27", to: "2026-09-20" } },
        message_ids: emails,
      });
      expect((await appRow(tx, app)).status).toBe("rejected");

      const acceptId = await acceptIdFor(tx, app);
      await undo(tx, acceptId);

      const after = await appRow(tx, app);
      expect(after).toMatchObject({ status: "applied", applied_on: "2026-09-27" });
      expect(iso(after.status_changed_at)).toBe(iso(before.status_changed_at));
      expect(await history(tx, app)).toEqual(manual);
      expect(await tx.rows("select title, status, link, completed_at from public.assessments where application_id = $1", [app])).toEqual([
        { title: "OA", status: "pending", link: "https://mine.example", completed_at: null },
      ]);
      expect(await tx.scalar("select undone_at is not null from public.email_accepts where id = $1", [acceptId])).toBe(true);
      expect(await tx.scalar("select count(*)::int from public.email_messages where state = 'pending' and application_id is null")).toBe(2);
      expect((await undoFails(tx, acceptId)).message).toMatch(/already undone/);
    });
  });

  it("is refused once the application was edited by hand after the accept", async () => {
    await asNewUser(async (tx) => {
      const app = await addApplication(tx);
      await applyEmailJob(tx, { application_id: app, steps: [{ status: "rejected", at: T3 }], message_ids: [await addEmail(tx, { kind: "rejection" })] });
      const acceptId = await acceptIdFor(tx, app);
      await backdate(tx, acceptId);
      await tx.query("update public.applications set notes = 'called them' where id = $1", [app]);
      expect((await undoFails(tx, acceptId)).message).toMatch(/edited after/);
      expect((await appRow(tx, app)).status).toBe("rejected");
    });
  });

  it("goes newest first on one application", async () => {
    await asNewUser(async (tx) => {
      const app = await addApplication(tx);
      await applyEmailJob(tx, { application_id: app, steps: [{ status: "oa", at: T2 }], message_ids: [await addEmail(tx, { kind: "oa_invite" })] });
      const first = await acceptIdFor(tx, app);
      await backdate(tx, first);
      await applyEmailJob(tx, { application_id: app, steps: [{ status: "rejected", at: T3 }], message_ids: [await addEmail(tx, { kind: "rejection" })] });
      const second = await acceptIdFor(tx, app);

      expect((await undoFails(tx, first)).message).toMatch(/later Gmail changes/);
      await undo(tx, second);
      expect((await appRow(tx, app)).status).toBe("oa");
      // Undoing the second touched the row, but that isn't a hand edit.
      await undo(tx, first);
      expect((await appRow(tx, app)).status).toBe("applied");
      expect((await history(tx, app)).map((h) => h.origin)).toEqual(["manual"]);
    });
  });

  it("a hand edit after undoing the newer accept still blocks the older one", async () => {
    await asNewUser(async (tx) => {
      const app = await addApplication(tx);
      await applyEmailJob(tx, { application_id: app, steps: [{ status: "oa", at: T2 }], message_ids: [await addEmail(tx, { kind: "oa_invite" })] });
      const first = await acceptIdFor(tx, app);
      // first < second < the undo < the edit
      await tx.query("update public.email_accepts set created_at = now() - interval '3 minutes' where id = $1", [first]);
      await applyEmailJob(tx, { application_id: app, steps: [{ status: "rejected", at: T3 }], message_ids: [await addEmail(tx, { kind: "rejection" })] });
      const second = await acceptIdFor(tx, app);
      expect(second).not.toBe(first);
      await undo(tx, second);
      await tx.query(
        "update public.email_accepts set created_at = now() - interval '2 minutes', undone_at = now() - interval '1 minute' where id = $1",
        [second]
      );
      await tx.query("update public.applications set notes = 'called them' where id = $1", [app]);
      expect((await undoFails(tx, first)).message).toMatch(/edited after/);
    });
  });

  it("is refused when an assessment the card added has questions now", async () => {
    await asNewUser(async (tx) => {
      const id = await applyEmailJob(tx, {
        new_application: { company: "Globex", role: "Backend Intern" },
        assessments: [{ kind: "oa", title: "Globex coding test", completed_at: null }],
        message_ids: [await addEmail(tx)],
      });
      const oa = await tx.scalar<string>("select id from public.assessments where application_id = $1", [id]);
      await tx.query("insert into public.assessment_questions (assessment_id, question) values ($1, 'Two sum')", [oa]);
      expect((await undoFails(tx, await acceptIdFor(tx, id))).message).toMatch(/has questions/);
    });
  });

  it("can't undo another user's accept", async () => {
    await inTx(async (tx) => {
      const a = await createUser(tx, "a");
      const b = await createUser(tx, "b");
      let acceptId = "";
      await asUser(tx, a, async () => {
        const id = await applyEmailJob(tx, { new_application: { company: "Globex", role: "Intern" }, message_ids: [await addEmail(tx)] });
        acceptId = await acceptIdFor(tx, id);
      });
      await asUser(tx, b, async () => {
        expect((await undoFails(tx, acceptId)).message).toMatch(/nothing to undo/);
      });
      await asUser(tx, a, async () => {
        expect(await tx.scalar("select count(*)::int from public.applications")).toBe(1);
      });
    });
  });
});

describe.skipIf(!dbReady)("email_messages", () => {
  it("a re-scan never revives an email that was dismissed (upsert ignores duplicates)", async () => {
    await asNewUser(async (tx) => {
      const id = await addEmail(tx, { gmail_id: "fixed-id" });
      await tx.query("update public.email_messages set state = 'dismissed' where id = $1", [id]);
      // What supabase-js upsert({ onConflict: "user_id,gmail_id", ignoreDuplicates: true }) sends.
      await tx.query(
        `insert into public.email_messages (gmail_id, thread_id, received_at, from_address, kind)
         values ('fixed-id', 't', now(), 'a@b.example', 'confirmation')
         on conflict (user_id, gmail_id) do nothing`
      );
      expect(await tx.rows("select state from public.email_messages")).toEqual([{ state: "dismissed" }]);
    });
  });

  it("deleting the application unlinks its emails instead of deleting them", async () => {
    await asNewUser(async (tx) => {
      const email = await addEmail(tx);
      const id = await applyEmailJob(tx, { new_application: { company: "Globex", role: "Intern" }, message_ids: [email] });
      await tx.query("delete from public.applications where id = $1", [id]);
      expect(await tx.one("select state, application_id, accept_id from public.email_messages where id = $1", [email])).toEqual({
        state: "accepted",
        application_id: null,
        accept_id: null,
      });
    });
  });

  it("keeps snippets short: bodies are never stored", async () => {
    await asNewUser(async (tx) => {
      const e = await failure(tx, "insert into public.email_messages (gmail_id, thread_id, received_at, from_address, kind, snippet) values ('x', 'x', now(), 'a@b.example', 'confirmation', $1)", ["x".repeat(201)]);
      expect(e.constraint).toBe("email_messages_snippet_check");
    });
  });
});
