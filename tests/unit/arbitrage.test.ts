import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  EMPTY_CONTEXT,
  MIN_MOVES_FOR_MULTIPLIER,
  effectiveStage,
  exchangeRates,
  formatMultiplier,
  formatRate,
  funnel,
  perHour,
  stagePatch,
  templateStats,
  thisWeek,
  type AppContext,
} from "@/lib/tracker/arbitrage";
import { MOVE_CHANNELS, MOVE_STAGES, type Application, type Assessment, type StatusChange } from "@/lib/tracker/format";
import { groupBy } from "@/lib/tracker/stats";
import { local, makeApp, makeAssessment, makeChange, makeMove } from "../helpers/fixtures";

const NOW = new Date(local(2026, 10, 3, 12)).getTime(); // Saturday; the week started Monday 28 Sep

function context(apps: Application[], assessments: Assessment[] = [], changes: StatusChange[] = []): AppContext {
  return {
    appsById: new Map(apps.map((a) => [a.id, a])),
    assessmentsByApp: groupBy(assessments, (a) => a.application_id),
    changesByApp: groupBy(changes, (c) => c.application_id),
  };
}

describe("effectiveStage", () => {
  it("is the move's own stage when nothing is linked", () => {
    expect(effectiveStage(makeMove({ stage: "conversation" }), EMPTY_CONTEXT)).toBe("conversation");
  });

  it("is the move's own stage when the link points at an application that isn't loaded", () => {
    expect(effectiveStage(makeMove({ stage: "replied", application_id: "gone" }), EMPTY_CONTEXT)).toBe("replied");
  });

  it.each([
    ["applied", "replied"],
    ["oa", "positive"],
    ["video_interview", "interview"],
    ["interview", "interview"],
    ["offer", "offer"],
  ] as const)("a linked application at %s lifts a replied move to %s", (status, expected) => {
    const app = makeApp({ status });
    const move = makeMove({ stage: "replied", application_id: app.id });
    expect(effectiveStage(move, context([app]))).toBe(expected);
  });

  it("counts how far the application got, even if it's rejected now", () => {
    const app = makeApp({ status: "rejected" });
    const ctx = context([app], [makeAssessment({ application_id: app.id, kind: "interview" })]);
    expect(effectiveStage(makeMove({ application_id: app.id }), ctx)).toBe("interview");
  });

  it("uses status history too", () => {
    const app = makeApp({ status: "rejected" });
    const ctx = context([app], [], [makeChange({ application_id: app.id, status: "offer" })]);
    expect(effectiveStage(makeMove({ application_id: app.id }), ctx)).toBe("offer");
  });

  it("never lowers the stage the user set", () => {
    const app = makeApp({ status: "applied" });
    expect(effectiveStage(makeMove({ stage: "offer", application_id: app.id }), context([app]))).toBe("offer");
  });
});

describe("stagePatch", () => {
  it("moving up into a reply makes it your turn", () => {
    for (const stage of ["replied", "conversation", "positive"] as const) {
      expect(stagePatch(makeMove({ stage: "sent" }), stage)).toEqual({ stage, waiting_on: "me" });
    }
  });

  it("moving down or past positive leaves whose turn it is alone", () => {
    expect(stagePatch(makeMove({ stage: "conversation" }), "replied")).toEqual({ stage: "replied" });
    expect(stagePatch(makeMove({ stage: "positive" }), "interview")).toEqual({ stage: "interview" });
    expect(stagePatch(makeMove({ stage: "replied" }), "replied")).toEqual({ stage: "replied" });
  });

  it("back to sent means waiting on them", () => {
    expect(stagePatch(makeMove({ stage: "replied", waiting_on: "me" }), "sent")).toEqual({ stage: "sent", waiting_on: "them" });
  });
});

