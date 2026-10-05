import { afterAll, describe, expect, it } from "vitest";
import { addApplication, addPosting, asUser, closePool, createUser, dbReady, failure, inTx, type Tx } from "./helpers";

afterAll(closePool);

// The Postings page's job_postings: a scan upserts with "do nothing on
// conflict", so a posting you've dismissed, saved or applied to is never
// brought back as new.

async function asNewUser(fn: (tx: Tx) => Promise<void>) {
  await inTx(async (tx) => {
    const user = await createUser(tx);
    await asUser(tx, user, () => fn(tx));
  });
}

// What savePostings sends: insert, skipping any (user, source, source id) already stored.
const UPSERT = `insert into public.job_postings (source, source_id, url, company, role, first_seen_at, gmail_id)
  values ('jobright', $1, 'https://jobright.ai/jobs/info/x', 'Vandelay Industries', 'SWE Intern', now(), 'g-again')
  on conflict (user_id, source, source_id) do nothing returning id`;

describe.skipIf(!dbReady)("job_postings", () => {
  it("a new posting is new, unlinked, and the user id comes from the session", async () => {
    await asNewUser(async (tx) => {
      const id = await addPosting(tx);
      const row = await tx.one("select state, application_id, user_id = auth.uid() as mine from public.job_postings where id = $1", [id]);
      expect(row).toEqual({ state: "new", application_id: null, mine: true });
    });
  });

  it.each(["dismissed", "saved", "applied"])("scanning again doesn't change a %s posting", async (state) => {
    await asNewUser(async (tx) => {
      const id = await addPosting(tx, { source_id: "same-job", state });
      const again = await tx.rows(UPSERT, ["same-job"]);
      expect(again).toEqual([]);
      expect(await tx.scalar("select state from public.job_postings where id = $1", [id])).toBe(state);
      expect(await tx.scalar("select count(*)::int from public.job_postings")).toBe(1);
    });
  });

  it("a job not seen before is stored", async () => {
    await asNewUser(async (tx) => {
      await addPosting(tx, { source_id: "one" });
      expect((await tx.rows(UPSERT, ["two"])).length).toBe(1);
      expect(await tx.scalar("select count(*)::int from public.job_postings")).toBe(2);
    });
  });

  it("the same job can't be stored twice by a plain insert", async () => {
    await asNewUser(async (tx) => {
      await addPosting(tx, { source_id: "dup" });
      const e = await failure(tx, "insert into public.job_postings (source, source_id, url, company, role, first_seen_at, gmail_id) values ('jobright', 'dup', 'u', 'c', 'r', now(), 'g')");
      expect(e.code).toBe("23505");
    });
  });

  it("two users can each hold the same job", async () => {
    await inTx(async (tx) => {
      const a = await createUser(tx, "a");
      const b = await createUser(tx, "b");
      await asUser(tx, a, async () => {
        await addPosting(tx, { source_id: "shared" });
      });
      await asUser(tx, b, async () => {
        expect((await tx.rows(UPSERT, ["shared"])).length).toBe(1);
      });
    });
  });

  it("deleting the application it was applied as just unlinks it", async () => {
    await asNewUser(async (tx) => {
      const app = await addApplication(tx);
      const id = await addPosting(tx, { state: "applied", application_id: app });
      await tx.query("delete from public.applications where id = $1", [app]);
      expect(await tx.one("select state, application_id from public.job_postings where id = $1", [id])).toEqual({ state: "applied", application_id: null });
    });
  });
});
