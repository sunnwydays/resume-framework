import { describe, expect, it } from "vitest";
import {
  BUILD_DAYS,
  FOLLOW_UP_DAYS,
  MAX_FOLLOW_UPS,
  STALE_DAYS,
  TEMPLATE_MIN_SENDS,
  nextSteps,
  type NextStepKind,
} from "@/lib/tracker/nextSteps";
import type { Move } from "@/lib/tracker/format";
import { local, makeApp, makeMove } from "../helpers/fixtures";

const NOW = new Date(local(2026, 10, 3, 12)).getTime(); // Saturday 3 Oct; the week started Monday 28 Sep
const daysAgo = (n: number, hour = 12) => local(2026, 10, 3 - n, hour);

// A recent project and a met weekly target, so only the rule under test fires.
const quiet = (n = 10): Move[] => [
  makeMove({ channel: "project", created_at: daysAgo(1), last_touch_at: daysAgo(1) }),
  ...Array.from({ length: n }, () => makeMove({ created_at: daysAgo(1), last_touch_at: daysAgo(1) })),
];

const kinds = (moves: Move[]) => nextSteps(moves, [], NOW).map((s) => s.kind);
const run = (moves: Move[], options = {}) => nextSteps(moves, [], NOW, options);
const only = (moves: Move[], kind: NextStepKind) => run(moves).filter((s) => s.kind === kind);

