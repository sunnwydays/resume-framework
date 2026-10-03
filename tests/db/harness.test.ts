import { afterAll, describe, expect, it } from "vitest";
import { addApplication, asAnon, asUser, closePool, createUser, dbReady, failure, inTx } from "./helpers";

afterAll(closePool);

// The other db tests are only as trustworthy as this harness: it must roll
// everything back, never commit, and really apply row-level security.
describe.skipIf(!dbReady)("db test harness", () => {
  it("rolls back everything, including users and rows", async () => {
    let userId = "";
    let applicationId = "";
    await inTx(async (tx) => {
      userId = await createUser(tx, "rollback");
      await asUser(tx, userId, async () => {
        applicationId = await addApplication(tx);
      });
      expect(await tx.scalar("select count(*)::int from public.applications where id = $1", [applicationId])).toBe(1);
    });
    await inTx(async (tx) => {
      expect(await tx.scalar("select count(*)::int from auth.users where id = $1", [userId])).toBe(0);
      expect(await tx.scalar("select count(*)::int from public.applications where id = $1", [applicationId])).toBe(0);
    });
  });

  it("rolls back even when the test throws", async () => {
    let userId = "";
    await expect(
      inTx(async (tx) => {
        userId = await createUser(tx, "throws");
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    await inTx(async (tx) => {
      expect(await tx.scalar("select count(*)::int from auth.users where id = $1", [userId])).toBe(0);
    });
  });

  it("refuses to commit", async () => {
    await inTx(async (tx) => {
      expect(() => tx.query("commit")).toThrow(/end the transaction/);
      expect(() => tx.query("  END;")).toThrow(/end the transaction/);
      expect(() => tx.query("begin")).toThrow(/end the transaction/);
      expect(() => tx.query("select 1; commit")).toThrow(/end the transaction/);
      await expect(tx.scalar("select case when true then 1 else 0 end")).resolves.toBe(1); // 'end' inside is fine
    });
  });

  it("applies row-level security as the signed-in user", async () => {
    await inTx(async (tx) => {
      const a = await createUser(tx, "a");
      const b = await createUser(tx, "b");
      await asUser(tx, a, async () => {
        expect(await tx.scalar("select auth.uid()::text")).toBe(a);
        await addApplication(tx);
        expect(await tx.scalar("select count(*)::int from public.applications")).toBe(1);
      });
      await asUser(tx, b, async () => {
        expect(await tx.scalar("select auth.uid()::text")).toBe(b);
        expect(await tx.scalar("select count(*)::int from public.applications")).toBe(0);
      });
    });
  });

  it("switches back to the connection's own role afterwards", async () => {
    await inTx(async (tx) => {
      const before = await tx.scalar("select current_user");
      const a = await createUser(tx, "a");
      await asUser(tx, a, async () => {
        expect(await tx.scalar("select current_user")).toBe("authenticated");
      });
      expect(await tx.scalar("select current_user")).toBe(before);
      await asAnon(tx, async () => {
        expect(await tx.scalar("select current_user")).toBe("anon");
      });
      expect(await tx.scalar("select current_user")).toBe(before);
    });
  });

  it("failure() captures an error and leaves the transaction usable", async () => {
    await inTx(async (tx) => {
      const e = await failure(tx, "select 1/0");
      expect(e.message).toMatch(/division by zero/);
      expect(await tx.scalar("select 2")).toBe(2);
      await expect(failure(tx, "select 1")).rejects.toThrow(/expected this to fail/);
    });
  });
});
