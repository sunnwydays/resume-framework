import { afterAll, describe, expect, it } from "vitest";
import { addPosting, asUser, closePool, createUser, dbReady, failure, inTx } from "./helpers";

afterAll(closePool);

// feedback_events: what the rules guessed against what Sunny chose. Rows are
// private to their user, labels outlive the thing they describe, and the app
// fills in a reason or an undo stamp afterwards.

const INSERT = `insert into public.feedback_events (surface, action, subject_id, guess, final, changed, app_version)
  values ('posting', 'dismiss', $1, '{"level":"intern"}', '{}', '{}', 'abc1234') returning id`;

describe.skipIf(!dbReady)("feedback_events", () => {
  it("takes its user from the session and defaults the json and review columns", async () => {
    await inTx(async (tx) => {
      const user = await createUser(tx);
      await asUser(tx, user, async () => {
        const id = await tx.scalar<string>(INSERT, ["p1"]);
        const row = await tx.one(
          "select user_id = auth.uid() as mine, context, changed, reason, undone_at, reviewed_at from public.feedback_events where id = $1",
          [id]
        );
        expect(row).toEqual({ mine: true, context: {}, changed: [], reason: null, undone_at: null, reviewed_at: null });
      });
    });
  });

  it("the app can label it with a reason and stamp it undone", async () => {
    await inTx(async (tx) => {
      const user = await createUser(tx);
      await asUser(tx, user, async () => {
        const id = await tx.scalar<string>(INSERT, ["p1"]);
        expect((await tx.query("update public.feedback_events set reason = 'wrong-level', note = 'is grad' where id = $1", [id])).rowCount).toBe(1);
        expect((await tx.query("update public.feedback_events set undone_at = now() where id = $1", [id])).rowCount).toBe(1);
        expect(await tx.one("select reason, note, undone_at is not null as undone from public.feedback_events")).toEqual({
          reason: "wrong-level",
          note: "is grad",
          undone: true,
        });
      });
    });
  });

  it("is private: another user can't read, change or delete it", async () => {
    await inTx(async (tx) => {
      const a = await createUser(tx, "a");
      const b = await createUser(tx, "b");
      await asUser(tx, a, async () => {
        await tx.scalar(INSERT, ["p1"]);
      });
      await asUser(tx, b, async () => {
        expect(await tx.scalar("select count(*)::int from public.feedback_events")).toBe(0);
        expect((await tx.query("update public.feedback_events set reason = 'x'")).rowCount).toBe(0);
        expect((await tx.query("delete from public.feedback_events")).rowCount).toBe(0);
      });
      await asUser(tx, a, async () => {
        expect(await tx.scalar("select count(*)::int from public.feedback_events")).toBe(1);
      });
    });
  });

  it("can't be written on behalf of another user", async () => {
    await inTx(async (tx) => {
      const a = await createUser(tx, "a");
      const b = await createUser(tx, "b");
      await asUser(tx, b, async () => {
        const e = await failure(tx, "insert into public.feedback_events (user_id, surface, action) values ($1, 'posting', 'dismiss')", [a]);
        expect(e.code).toBe("42501");
      });
    });
  });

  it("only takes a surface and action the app knows", async () => {
    await inTx(async (tx) => {
      const user = await createUser(tx);
      await asUser(tx, user, async () => {
        const surface = await failure(tx, "insert into public.feedback_events (surface, action) values ('nope', 'dismiss')");
        expect(surface.constraint).toBe("feedback_events_surface_check");
        const action = await failure(tx, "insert into public.feedback_events (surface, action) values ('posting', 'nope')");
        expect(action.constraint).toBe("feedback_events_action_check");
      });
    });
  });

  it("outlives the posting it describes, so 'Clear all' doesn't erase the labels", async () => {
    await inTx(async (tx) => {
      const user = await createUser(tx);
      await asUser(tx, user, async () => {
        const posting = await addPosting(tx);
        await tx.scalar(INSERT, [posting]);
        await tx.query("delete from public.job_postings");
        expect(await tx.scalar("select count(*)::int from public.feedback_events where subject_id = $1", [posting])).toBe(1);
      });
    });
  });
});
