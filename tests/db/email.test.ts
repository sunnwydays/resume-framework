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
