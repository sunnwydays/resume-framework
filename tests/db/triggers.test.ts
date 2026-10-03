import { afterAll, describe, expect, it } from "vitest";
import { addApplication, addAssessment, asUser, closePool, createUser, dbReady, failure, inTx, setOrigin, type Tx } from "./helpers";

afterAll(closePool);

// Timestamps and status history come from database triggers, not app code.
// Inside one transaction now() never changes, so "was set to now" is checked
// with `= now()`, and an old date is planted first to show a value moved.

const OLD = "2026-01-01T00:00:00.000Z";

async function app(tx: Tx, id: string) {
  return tx.one<{ status: string; status_changed_at: Date | null; updated_at: Date; is_now: boolean; updated_is_now: boolean }>(
    `select status, status_changed_at, updated_at,
            status_changed_at = now() as is_now, updated_at = now() as updated_is_now
     from public.applications where id = $1`,
    [id]
  );
}

const history = (tx: Tx, id: string) =>
  tx.rows<{ status: string; origin: string; changed_at: Date | null; at_now: boolean | null }>(
    `select status, origin, changed_at, changed_at = now() as at_now
     from public.status_changes where application_id = $1 order by status`,
    [id]
  );

// Plants an old status_changed_at without touching the status (what an
// import does), so later changes visibly overwrite it.
async function plantOldDate(tx: Tx, id: string) {
  await setOrigin(tx, "import");
  await tx.query("update public.applications set status_changed_at = $2 where id = $1", [id, OLD]);
  await setOrigin(tx, "");
}