describe("funnel", () => {
  const counts = (moves = [makeMove()], ctx = EMPTY_CONTEXT) => funnel(moves, ctx).map((s) => s.count);

  it("is zero all the way down with no moves", () => {
    expect(counts([])).toEqual([0, 0, 0, 0, 0, 0]);
    expect(funnel([]).map((s) => s.stepRate)).toEqual(["—", "—", "—", "—", "—", "—"]);
  });

  it("counts each move at every stage up to the furthest it reached", () => {
    const moves = [
      makeMove({ stage: "sent" }),
      makeMove({ stage: "sent" }),
      makeMove({ stage: "replied" }),
      makeMove({ stage: "conversation" }),
      makeMove({ stage: "positive" }),
    ];
    expect(counts(moves)).toEqual([5, 3, 2, 1, 0, 0]);
    expect(funnel(moves).map((s) => s.stepRate)).toEqual(["—", "60%", "67%", "50%", "0%", "—"]);
  });

  it("only counts outreach: a project isn't a message sent", () => {
    expect(counts([makeMove({ channel: "project", stage: "positive" }), makeMove({ channel: "community" })])).toEqual([0, 0, 0, 0, 0, 0]);
    expect(counts([makeMove({ channel: "email" }), makeMove({ channel: "warm" }), makeMove({ channel: "other" })])[0]).toBe(3);
  });

  it("keeps closed moves (a dead thread still replied)", () => {
    expect(counts([makeMove({ stage: "replied", closed: true })])).toEqual([1, 1, 0, 0, 0, 0]);
  });

  it("counts what a linked application did", () => {
    const app = makeApp({ status: "interview" });
    expect(counts([makeMove({ stage: "replied", application_id: app.id })], context([app]))).toEqual([1, 1, 1, 1, 1, 0]);
  });

  it("never grows from one stage to the next", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            stage: fc.constantFrom(...MOVE_STAGES),
            channel: fc.constantFrom(...(Object.keys(MOVE_CHANNELS) as (keyof typeof MOVE_CHANNELS)[])),
            closed: fc.boolean(),
          }),
          { maxLength: 40 }
        ),
        (rows) => {
          const c = counts(rows.map((r) => makeMove(r)));
          for (let i = 1; i < c.length; i++) expect(c[i]).toBeLessThanOrEqual(c[i - 1]);
        }
      )
    );
  });
});

describe("per-hour formatting", () => {
  it("perHour is null without time, not infinite", () => {
    expect(perHour(3, 0)).toBeNull();
    expect(perHour(3, 90)).toBe(2);
  });

  it.each([
    [1, 60, "1/h"],
    [1, 180, "0.33/h"],
    [30, 60, "30/h"],
    [0, 60, "0/h"],
    [5, 0, "—"],
  ])("formatRate(%i, %i min) = %s", (n, minutes, expected) => expect(formatRate(n, minutes)).toBe(expected));

  it.each([
    [2, "2×"],
    [4.24, "4.2×"],
    [0.5, "0.5×"],
    [12.6, "13×"],
  ])("formatMultiplier(%d) = %s", (n, expected) => expect(formatMultiplier(n)).toBe(expected));
});

