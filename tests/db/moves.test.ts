import { afterAll, describe, expect, it } from "vitest";
import { addApplication, addMove, asUser, closePool, createUser, dbReady, inTx, type Tx } from "./helpers";

afterAll(closePool);

// The Arbitrage tab's moves: the moves_before_write trigger keeps
// last_touch_at / replied_at / updated_at, and add_move_minutes adds time
// atomically. now() is fixed for a whole transaction, so each test seeds
// timestamps in the past and checks whether the trigger moved them to now().

const PAST = "2026-01-01T12:00:00Z";

async function asNewUser(fn: (tx: Tx) => Promise<void>) {
  await inTx(async (tx) => {
    const user = await createUser(tx);
    await asUser(tx, user, () => fn(tx));
  });
}

const isNow = (tx: Tx, col: string, id: string) =>
  tx.scalar<boolean>(`select ${col} = now() from public.moves where id = $1`, [id]);
const value = <T>(tx: Tx, col: string, id: string) => tx.scalar<T>(`select ${col} from public.moves where id = $1`, [id]);
const update = (tx: Tx, id: string, set: string) => tx.query(`update public.moves set ${set} where id = $1`, [id]);
const addMinutes = (tx: Tx, id: string, n: number) =>
  tx.scalar<number | null>("select public.add_move_minutes($1, $2)", [id, n]);

describe.skipIf(!dbReady)("moves", () => {
  describe("defaults", () => {
    it("a new move is sent, waiting on them, untimed, touched now, not replied", async () => {
      await asNewUser(async (tx) => {
        const row = await tx.one(
          "select stage, waiting_on, minutes, follow_ups, closed, replied_at, last_touch_at = now() as touched from public.moves where id = $1",
          [await addMove(tx)]
        );
        expect(row).toEqual({ stage: "sent", waiting_on: "them", minutes: 0, follow_ups: 0, closed: false, replied_at: null, touched: true });
      });
    });

    it("a move logged as already replied gets a replied_at", async () => {
      await asNewUser(async (tx) => {
        const id = await addMove(tx, { stage: "conversation" });
        expect(await isNow(tx, "replied_at", id)).toBe(true);
      });
    });
  });

  describe("last_touch_at", () => {
    it.each([
      ["a stage change", "stage = 'replied'"],
      ["whose turn it is", "waiting_on = 'me'"],
      ["a follow-up", "follow_ups = follow_ups + 1"],
    ])("moves to now on %s", async (_label, set) => {
      await asNewUser(async (tx) => {
        const id = await addMove(tx, { last_touch_at: PAST });
        await update(tx, id, set);
        expect(await isNow(tx, "last_touch_at", id)).toBe(true);
      });
    });

    it.each([
      ["notes", "notes = 'x'"],
      ["time", "minutes = 30"],
      ["the link", "link = 'https://example.com'"],
      ["closing it", "closed = true"],
      ["linking an application", "application_id = null"],
      ["setting the same stage again", "stage = 'sent'"],
    ])("stays put when only %s changes", async (_label, set) => {
      await asNewUser(async (tx) => {
        const id = await addMove(tx, { last_touch_at: PAST });
        await update(tx, id, set);
        expect(await isNow(tx, "last_touch_at", id)).toBe(false);
      });
    });

    it("can still be set by hand (e.g. backdated) without a conversation change", async () => {
      await asNewUser(async (tx) => {
        const id = await addMove(tx);
        await update(tx, id, `last_touch_at = '${PAST}'`);
        expect(await isNow(tx, "last_touch_at", id)).toBe(false);
      });
    });
  });

  describe("replied_at", () => {
    it("is set the first time the stage leaves sent", async () => {
      await asNewUser(async (tx) => {
        const id = await addMove(tx);
        await update(tx, id, "stage = 'replied'");
        expect(await isNow(tx, "replied_at", id)).toBe(true);
      });
    });

    it("keeps the first reply's date as the conversation goes on", async () => {
      await asNewUser(async (tx) => {
        const id = await addMove(tx, { stage: "replied", replied_at: PAST });
        await update(tx, id, "stage = 'positive'");
        expect(await isNow(tx, "replied_at", id)).toBe(false);
        expect(await value<Date>(tx, "replied_at", id)).toEqual(new Date(PAST));
      });
    });

    it("is cleared if the stage goes back to sent (a mis-click)", async () => {
      await asNewUser(async (tx) => {
        const id = await addMove(tx, { stage: "replied" });
        await update(tx, id, "stage = 'sent'");
        expect(await value(tx, "replied_at", id)).toBeNull();
      });
    });
  });

  it("updated_at is stamped on every write", async () => {
    await asNewUser(async (tx) => {
      const id = await addMove(tx, { updated_at: PAST });
      expect(await isNow(tx, "updated_at", id)).toBe(true);
      await update(tx, id, `updated_at = '${PAST}', notes = 'x'`);
      expect(await isNow(tx, "updated_at", id)).toBe(true);
    });
  });

  describe("add_move_minutes", () => {
    it("accumulates and returns the new total", async () => {
      await asNewUser(async (tx) => {
        const id = await addMove(tx);
        expect(await addMinutes(tx, id, 15)).toBe(15);
        expect(await addMinutes(tx, id, 60)).toBe(75);
        expect(await value(tx, "minutes", id)).toBe(75);
      });
    });

    it("can take time away, but never below zero", async () => {
      await asNewUser(async (tx) => {
        const id = await addMove(tx, { minutes: 20 });
        expect(await addMinutes(tx, id, -5)).toBe(15);
        expect(await addMinutes(tx, id, -100)).toBe(0);
      });
    });

    it("doesn't touch the conversation (adding time isn't contact)", async () => {
      await asNewUser(async (tx) => {
        const id = await addMove(tx, { last_touch_at: PAST });
        await addMinutes(tx, id, 30);
        expect(await isNow(tx, "last_touch_at", id)).toBe(false);
      });
    });

    it("returns null for a move that doesn't exist", async () => {
      await asNewUser(async (tx) => {
        expect(await tx.scalar("select public.add_move_minutes(gen_random_uuid(), 5)")).toBeNull();
      });
    });

    it("only touches the one move", async () => {
      await asNewUser(async (tx) => {
        const a = await addMove(tx);
        const b = await addMove(tx);
        await addMinutes(tx, a, 45);
        expect(await value(tx, "minutes", b)).toBe(0);
      });
    });
  });

  it("deleting an application unlinks its moves instead of deleting them", async () => {
    await asNewUser(async (tx) => {
      const app = await addApplication(tx);
      const id = await addMove(tx, { application_id: app, stage: "positive" });
      await tx.query("delete from public.applications where id = $1", [app]);
      expect(await tx.one("select application_id, stage from public.moves where id = $1", [id])).toEqual({
        application_id: null,
        stage: "positive",
      });
    });
  });

  it("message templates stamp updated_at", async () => {
    await asNewUser(async (tx) => {
      const id = await tx.scalar<string>(
        "insert into public.message_templates (channel, name, body, updated_at) values ('email', 'x', 'y', $1) returning id",
        [PAST]
      );
      expect(await tx.scalar("select updated_at = now() from public.message_templates where id = $1", [id])).toBe(true);
    });
  });
});