describe.skipIf(!dbReady)("status triggers", () => {
  it("status_origin() is 'manual' unless the setting says otherwise", async () => {
    await inTx(async (tx) => {
      expect(await tx.scalar("select public.status_origin()")).toBe("manual");
      await setOrigin(tx, "email");
      expect(await tx.scalar("select public.status_origin()")).toBe("email");
      await setOrigin(tx, "");
      expect(await tx.scalar("select public.status_origin()")).toBe("manual");
    });
  });

  describe("creating an application", () => {
    it("stamps the status date and logs the first status, as 'manual'", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const id = await addApplication(tx);
          const row = await app(tx, id);
          expect(row).toMatchObject({ status: "applied", is_now: true, updated_is_now: true });
          expect(await history(tx, id)).toMatchObject([{ status: "applied", origin: "manual", at_now: true }]);
        });
      });
    });

    it("ignores a status date the client tries to supply", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const id = await addApplication(tx, { status: "oa", status_changed_at: OLD });
          expect((await app(tx, id)).is_now).toBe(true);
          expect(await history(tx, id)).toMatchObject([{ status: "oa", origin: "manual", at_now: true }]);
        });
      });
    });

    it("defaults: status 'applied', source 'manual', today's date", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const id = await addApplication(tx);
          const row = await tx.one<{ status: string; source: string; applied_today: boolean }>(
            "select status, source, applied_on = current_date as applied_today from public.applications where id = $1",
            [id]
          );
          expect(row).toEqual({ status: "applied", source: "manual", applied_today: true });
        });
      });
    });
  });

  describe("changing the status", () => {
    it("stamps the new date and adds a history row", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const id = await addApplication(tx);
          await plantOldDate(tx, id);
          expect((await app(tx, id)).status_changed_at?.toISOString()).toBe(OLD);

          await tx.query("update public.applications set status = 'oa' where id = $1", [id]);
          expect(await app(tx, id)).toMatchObject({ status: "oa", is_now: true });
          expect((await history(tx, id)).map((h) => [h.status, h.origin])).toEqual([
            ["applied", "manual"],
            ["oa", "manual"],
          ]);
        });
      });
    });

    it("logs every step of a longer path", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const id = await addApplication(tx);
          for (const status of ["oa", "interview", "offer"]) {
            await tx.query("update public.applications set status = $2 where id = $1", [id, status]);
          }
          expect((await history(tx, id)).map((h) => h.status)).toEqual(["applied", "interview", "oa", "offer"]);
        });
      });
    });

    it("setting the same status again logs nothing", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const id = await addApplication(tx, { status: "oa" });
          await plantOldDate(tx, id);
          await tx.query("update public.applications set status = 'oa' where id = $1", [id]);
          expect(await history(tx, id)).toHaveLength(1);
          expect((await app(tx, id)).status_changed_at?.toISOString()).toBe(OLD);
        });
      });
    });

    it("editing anything else leaves the status date and history alone", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const id = await addApplication(tx);
          await plantOldDate(tx, id);
          await tx.query("update public.applications set notes = 'x', company = 'Beta', location = 'Toronto' where id = $1", [id]);
          const row = await app(tx, id);
          expect(row.status_changed_at?.toISOString()).toBe(OLD);
          expect(row.updated_is_now).toBe(true); // but updated_at does move
          expect(await history(tx, id)).toHaveLength(1);
        });
      });
    });

    it("a status outside the list is refused, and nothing changes", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const id = await addApplication(tx);
          const e = await failure(tx, "update public.applications set status = 'ghosted' where id = $1", [id]);
          expect(e.constraint).toBe("applications_status_check");
          expect((await app(tx, id)).status).toBe("applied");
          expect(await history(tx, id)).toHaveLength(1);
        });
      });
    });
  });

  describe("origin: who made the change", () => {
    it("an import keeps the date it was given, or none", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          await setOrigin(tx, "import");
          const dated = await addApplication(tx, { status: "rejected", status_changed_at: OLD });
          const undated = await addApplication(tx, { company: "Undated", status: "oa" });
          const datedHistory = await history(tx, dated);
          expect((await app(tx, dated)).status_changed_at?.toISOString()).toBe(OLD);
          expect(datedHistory).toMatchObject([{ status: "rejected", origin: "import" }]);
          expect(datedHistory[0].changed_at?.toISOString()).toBe(OLD);
          expect((await app(tx, undated)).status_changed_at).toBeNull();
          expect(await history(tx, undated)).toMatchObject([{ status: "oa", origin: "import", changed_at: null }]);
        });
      });
    });

    it("an import-origin status change keeps the existing date", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const id = await addApplication(tx);
          await plantOldDate(tx, id);
          await setOrigin(tx, "import");
          await tx.query("update public.applications set status = 'rejected' where id = $1", [id]);
          expect((await app(tx, id)).status_changed_at?.toISOString()).toBe(OLD);
          expect((await history(tx, id)).map((h) => [h.status, h.origin])).toEqual([
            ["applied", "manual"],
            ["rejected", "import"],
          ]);
        });
      });
    });

    // Groundwork for the Gmail integration: it will set the origin to 'email'.
    describe("email (for the Gmail integration)", () => {
      it("is accepted and recorded in the history", async () => {
        await inTx(async (tx) => {
          const user = await createUser(tx);
          await asUser(tx, user, async () => {
            const id = await addApplication(tx);
            await setOrigin(tx, "email");
            await tx.query("update public.applications set status = 'rejected' where id = $1", [id]);
            expect((await history(tx, id)).map((h) => [h.status, h.origin])).toEqual([
              ["applied", "manual"],
              ["rejected", "email"],
            ]);
          });
        });
      });

      // CURRENT behavior, pinned so the Gmail work changes it on purpose: an
      // email-origin change is stamped "now", not with the email's own date,
      // since only 'import' is exempt. When the integration needs the
      // message's date, applications_before_write must learn to keep it.
      it("is currently stamped with now(), not the email's date", async () => {
        await inTx(async (tx) => {
          const user = await createUser(tx);
          await asUser(tx, user, async () => {
            const id = await addApplication(tx);
            await setOrigin(tx, "email");
            await tx.query("update public.applications set status = 'rejected', status_changed_at = $2 where id = $1", [id, OLD]);
            expect((await app(tx, id)).is_now).toBe(true);
          });
        });
      });
    });

    it("an unknown origin makes the whole change fail", async () => {
      await inTx(async (tx) => {
        const user = await createUser(tx);
        await asUser(tx, user, async () => {
          const id = await addApplication(tx);
          await setOrigin(tx, "carrier-pigeon");
          const e = await failure(tx, "update public.applications set status = 'oa' where id = $1", [id]);
          expect(e.constraint).toBe("status_changes_origin_check");
          await setOrigin(tx, "");
          expect((await app(tx, id)).status).toBe("applied");
        });
      });
    });
  });
});