describe("nextSteps", () => {
  it("with nothing logged yet, says how to start (and to build something)", () => {
    expect(kinds([])).toEqual(["start", "build"]);
  });

  it("is empty when everything is on track", () => {
    expect(run(quiet())).toEqual([]);
  });

  describe("replies waiting on you", () => {
    it("come first, oldest first, and skip closed moves", () => {
      const moves = [
        ...quiet(),
        makeMove({ target: "Newer", waiting_on: "me", stage: "replied", last_touch_at: daysAgo(1) }),
        makeMove({ target: "Older", waiting_on: "me", stage: "replied", last_touch_at: daysAgo(4) }),
        makeMove({ target: "Closed", waiting_on: "me", closed: true }),
      ];
      const steps = run(moves);
      expect(steps.map((s) => s.text)).toEqual(["Reply to Older", "Reply to Newer"]);
      expect(steps[0].detail).toBe("They wrote back 4 days ago.");
      expect(steps[0].moveId).toBe(moves.find((m) => m.target === "Older")!.id);
    });

    it("applies to effort moves too (someone reached out about your project)", () => {
      expect(only([...quiet(), makeMove({ channel: "project", waiting_on: "me" })], "reply")).toHaveLength(1);
    });
  });

  describe("follow-ups", () => {
    it(`are due ${FOLLOW_UP_DAYS} calendar days after the last touch, not before`, () => {
      expect(only([...quiet(), makeMove({ last_touch_at: daysAgo(FOLLOW_UP_DAYS - 1) })], "follow_up")).toEqual([]);
      // Late in the evening 3 days ago is still 3 calendar days.
      const due = only([...quiet(), makeMove({ target: "Sam", last_touch_at: daysAgo(FOLLOW_UP_DAYS, 23) })], "follow_up");
      expect(due.map((s) => s.text)).toEqual(["Follow up with Sam"]);
    });

    it(`stop after ${MAX_FOLLOW_UPS}, and suggest closing instead`, () => {
      const moves = [...quiet(), makeMove({ target: "Sam", follow_ups: MAX_FOLLOW_UPS, last_touch_at: daysAgo(5) })];
      expect(only(moves, "follow_up")).toEqual([]);
      expect(only(moves, "close").map((s) => s.text)).toEqual(["Let Sam go"]);
    });

    it("only for outreach that's waiting on them and still open", () => {
      const old = daysAgo(10);
      const moves = [
        ...quiet(),
        makeMove({ channel: "project", last_touch_at: old }),
        makeMove({ waiting_on: "me", last_touch_at: old }),
        makeMove({ closed: true, last_touch_at: old }),
      ];
      expect(run(moves).filter((s) => s.kind !== "reply")).toEqual([]);
    });

    it(`a conversation gets a nudge after ${STALE_DAYS} quiet days`, () => {
      expect(only([...quiet(), makeMove({ stage: "conversation", last_touch_at: daysAgo(STALE_DAYS - 1) })], "nudge")).toEqual([]);
      expect(only([...quiet(), makeMove({ stage: "conversation", last_touch_at: daysAgo(STALE_DAYS) })], "nudge")).toHaveLength(1);
    });

    it("an interview isn't nudged here (the Applications tab tracks it)", () => {
      expect(only([...quiet(), makeMove({ stage: "interview", last_touch_at: daysAgo(30) })], "nudge")).toEqual([]);
    });
  });

  it("a positive conversation with no application yet is a referral to ask for", () => {
    const moves = [...quiet(), makeMove({ target: "Ana", stage: "positive", waiting_on: "them", last_touch_at: daysAgo(1) })];
    expect(only(moves, "referral").map((s) => s.text)).toEqual(["Turn Ana into a referral"]);
    const linked = moves.map((m) => (m.target === "Ana" ? { ...m, application_id: "app-9" } : m));
    expect(only(linked, "referral")).toEqual([]);
  });

  describe("templates", () => {
    const sends = (key: string, n: number, replies: number) =>
      Array.from({ length: n }, (_, i) =>
        makeMove({ template_key: key, stage: i < replies ? "replied" : "sent", waiting_on: "them", last_touch_at: daysAgo(1) })
      );

    it(`one with ${TEMPLATE_MIN_SENDS}+ sends and under 10% replies needs rework`, () => {
      const steps = nextSteps([...quiet(), ...sends("tpl-1", 10, 0)], [], NOW, { templateNames: new Map([["tpl-1", "Cold DM"]]) });
      const rework = steps.filter((s) => s.kind === "rework_template");
      expect(rework).toEqual([expect.objectContaining({ text: "Rework “Cold DM”", templateKey: "tpl-1" })]);
    });

    it("isn't judged on too few sends, or when it's working", () => {
      expect(only([...quiet(), ...sends("tpl-1", TEMPLATE_MIN_SENDS - 1, 0)], "rework_template")).toEqual([]);
      expect(only([...quiet(), ...sends("tpl-1", 10, 1)], "rework_template")).toEqual([]);
    });
  });

  describe("weekly target", () => {
    it("counts outreach sent since Monday", () => {
      const steps = nextSteps(quiet(3), [], NOW, { weeklyTarget: 5 });
      expect(steps.find((s) => s.kind === "send_more")).toMatchObject({ text: "Send 2 more messages this week", detail: "3 of 5 so far." });
    });

    it("says message for one", () => {
      expect(nextSteps(quiet(4), [], NOW, { weeklyTarget: 5 }).find((s) => s.kind === "send_more")?.text).toBe("Send 1 more message this week");
    });

    it("last week's messages don't count", () => {
      const old = Array.from({ length: 10 }, () => makeMove({ created_at: daysAgo(6), last_touch_at: daysAgo(1) }));
      expect(only([...quiet(0), ...old], "send_more")).toHaveLength(1);
    });
  });

  it(`suggests a project when none was logged in ${BUILD_DAYS} days`, () => {
    const moves = quiet().map((m) => (m.channel === "project" ? { ...m, created_at: daysAgo(BUILD_DAYS) } : m));
    expect(only(moves, "build")[0].detail).toMatch(/^Last one was 14 days ago\./);
    const recent = quiet().map((m) => (m.channel === "project" ? { ...m, created_at: daysAgo(BUILD_DAYS - 1) } : m));
    expect(only(recent, "build")).toEqual([]);
  });

  it("flags a week with more cold-applying time than arbitrage time", () => {
    const apps = Array.from({ length: 12 }, () => makeApp({ applied_on: "2026-09-30" })); // 12 Ã— 20m = 4h
    const steps = nextSteps(quiet(), apps, NOW, { minutesPerApp: 20 });
    // quiet(): one 10m project + ten 10m messages = 1h 50m
    expect(steps.find((s) => s.kind === "rebalance")?.detail).toBe("About 4h 0m on cold applications this week vs 1h 50m on moves.");
    expect(nextSteps(quiet(), apps.slice(0, 5), NOW, { minutesPerApp: 20 }).some((s) => s.kind === "rebalance")).toBe(false);
  });

  it("orders the list: replies, follow-ups, referrals, then habits", () => {
    const moves = [
      makeMove({ stage: "positive", last_touch_at: daysAgo(1) }),
      makeMove({ last_touch_at: daysAgo(5) }),
      makeMove({ waiting_on: "me", stage: "replied", last_touch_at: daysAgo(1) }),
    ];
    expect(kinds(moves)).toEqual(["reply", "follow_up", "referral", "send_more", "build"]);
  });
});
