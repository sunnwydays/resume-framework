import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { prioritize } from "@/lib/tracker/priority";
import type { Application, Assessment } from "@/lib/tracker/format";
import { makeApp, makeAssessment } from "../helpers/fixtures";

const HOUR = 3_600_000;
const NOW = new Date(2026, 9, 3, 12).getTime();
const at = (hours: number) => new Date(NOW + hours * HOUR).toISOString();

function order(assessments: Assessment[], apps: Application[] = []) {
  const byId = new Map(apps.map((a) => [a.id, a]));
  const ranks = prioritize(assessments, byId, NOW);
  return [...ranks].sort((a, b) => a[1].rank - b[1].rank).map(([id]) => id);
}

const a = (id: string, o: Partial<Assessment> = {}) => makeAssessment({ id, ...o });

describe("prioritize tiers", () => {
  it("dated first (soonest), then undated, then stale", () => {
    const ids = order([
      a("stale", { due_at: at(-100) }),
      a("undated"),
      a("later", { due_at: at(48) }),
      a("soon", { due_at: at(5) }),
    ]);
    expect(ids).toEqual(["soon", "later", "undated", "stale"]);
  });

  it("an assessment just overdue is still urgent, most overdue first", () => {
    const ids = order([a("future", { due_at: at(2) }), a("overdue1", { due_at: at(-1) }), a("overdue60", { due_at: at(-60) })]);
    expect(ids).toEqual(["overdue60", "overdue1", "future"]);
  });

  it("overdue by more than 72h counts as stale", () => {
    expect(order([a("stale", { due_at: at(-73) }), a("undated")])).toEqual(["undated", "stale"]);
    expect(order([a("edge", { due_at: at(-72) }), a("undated")])).toEqual(["edge", "undated"]);
  });

  it("stale ones: the most recently missed first", () => {
    expect(order([a("old", { due_at: at(-500) }), a("recent", { due_at: at(-100) })])).toEqual(["recent", "old"]);
  });

  it("undated: important first", () => {
    expect(order([a("plain"), a("star", { important: true })])).toEqual(["star", "plain"]);
  });
});

describe("important head start", () => {
  it("counts an important one as due 24h earlier", () => {
    const ids = order([a("plain30", { due_at: at(30) }), a("star40", { due_at: at(40), important: true })]);
    expect(ids).toEqual(["star40", "plain30"]);
  });
  it("but not more than that", () => {
    const ids = order([a("plain30", { due_at: at(30) }), a("star60", { due_at: at(60), important: true })]);
    expect(ids).toEqual(["plain30", "star60"]);
  });
});

describe("tie-breaks", () => {
  it("same due time: shorter first, unknown length last", () => {
    const due = at(10);
    const ids = order([
      a("unknown", { due_at: due }),
      a("90", { due_at: due, duration_min: 90 }),
      a("30", { due_at: due, duration_min: 30 }),
    ]);
    expect(ids).toEqual(["30", "90", "unknown"]);
  });
  it("same time and length: easier first", () => {
    const due = at(10);
    const ids = order([
      a("hard", { due_at: due, duration_min: 60, difficulty: 5 }),
      a("easy", { due_at: due, duration_min: 60, difficulty: 2 }),
    ]);
    expect(ids).toEqual(["easy", "hard"]);
  });
  it("full ties keep input order", () => {
    expect(order([a("x", { due_at: at(3) }), a("y", { due_at: at(3) })])).toEqual(["x", "y"]);
  });
});

describe("who gets ranked", () => {
  it("skips completed assessments", () => {
    expect(order([a("done", { status: "completed", due_at: at(2) }), a("todo", { due_at: at(3) })])).toEqual(["todo"]);
  });

  it("skips ones whose application is rejected or withdrawn", () => {
    const rejected = makeApp({ id: "r", status: "rejected" });
    const withdrawn = makeApp({ id: "w", status: "withdrawn" });
    const live = makeApp({ id: "l", status: "oa" });
    const ids = order(
      [
        a("a1", { application_id: "r", due_at: at(1) }),
        a("a2", { application_id: "w", due_at: at(1) }),
        a("a3", { application_id: "l", due_at: at(1) }),
      ],
      [rejected, withdrawn, live]
    );
    expect(ids).toEqual(["a3"]);
  });

  it("still ranks assessments for an application that offered", () => {
    const offer = makeApp({ id: "o", status: "offer" });
    expect(order([a("x", { application_id: "o", due_at: at(1) })], [offer])).toEqual(["x"]);
  });

  it("ranks an assessment whose application is unknown", () => {
    expect(order([a("orphan", { application_id: "missing" })])).toEqual(["orphan"]);
  });
});

describe("ranks and reasons", () => {
  it("ranks are 1..n with no gaps", () => {
    const ranks = prioritize(
      [a("a", { due_at: at(3) }), a("b"), a("c", { due_at: at(-200) })],
      new Map(),
      NOW
    );
    expect([...ranks.values()].map((r) => r.rank).sort()).toEqual([1, 2, 3]);
  });

  it("explains the ranking", () => {
    const ranks = prioritize(
      [
        a("full", { due_at: at(5), important: true, duration_min: 45, difficulty: 3 }),
        a("none"),
        a("stale", { due_at: at(-100) }),
      ],
      new Map(),
      NOW
    );
    expect(ranks.get("full")!.reason).toBe("due in 5h · important · 45 min · difficulty 3/5");
    expect(ranks.get("none")!.reason).toBe("no due date");
    expect(ranks.get("stale")!.reason).toBe("overdue 4d, may be closed");
  });

  it("is a total, deterministic order for any input", () => {
    const item = fc.record({
      due: fc.option(fc.integer({ min: -400, max: 400 }), { nil: undefined }),
      important: fc.boolean(),
      duration: fc.option(fc.integer({ min: 5, max: 240 }), { nil: undefined }),
      difficulty: fc.option(fc.integer({ min: 1, max: 5 }), { nil: undefined }),
    });
    fc.assert(
      fc.property(fc.array(item, { maxLength: 12 }), (items) => {
        const list = items.map((i, n) =>
          a(`id${n}`, {
            due_at: i.due === undefined ? null : at(i.due),
            important: i.important,
            duration_min: i.duration ?? null,
            difficulty: i.difficulty ?? null,
          })
        );
        const first = order(list);
        expect(first).toHaveLength(list.length);
        expect(new Set(first).size).toBe(list.length);
        expect(order([...list].reverse()).length).toBe(list.length);
      })
    );
  });
});