describe.skipIf(!dbReady)("assessment triggers", () => {
  const completed = (tx: Tx, id: string) =>
    tx.one<{ status: string; completed_at: Date | null; is_now: boolean | null }>(
      "select status, completed_at, completed_at = now() as is_now from public.assessments where id = $1",
      [id]
    );
  async function inApp(fn: (tx: Tx, appId: string) => Promise<void>) {
    await inTx(async (tx) => {
      const user = await createUser(tx);
      await asUser(tx, user, async () => fn(tx, await addApplication(tx)));
    });
  }

  it("a new pending assessment has no completion time, even if one is supplied", async () => {
    await inApp(async (tx, appId) => {
      const id = await addAssessment(tx, appId, { completed_at: OLD });
      expect(await completed(tx, id)).toMatchObject({ status: "pending", completed_at: null });
    });
  });

  it("completing it stamps now()", async () => {
    await inApp(async (tx, appId) => {
      const id = await addAssessment(tx, appId);
      await tx.query("update public.assessments set status = 'completed' where id = $1", [id]);
      expect(await completed(tx, id)).toMatchObject({ status: "completed", is_now: true });
    });
  });

  it("one created already completed is stamped too, unless it brings its own date", async () => {
    await inApp(async (tx, appId) => {
      const stamped = await addAssessment(tx, appId, { title: "a", status: "completed" });
      expect((await completed(tx, stamped)).is_now).toBe(true);
      const given = await addAssessment(tx, appId, { title: "b", status: "completed", completed_at: OLD });
      expect((await completed(tx, given)).completed_at?.toISOString()).toBe(OLD);
    });
  });

  it("completing it with a date you choose keeps that date", async () => {
    await inApp(async (tx, appId) => {
      const id = await addAssessment(tx, appId);
      await tx.query("update public.assessments set status = 'completed', completed_at = $2 where id = $1", [id, OLD]);
      expect((await completed(tx, id)).completed_at?.toISOString()).toBe(OLD);
    });
  });

  it("re-opening it clears the completion time", async () => {
    await inApp(async (tx, appId) => {
      const id = await addAssessment(tx, appId, { status: "completed", completed_at: OLD });
      await tx.query("update public.assessments set status = 'pending' where id = $1", [id]);
      expect(await completed(tx, id)).toMatchObject({ status: "pending", completed_at: null });
    });
  });

  it("editing a completed one doesn't restamp it", async () => {
    await inApp(async (tx, appId) => {
      const id = await addAssessment(tx, appId, { status: "completed", completed_at: OLD });
      await tx.query("update public.assessments set notes = 'edited', score = '90' where id = $1", [id]);
      expect((await completed(tx, id)).completed_at?.toISOString()).toBe(OLD);
    });
  });

  it("the completion date can be corrected by hand", async () => {
    await inApp(async (tx, appId) => {
      const id = await addAssessment(tx, appId, { status: "completed", completed_at: OLD });
      await tx.query("update public.assessments set completed_at = '2026-02-02T00:00:00Z' where id = $1", [id]);
      expect((await completed(tx, id)).completed_at?.toISOString()).toBe("2026-02-02T00:00:00.000Z");
    });
  });

  it("an import keeps the date it was given, or none", async () => {
    await inApp(async (tx, appId) => {
      await setOrigin(tx, "import");
      const dated = await addAssessment(tx, appId, { title: "a", status: "completed", completed_at: OLD });
      const undated = await addAssessment(tx, appId, { title: "b", status: "completed" });
      expect((await completed(tx, dated)).completed_at?.toISOString()).toBe(OLD);
      expect((await completed(tx, undated)).completed_at).toBeNull();
    });
  });

  it("refuses kinds, outcomes and statuses outside their lists", async () => {
    await inApp(async (tx, appId) => {
      const cases: [string, string][] = [
        ["kind", "assessments_kind_check"],
        ["outcome", "assessments_outcome_check"],
        ["status", "assessments_status_check"],
      ];
      for (const [col, constraint] of cases) {
        const e = await failure(tx, `insert into public.assessments (application_id, title, ${col}) values ($1, 'x', 'bogus')`, [appId]);
        expect(e.constraint, col).toBe(constraint);
      }
    });
  });

  it("deleting an assessment takes its questions with it", async () => {
    await inApp(async (tx, appId) => {
      const id = await addAssessment(tx, appId);
      await tx.query("insert into public.assessment_questions (assessment_id, question) values ($1, 'q1'), ($1, 'q2')", [id]);
      await tx.query("delete from public.assessments where id = $1", [id]);
      expect(await tx.scalar("select count(*)::int from public.assessment_questions where assessment_id = $1", [id])).toBe(0);
    });
  });
});