describe("exchangeRates", () => {
  it("adds up time and outcomes per channel, in channel order", () => {
    const moves = [
      makeMove({ channel: "email", minutes: 15, stage: "conversation" }),
      makeMove({ channel: "linkedin", minutes: 10, stage: "sent" }),
      makeMove({ channel: "linkedin", minutes: 10, stage: "positive" }),
    ];
    const r = exchangeRates(moves, [], EMPTY_CONTEXT);
    expect(r.channels.map((c) => c.channel)).toEqual(["linkedin", "email"]);
    expect(r.channels[0]).toMatchObject({ moves: 2, minutes: 20, replies: 1, conversations: 1, positives: 1 });
    expect(r.channels[1]).toMatchObject({ moves: 1, minutes: 15, replies: 1, conversations: 1, positives: 0 });
    expect(r.arbitrage).toEqual({ moves: 3, minutes: 35, replies: 2, conversations: 2, positives: 1 });
  });

  it("puts an unknown channel under other", () => {
    const r = exchangeRates([makeMove({ channel: "carrier pigeon" })], [], EMPTY_CONTEXT);
    expect(r.channels.map((c) => c.channel)).toEqual(["other"]);
  });

  it("the cold baseline is every application not linked to a move, at the flat time", () => {
    const linked = makeApp({ status: "interview" });
    const apps = [
      linked,
      makeApp({ status: "applied" }),
      makeApp({ status: "rejected" }), // a reply, not a positive
      makeApp({ status: "oa" }),
    ];
    const r = exchangeRates([makeMove({ application_id: linked.id })], apps, context(apps), 30);
    expect(r.cold).toEqual({ moves: 3, minutes: 90, replies: 2, conversations: 0, positives: 1 });
  });

  it("a rejected application that had an OA still counts as positive", () => {
    const app = makeApp({ status: "rejected" });
    const ctx = context([app], [makeAssessment({ application_id: app.id, kind: "oa" })]);
    expect(exchangeRates([], [app], ctx).cold.positives).toBe(1);
  });

  describe("multiplier", () => {
    const threeMoves = (positive = true) => [
      makeMove({ minutes: 20, stage: positive ? "positive" : "replied" }),
      makeMove({ minutes: 20 }),
      makeMove({ minutes: 20 }),
    ];
    const coldApps = (oa: number, rejected = 0, applied = 6) => [
      ...Array.from({ length: oa }, () => makeApp({ status: "oa" })),
      ...Array.from({ length: rejected }, () => makeApp({ status: "rejected" })),
      ...Array.from({ length: applied - oa - rejected }, () => makeApp()),
    ];

    it("compares positives per hour: 1/h of moves vs 0.5/h cold is 2×", () => {
      const apps = coldApps(1);
      expect(exchangeRates(threeMoves(), apps, context(apps), 20).multiplier).toEqual({ basis: "positives", value: 2 });
    });

    it("falls back to replies when neither side has a positive yet", () => {
      const apps = coldApps(0, 2);
      // moves: 1 reply / 1h; cold: 2 replies / 2h
      expect(exchangeRates(threeMoves(false), apps, context(apps), 20).multiplier).toEqual({ basis: "replies", value: 1 });
    });

    it(`waits for ${MIN_MOVES_FOR_MULTIPLIER} moves`, () => {
      const apps = coldApps(1);
      expect(exchangeRates(threeMoves().slice(0, 2), apps, context(apps)).multiplier).toBeNull();
    });

    it("is null when one side has nothing to compare (no division by zero)", () => {
      expect(exchangeRates(threeMoves(), [], EMPTY_CONTEXT).multiplier).toBeNull();
      const none = coldApps(0);
      expect(exchangeRates(threeMoves(), none, context(none)).multiplier).toBeNull();
      const apps = coldApps(1);
      const untimed = threeMoves().map((m) => ({ ...m, minutes: 0 }));
      expect(exchangeRates(untimed, apps, context(apps)).multiplier).toBeNull();
    });
  });
});

describe("templateStats", () => {
  it("reply rate per template, outreach only, ignoring moves with no template", () => {
    const stats = templateStats([
      makeMove({ template_key: "builtin:coffee-chat", stage: "replied" }),
      makeMove({ template_key: "builtin:coffee-chat" }),
      makeMove({ template_key: "builtin:coffee-chat" }),
      makeMove({ template_key: "builtin:coffee-chat", stage: "offer" }),
      makeMove({ template_key: "tpl-x", channel: "project", stage: "positive" }),
      makeMove({ template_key: null, stage: "replied" }),
    ]);
    expect([...stats.keys()]).toEqual(["builtin:coffee-chat"]);
    expect(stats.get("builtin:coffee-chat")).toEqual({ sent: 4, replied: 2, rate: "50%" });
  });
});

describe("thisWeek", () => {
  it("counts outreach sent and replies received since Monday, in local days", () => {
    const moves = [
      makeMove({ created_at: local(2026, 9, 28, 0, 30) }), // Monday, just after midnight
      makeMove({ created_at: local(2026, 9, 27, 23, 30) }), // Sunday before
      makeMove({ created_at: local(2026, 10, 2), channel: "project", minutes: 120 }),
      makeMove({ created_at: local(2026, 9, 20), stage: "replied", replied_at: local(2026, 9, 29) }),
      makeMove({ created_at: local(2026, 9, 20), stage: "replied", replied_at: local(2026, 9, 26) }),
    ];
    const w = thisWeek(moves, [], NOW);
    expect(w.start).toBe("2026-09-28");
    expect(w.sent).toBe(1);
    expect(w.replies).toBe(1);
    expect(w.arbitrageMinutes).toBe(10 + 120);
  });

  it("counts cold applications this week, leaving out ones a move led to", () => {
    const linked = makeApp({ applied_on: "2026-10-01" });
    const apps = [linked, makeApp({ applied_on: "2026-09-28" }), makeApp({ applied_on: "2026-09-27" })];
    expect(thisWeek([makeMove({ application_id: linked.id, created_at: local(2026, 9, 1) })], apps, NOW).coldApps).toBe(1);
  });
});
