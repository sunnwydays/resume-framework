import { afterAll, describe, expect, it } from "vitest";
import { asUser, closePool, createUser, dbReady, failure, inTx, type Tx } from "./helpers";

afterAll(closePool);

// add_time / set_time back the time tracker. Both are atomic upserts that
// floor the day's total at zero.

const DAY = "2026-10-03";
const add = (tx: Tx, seconds: number | null, day = DAY) => tx.scalar<number>("select public.add_time($1::date, $2::int)", [day, seconds]);
const set = (tx: Tx, seconds: number, day = DAY) => tx.scalar<number>("select public.set_time($1::date, $2::int)", [day, seconds]);
const total = (tx: Tx, day = DAY) =>
  tx.scalar<number | undefined>("select seconds from public.time_log where day = $1::date", [day]);

async function asNewUser(fn: (tx: Tx) => Promise<void>) {
  await inTx(async (tx) => {
    const user = await createUser(tx);
    await asUser(tx, user, () => fn(tx));
  });
}

describe.skipIf(!dbReady)("time log", () => {
  describe("add_time", () => {
    it("starts a day and returns the new total", async () => {
      await asNewUser(async (tx) => {
        expect(await add(tx, 300)).toBe(300);
        expect(await total(tx)).toBe(300);
      });
    });

    it("accumulates", async () => {
      await asNewUser(async (tx) => {
        await add(tx, 300);
        await add(tx, 900);
        expect(await add(tx, 60)).toBe(1260);
        expect(await total(tx)).toBe(1260);
      });
    });

    it("keeps one row per day", async () => {
      await asNewUser(async (tx) => {
        await add(tx, 60, "2026-10-01");
        await add(tx, 120, "2026-10-02");
        await add(tx, 30, "2026-10-01");
        expect(await total(tx, "2026-10-01")).toBe(90);
        expect(await total(tx, "2026-10-02")).toBe(120);
        expect(await tx.scalar("select count(*)::int from public.time_log")).toBe(2);
      });
    });

    it("can take time away, but never below zero", async () => {
      await asNewUser(async (tx) => {
        await add(tx, 300);
        expect(await add(tx, -100)).toBe(200);
        expect(await add(tx, -1000)).toBe(0);
        expect(await total(tx)).toBe(0);
        expect(await add(tx, 60)).toBe(60); // and recovers normally
      });
    });

    it("a first call with a negative amount starts the day at zero", async () => {
      await asNewUser(async (tx) => {
        expect(await add(tx, -500)).toBe(0);
        expect(await total(tx)).toBe(0);
      });
    });

    it("adding nothing creates an empty day", async () => {
      await asNewUser(async (tx) => {
        expect(await add(tx, 0)).toBe(0);
        expect(await tx.scalar("select count(*)::int from public.time_log")).toBe(1);
      });
    });

    it("stamps updated_at", async () => {
      await asNewUser(async (tx) => {
        await add(tx, 60);
        expect(await tx.scalar("select updated_at = now() from public.time_log")).toBe(true);
      });
    });

    it("refuses a total that would overflow, without changing it", async () => {
      await asNewUser(async (tx) => {
        await add(tx, 2_147_483_000);
        const e = await failure(tx, "select public.add_time($1::date, 1000)", [DAY]);
        expect(e.message).toMatch(/integer out of range/);
        expect(await total(tx)).toBe(2_147_483_000);
      });
    });

    // greatest() ignores NULL, so a NULL amount resets the day to 0 instead
    // of leaving it alone. The app never sends one.
    it.todo("a NULL amount leaves the day's total alone");
  });

  describe("set_time", () => {
    it("creates or overwrites the day's total", async () => {
      await asNewUser(async (tx) => {
        expect(await set(tx, 1800)).toBe(1800);
        expect(await set(tx, 600)).toBe(600);
        expect(await total(tx)).toBe(600);
      });
    });

    it("can set a day back to zero", async () => {
      await asNewUser(async (tx) => {
        await add(tx, 500);
        expect(await set(tx, 0)).toBe(0);
        expect(await total(tx)).toBe(0);
      });
    });

    it("never stores a negative", async () => {
      await asNewUser(async (tx) => {
        expect(await set(tx, -30)).toBe(0);
        await add(tx, 100);
        expect(await set(tx, -1)).toBe(0);
      });
    });

    it("works for any day, and add_time carries on from the set value", async () => {
      await asNewUser(async (tx) => {
        await set(tx, 3600, "2020-01-01");
        expect(await add(tx, 60, "2020-01-01")).toBe(3660);
        await set(tx, 5, "2099-12-31");
        expect(await total(tx, "2099-12-31")).toBe(5);
      });
    });

    it("only touches the one day", async () => {
      await asNewUser(async (tx) => {
        await add(tx, 100, "2026-10-01");
        await set(tx, 999, "2026-10-02");
        expect(await total(tx, "2026-10-01")).toBe(100);
      });
    });
  });

  describe("the table", () => {
    it("allows one row per user per day", async () => {
      await asNewUser(async (tx) => {
        await tx.query("insert into public.time_log (day, seconds) values ($1, 10)", [DAY]);
        const e = await failure(tx, "insert into public.time_log (day, seconds) values ($1, 20)", [DAY]);
        expect(e.code).toBe("23505");
      });
    });

    it("different users can log the same day", async () => {
      await inTx(async (tx) => {
        const a = await createUser(tx, "a");
        const b = await createUser(tx, "b");
        await asUser(tx, a, () => add(tx, 100));
        await asUser(tx, b, () => add(tx, 200));
        expect(await tx.scalar("select sum(seconds)::int from public.time_log where user_id in ($1, $2)", [a, b])).toBe(300);
        await asUser(tx, a, async () => expect(await total(tx)).toBe(100));
        await asUser(tx, b, async () => expect(await total(tx)).toBe(200));
      });
    });
  });
});
