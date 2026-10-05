import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  NO_REPLY_DAYS,
  addDays,
  applicationStats,
  assessmentStats,
  dayOf,
  daysBetween,
  furthestStage,
  groupBy,
  heardBack,
  isGhosted,
  pct,
  plural,
  weekStart,
  weekdayIndex,
  type Fact,
} from "@/lib/tracker/stats";
import type { Application, Assessment, Question, StatusChange } from "@/lib/tracker/format";
import { local, makeApp, makeAssessment, makeChange, makeQuestion } from "../helpers/fixtures";

const NOW = local(2026, 10, 3, 12); // Saturday; this week started Monday 28 Sep
const now = new Date(NOW).getTime();

describe("date helpers", () => {
  it("dayOf: a bare date stays, a timestamp becomes its local day", () => {
    expect(dayOf("2026-09-25")).toBe("2026-09-25");
    expect(dayOf(local(2026, 9, 25, 23, 30))).toBe("2026-09-25");
    expect(dayOf(local(2026, 9, 25, 0, 30))).toBe("2026-09-25");
  });

  describe("daysBetween counts calendar days, whatever the clocks did", () => {
    it.each([
      ["2026-10-03", "2026-10-03", 0],
      ["2026-10-03", "2026-10-05", 2],
      ["2026-10-05", "2026-10-03", -2],
      ["2026-12-31", "2027-01-01", 1],
      ["2028-02-28", "2028-03-01", 2], // leap year
      ["2026-10-31", "2026-11-02", 2], // Toronto clocks go back on 1 Nov
      ["2026-03-07", "2026-03-09", 2], // ...and forward on 8 Mar
      ["2026-09-26", "2026-09-28", 2], // Auckland clocks go forward on 27 Sep
      ["2026-04-04", "2026-04-06", 2], // ...and back on 5 Apr
    ])("%s -> %s = %i", (from, to, n) => expect(daysBetween(from, to)).toBe(n));
  });

  describe("addDays", () => {
    it.each([
      ["2026-02-27", 2, "2026-03-01"],
      ["2026-12-31", 1, "2027-01-01"],
      ["2026-03-01", -1, "2026-02-28"],
      ["2028-02-28", 1, "2028-02-29"],
      ["2026-11-01", 1, "2026-11-02"],
      ["2026-03-08", 1, "2026-03-09"],
      ["2026-09-27", 1, "2026-09-28"],
      ["2026-10-03", 0, "2026-10-03"],
      ["2026-10-03", -30, "2026-09-03"],
    ])("%s %+i = %s", (day, n, expected) => expect(addDays(day, n)).toBe(expected));

    it("is the inverse of daysBetween", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 20_000 }),
          fc.integer({ min: -2000, max: 2000 }),
          (offset, n) => {
            const start = addDays("2000-01-01", offset);
            expect(daysBetween(start, addDays(start, n))).toBe(n);
          }
        )
      );
    });
  });

  it("weekdayIndex: Monday is 0, Sunday is 6", () => {
    expect(weekdayIndex("2026-10-05")).toBe(0);
    expect(weekdayIndex("2026-10-03")).toBe(5);
    expect(weekdayIndex("2026-10-04")).toBe(6);
  });

  it("weekStart is the Monday on or before", () => {
    expect(weekStart("2026-10-03")).toBe("2026-09-28");
    expect(weekStart("2026-09-28")).toBe("2026-09-28");
    expect(weekStart("2026-10-04")).toBe("2026-09-28");
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
  });

  it("weekStart is always a Monday within six days", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20_000 }), (offset) => {
        const day = addDays("2000-01-01", offset);
        const start = weekStart(day);
        expect(weekdayIndex(start)).toBe(0);
        expect(daysBetween(start, day)).toBeGreaterThanOrEqual(0);
        expect(daysBetween(start, day)).toBeLessThan(7);
      })
    );
  });

  it("pct and plural", () => {
    expect(pct(1, 3)).toBe("33%");
    expect(pct(2, 3)).toBe("67%");
    expect(pct(1, 1)).toBe("100%");
    expect(pct(0, 0)).toBe("—");
    expect(plural(1, "day")).toBe("1 day");
    expect(plural(0, "day")).toBe("0 days");
    expect(plural(2, "day")).toBe("2 days");
  });

  it("groupBy keeps order within groups", () => {
    const g = groupBy([1, 2, 3, 4, 5], (n) => (n % 2 ? "odd" : "even"));
    expect(g.get("odd")).toEqual([1, 3, 5]);
    expect(g.get("even")).toEqual([2, 4]);
  });
});

describe("pipeline stage", () => {
  const app = (status: string) => makeApp({ id: "a", status });

  it("furthestStage looks at status, history and assessment kinds", () => {
    expect(furthestStage(app("offer"), [], [])).toBe("offer");
    expect(furthestStage(app("applied"), [], [])).toBe("applied");
    expect(furthestStage(app("rejected"), [], [makeChange({ status: "oa" })])).toBe("oa");
    expect(furthestStage(app("rejected"), [], [makeChange({ status: "interview" }), makeChange({ status: "rejected" })])).toBe("interview");
    expect(furthestStage(app("applied"), [makeAssessment({ kind: "interview" })], [])).toBe("interview");
    expect(furthestStage(app("oa"), [makeAssessment({ kind: "video_interview" })], [])).toBe("video_interview");
  });

  it("a rejection or withdrawal on its own is no progress", () => {
    expect(furthestStage(app("rejected"), [], [])).toBe("applied");
    expect(furthestStage(app("withdrawn"), [], [])).toBe("applied");
  });

  it("heardBack counts any reply, a rejection included", () => {
    expect(heardBack(app("applied"), [], [])).toBe(false);
    expect(heardBack(app("withdrawn"), [], [])).toBe(false);
    expect(heardBack(app("oa"), [], [])).toBe(true);
    expect(heardBack(app("rejected"), [], [])).toBe(true);
    expect(heardBack(app("applied"), [makeAssessment()], [])).toBe(true);
    expect(heardBack(app("applied"), [], [makeChange({ status: "rejected" })])).toBe(true);
    expect(heardBack(app("applied"), [], [makeChange({ status: "withdrawn" })])).toBe(false);
  });

  describe("isGhosted", () => {
    const today = "2026-10-03";
    const old = (days: number, status = "applied") => makeApp({ status, applied_on: addDays(today, -days) });
    it(`needs ${NO_REPLY_DAYS}+ days of silence`, () => {
      expect(isGhosted(old(NO_REPLY_DAYS), [], today)).toBe(true);
      expect(isGhosted(old(NO_REPLY_DAYS - 1), [], today)).toBe(false);
    });
    it("not once anything happened", () => {
      expect(isGhosted(old(60, "oa"), [], today)).toBe(false);
      expect(isGhosted(old(60, "rejected"), [], today)).toBe(false);
      expect(isGhosted(old(60), [makeAssessment()], today)).toBe(false);
    });
  });
});

describe("applicationStats", () => {
  // Hand-checked: today is Sat 3 Oct 2026, so this week starts Mon 28 Sep.
  const apps: Application[] = [
    makeApp({ id: "a1", company: "Acme", role: "SWE Intern", applied_on: "2026-10-02" }),
    makeApp({ id: "a2", company: "Beta", role: "Data Scientist Intern", applied_on: "2026-09-29", status: "oa", status_changed_at: local(2026, 9, 30) }),
    makeApp({ id: "a3", company: "acme", role: "SWE Robo", applied_on: "2026-09-22", status: "rejected", status_changed_at: local(2026, 9, 24) }),
    makeApp({ id: "a4", company: "Gamma", role: "SWE Intern", applied_on: "2026-08-20" }),
    makeApp({ id: "a5", company: "Delta", role: "Backend Intern", applied_on: "2026-08-25", status: "interview", status_changed_at: local(2026, 9, 10) }),
  ];
  const changes: StatusChange[] = [
    makeChange({ application_id: "a2", status: "oa", changed_at: local(2026, 9, 30) }),
    makeChange({ application_id: "a3", status: "oa", changed_at: local(2026, 9, 23) }),
    makeChange({ application_id: "a3", status: "rejected", changed_at: local(2026, 9, 24) }),
    makeChange({ application_id: "a5", status: "oa", changed_at: local(2026, 9, 1) }),
    makeChange({ application_id: "a5", status: "interview", changed_at: local(2026, 9, 10) }),
  ];
  const assessments: Assessment[] = [makeAssessment({ application_id: "a5", kind: "oa" })];
  const time = { "2026-10-01": 7200, "2026-10-02": 1800 };
  const stats = applicationStats(apps, groupBy(assessments, (a) => a.application_id), groupBy(changes, (c) => c.application_id), time, now);
  const fact = (label: string | RegExp) => stats.facts.find((f) => (typeof label === "string" ? f.label === label : label.test(f.label)));

  it("counts", () => {
    expect(stats.total).toBe(5);
    expect(stats.thisWeek).toBe(2);
    expect(stats.lastWeek).toBe(1);
    expect(stats.heardBack).toBe(3);
    expect(stats.progressed).toBe(3);
    expect(stats.interviewed).toBe(1);
    expect(stats.offers).toBe(0);
  });

  it("funnel counts everyone who got at least that far", () => {
    expect(stats.funnel.map((f) => [f.stage, f.count])).toEqual([
      ["applied", 5],
      ["oa", 3],
      ["video_interview", 1],
      ["interview", 1],
      ["offer", 0],
    ]);
  });

  it("splits by role type, in the type list's order", () => {
    expect(stats.byType.map((t) => [t.type, t.count, t.heardBack, t.progressed])).toEqual([
      ["robotics", 1, 1, 1],
      ["data", 1, 1, 1],
      ["backend", 1, 1, 1],
      ["swe", 2, 0, 0],
    ]);
  });

  it("applications per weekday (Monday first)", () => {
    expect(stats.weekday).toEqual([0, 3, 0, 1, 1, 0, 0]);
  });

  it("weekly volume is zero-filled from the first week to this one", () => {
    expect(stats.weekly).toEqual([
      { start: "2026-08-17", count: 1 },
      { start: "2026-08-24", count: 1 },
      { start: "2026-08-31", count: 0 },
      { start: "2026-09-07", count: 0 },
      { start: "2026-09-14", count: 0 },
      { start: "2026-09-21", count: 1 },
      { start: "2026-09-28", count: 2 },
    ]);
  });

  it("today not being logged yet does not break the streak", () => {
    expect(stats.currentStreak).toBe(1); // 2 Oct, then a gap
  });

  it("facts", () => {
    expect(fact("Longest streak")).toBeUndefined(); // no run longer than a day
    expect(fact("Busiest day")).toBeUndefined();
    expect(fact("Longest break")).toEqual({ label: "Longest break", value: "27 days", detail: "ended 22/09/26" });
    expect(fact("Favorite day to apply")).toEqual({ label: "Favorite day to apply", value: "Tuesday", detail: "60% of applications" });
    expect(fact(/^Ghosted/)).toEqual({
      label: "Ghosted (30d+, no reply)",
      value: "50%",
      detail: "longest wait: Gamma, 44 days",
    });
    expect(fact("Typical wait for a reply")).toEqual({ label: "Typical wait for a reply", value: "1 day", detail: undefined });
    expect(fact("Speedrun rejection")).toEqual({ label: "Speedrun rejection", value: "2 days", detail: "acme · SWE Robo" });
    expect(fact("Typical time to rejection")).toEqual({ label: "Typical time to rejection", value: "2 days", detail: undefined });
    expect(fact("Rejections usually land on")).toBeUndefined(); // needs 3 dated rejections
    expect(fact("Companies")).toEqual({ label: "Companies", value: "4", detail: "most applied to: Acme (2)" }); // Acme / acme are one
    expect(fact("Your typing habit")).toBeUndefined(); // nothing typed 3 times
    expect(fact("Time invested")).toEqual({
      label: "Time invested",
      value: "2.5 h",
      detail: "≈ 30 min per application (since timing began)",
    });
  });

  describe("streaks", () => {
    const onDays = (...days: string[]) =>
      applicationStats(days.map((d, i) => makeApp({ id: `s${i}`, applied_on: d })), new Map(), new Map(), {}, now);
    it("counts consecutive days ending today", () => {
      const s = onDays("2026-10-03", "2026-10-02", "2026-10-01", "2026-09-28");
      expect(s.currentStreak).toBe(3);
      expect(s.facts.find((f) => f.label === "Longest streak")).toEqual({
        label: "Longest streak",
        value: "3 days",
        detail: "current: 3 days",
      });
    });
    it("a streak that ended yesterday is still going", () => {
      expect(onDays("2026-10-02", "2026-10-01").currentStreak).toBe(2);
    });
    it("two days without an application ends it", () => {
      const s = onDays("2026-10-01", "2026-09-30");
      expect(s.currentStreak).toBe(0);
      expect(s.facts.find((f) => f.label === "Longest streak")?.detail).toBe("no streak going right now");
    });
  });

  it("names the busiest day when it has more than one application", () => {
    const s = applicationStats(
      [makeApp({ applied_on: "2026-10-02" }), makeApp({ applied_on: "2026-10-02" }), makeApp({ applied_on: "2026-09-01" })],
      new Map(),
      new Map(),
      {},
      now
    );
    expect(s.facts.find((f) => f.label === "Busiest day")).toEqual({
      label: "Busiest day",
      value: "2 applications",
      detail: "Friday 02/10/26",
    });
  });

  it("caps the weekly chart at 26 weeks", () => {
    const s = applicationStats([makeApp({ applied_on: "2025-01-01" })], new Map(), new Map(), {}, now);
    expect(s.weekly).toHaveLength(26);
    expect(s.weekly[0].start).toBe(addDays("2026-09-28", -7 * 25));
    expect(s.weekly[25].start).toBe("2026-09-28");
  });

  it("notices the role you type most, using its commonest spelling", () => {
    const rows = ["SWE", "swe", "SWE", "Data"].map((role, i) => makeApp({ id: `r${i}`, role, applied_on: `2026-09-0${i + 1}` }));
    const s = applicationStats(rows, new Map(), new Map(), {}, now);
    expect(s.facts.find((f) => f.label === "Your typing habit")).toEqual({
      label: "Your typing habit",
      value: "“SWE”",
      detail: "typed as the role 3 times (75%)",
    });
  });

  it("finds the usual rejection weekday from three dated rejections", () => {
    const rows = [24, 17, 10].map((day, i) =>
      makeApp({ id: `x${i}`, status: "rejected", applied_on: "2026-08-01", status_changed_at: local(2026, 9, day) })
    ); // all Thursdays
    const s = applicationStats(rows, new Map(), new Map(), {}, now);
    expect(s.facts.find((f) => f.label === "Rejections usually land on")).toEqual({
      label: "Rejections usually land on",
      value: "Thursday",
      detail: "100% of dated rejections",
    });
  });

  it("says how many rows had dates when only some did", () => {
    const rows = [
      makeApp({ id: "d1", status: "rejected", applied_on: "2026-09-20", status_changed_at: local(2026, 9, 22) }),
      makeApp({ id: "d2", status: "rejected", applied_on: "2026-09-20" }),
    ];
    const s = applicationStats(rows, new Map(), new Map(), {}, now);
    expect(s.facts.find((f) => f.label === "Typical time to rejection")?.detail).toBe("from 1 of 2 with dates");
  });

  it("an undated rejection adds no rejection facts", () => {
    const s = applicationStats([makeApp({ status: "rejected", status_changed_at: null })], new Map(), new Map(), {}, now);
    expect(s.facts.find((f) => /rejection/i.test(f.label))).toBeUndefined();
  });

  it("a rejection never counts as negative days even with bad dates", () => {
    const s = applicationStats(
      [makeApp({ status: "rejected", applied_on: "2026-09-30", status_changed_at: local(2026, 9, 20) })],
      new Map(),
      new Map(),
      {},
      now
    );
    expect(s.facts.find((f) => f.label === "Speedrun rejection")?.value).toBe("same day");
  });

  it("time under a minute is not worth a fact; under an hour is shown in minutes", () => {
    const one = (seconds: number) =>
      applicationStats([makeApp()], new Map(), new Map(), { "2026-10-01": seconds }, now).facts.find((f) => f.label === "Time invested");
    expect(one(59)).toBeUndefined();
    expect(one(1800)).toMatchObject({ value: "30 min" });
    expect(one(3600)).toMatchObject({ value: "1 h" });
  });

  it("an empty tracker gives zeros, not errors", () => {
    const s = applicationStats([], new Map(), new Map(), {}, now);
    expect(s).toMatchObject({ total: 0, thisWeek: 0, lastWeek: 0, heardBack: 0, progressed: 0, interviewed: 0, offers: 0, currentStreak: 0 });
    expect(s.weekly).toEqual([]);
    expect(s.byType).toEqual([]);
    expect(s.facts).toEqual([]);
    expect(s.funnel.map((f) => f.count)).toEqual([0, 0, 0, 0, 0]);
    expect(s.weekday).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("the funnel never grows going down, whatever the data", () => {
    const status = fc.constantFrom("applied", "oa", "video_interview", "interview", "offer", "rejected", "withdrawn");
    fc.assert(
      fc.property(fc.array(fc.record({ status, day: fc.integer({ min: 0, max: 120 }) }), { maxLength: 30 }), (rows) => {
        const list = rows.map((r, i) => makeApp({ id: `p${i}`, status: r.status, applied_on: addDays("2026-06-01", r.day) }));
        const s = applicationStats(list, new Map(), new Map(), {}, now);
        const counts = s.funnel.map((f) => f.count);
        expect(counts[0]).toBe(list.length);
        for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
        expect(s.weekday.reduce((a, b) => a + b, 0)).toBe(list.length);
      })
    );
  });
});

describe("assessmentStats", () => {
  const apps = [
    makeApp({ id: "app-1", company: "Acme", role: "SWE Intern", applied_on: "2026-09-10", status: "interview" }),
    makeApp({ id: "app-2", company: "Beta", role: "Data Scientist Intern", applied_on: "2026-09-12", status: "oa" }),
  ];
  const s1 = makeAssessment({
    id: "s1", application_id: "app-1", kind: "oa", title: "CodeSignal GCA", status: "completed",
    due_at: local(2026, 9, 20, 12), completed_at: local(2026, 9, 19, 12), duration_min: 60, difficulty: 4, outcome: "passed",
  });
  const s2 = makeAssessment({ id: "s2", application_id: "app-1", kind: "oa", title: "Second OA", due_at: local(2026, 10, 5, 12) });
  const s3 = makeAssessment({ id: "s3", application_id: "app-2", kind: "interview", title: "Onsite", due_at: local(2026, 10, 1, 12) });
  const s4 = makeAssessment({
    id: "s4", application_id: "app-2", kind: "oa", title: "HackerRank", status: "completed",
    due_at: local(2026, 9, 25, 12), completed_at: local(2026, 9, 25, 6), duration_min: 30, difficulty: 2, outcome: "failed",
  });
  const s5 = makeAssessment({ id: "s5", application_id: "app-1", kind: "video_interview", title: "HireVue", status: "completed" });
  const all = [s1, s2, s3, s4, s5];
  const questions = [
    makeQuestion({ assessment_id: "s1" }), makeQuestion({ assessment_id: "s1" }), makeQuestion({ assessment_id: "s1" }),
    makeQuestion({ assessment_id: "s4" }),
  ];
  const changes = [makeChange({ application_id: "app-1", status: "oa", changed_at: local(2026, 9, 15) })];

  const run = (list: Assessment[], appList = apps, qs: Question[] = questions, ch: StatusChange[] = changes) =>
    assessmentStats(
      list,
      new Map(appList.map((a) => [a.id, a])),
      groupBy(list, (a) => a.application_id),
      groupBy(ch, (c) => c.application_id),
      groupBy(qs, (q) => q.assessment_id),
      now
    );
  const stats = run(all);
  const fact = (label: string): Fact | undefined => stats.facts.find((f) => f.label === label);

  it("bombed counts as a fail; expired is neither a result nor overdue", () => {
    const bombed = makeAssessment({ id: "b", application_id: "app-1", status: "completed", outcome: "bombed" });
    const expired = makeAssessment({ id: "e", application_id: "app-1", due_at: local(2026, 9, 1, 12), outcome: "expired" });
    expect(run([...all, bombed, expired])).toMatchObject({ total: 7, completed: 4, passed: 1, failed: 2, overdue: 1 });
  });

  it("counts", () => {
    expect(stats).toMatchObject({ total: 5, completed: 3, passed: 1, failed: 1, dueThisWeek: 1, overdue: 1 });
  });

  it("by kind, in the kind list's order", () => {
    expect(stats.byKind.map((k) => [k.kind, k.count, k.passed, k.failed])).toEqual([
      ["oa", 3, 1, 1],
      ["video_interview", 1, 0, 0],
      ["interview", 1, 0, 0],
    ]);
  });

  it("by difficulty, always one to five", () => {
    expect(stats.byDifficulty).toEqual([
      { difficulty: 1, count: 0, passed: 0, failed: 0 },
      { difficulty: 2, count: 1, passed: 0, failed: 1 },
      { difficulty: 3, count: 0, passed: 0, failed: 0 },
      { difficulty: 4, count: 1, passed: 1, failed: 0 },
      { difficulty: 5, count: 0, passed: 0, failed: 0 },
    ]);
  });

  it("by role type", () => {
    expect(stats.byType.map((t) => [t.type, t.count, t.passed, t.failed])).toEqual([
      ["data", 2, 0, 1],
      ["swe", 3, 1, 0],
    ]);
  });

  it("facts, in order", () => {
    expect(stats.facts.map((f) => f.label)).toEqual([
      "Procrastination index",
      "OA invite → submitted",
      "Applied → OA invite",
      "OA → interview",
      "Time in assessments",
      "Average difficulty",
      "Hardest so far",
      "Most questions logged",
    ]);
  });

  it("procrastination: median hours before the deadline, and how many were last-minute", () => {
    expect(fact("Procrastination index")).toEqual({
      label: "Procrastination index",
      value: "15h before due",
      detail: "50% done in the final 24h",
    });
  });

  it("OA invite to submission, saying how many were dated", () => {
    expect(fact("OA invite → submitted")).toEqual({ label: "OA invite → submitted", value: "4 days", detail: "from 1 of 2 with dates" });
  });

  it("applied to OA invite", () => {
    expect(fact("Applied → OA invite")).toEqual({ label: "Applied → OA invite", value: "5 days", detail: "fastest: Acme (5 days)" });
  });

  it("OA to interview", () => {
    expect(fact("OA → interview")).toEqual({
      label: "OA → interview",
      value: "100%",
      detail: "2 of 2 applications with an OA got an interview",
    });
  });

  it("time, difficulty and question facts", () => {
    expect(fact("Time in assessments")).toEqual({ label: "Time in assessments", value: "1.5 h", detail: "from the listed durations" });
    expect(fact("Average difficulty")).toEqual({ label: "Average difficulty", value: "3.0 / 5", detail: "over 2 rated ones" });
    expect(fact("Hardest so far")).toEqual({ label: "Hardest so far", value: "4 / 5", detail: "Acme · CodeSignal GCA" });
    expect(fact("Most questions logged")).toEqual({ label: "Most questions logged", value: "3", detail: "Acme · CodeSignal GCA" });
  });

  describe("procrastination wording", () => {
    const margin = (dueHoursAfterCompletion: number) => {
      const done = local(2026, 9, 1, 12);
      const due = new Date(new Date(done).getTime() + dueHoursAfterCompletion * 3_600_000).toISOString();
      const a = makeAssessment({ id: "m", application_id: "app-1", kind: "oa", status: "completed", due_at: due, completed_at: done });
      return run([a]).facts.find((f) => f.label === "Procrastination index");
    };
    it("days early for a long margin", () => {
      expect(margin(96)?.value).toBe("4 days early");
    });
    it("hours late, with the count", () => {
      expect(margin(-5)).toMatchObject({ value: "5h late", detail: "0% done in the final 24h · 1 late" });
    });
    it("exactly 24h before is not the final day", () => {
      expect(margin(24)?.detail).toBe("0% done in the final 24h");
    });
  });

  it("only OAs whose application advanced count for OA → interview", () => {
    const lowApps = [makeApp({ id: "x", status: "oa" }), makeApp({ id: "y", status: "oa" })];
    const list = [
      makeAssessment({ id: "ox", application_id: "x", kind: "oa" }),
      makeAssessment({ id: "oy", application_id: "y", kind: "oa" }),
    ];
    expect(run(list, lowApps).facts.find((f) => f.label === "OA → interview")).toMatchObject({ value: "0%" });
  });

  it("an assessment whose application is missing is still counted, named by its title", () => {
    const orphan = makeAssessment({ id: "o", application_id: "gone", title: "Lost OA", difficulty: 5 });
    const r = run([orphan]);
    expect(r.total).toBe(1);
    expect(r.byType).toEqual([]);
    expect(r.facts.find((f) => f.label === "Hardest so far")?.detail).toBe("Lost OA · Lost OA");
  });

  it("an empty list gives zeros and no facts", () => {
    const r = run([], apps, [], []);
    expect(r).toMatchObject({ total: 0, completed: 0, passed: 0, failed: 0, dueThisWeek: 0, overdue: 0 });
    expect(r.byKind).toEqual([]);
    expect(r.byType).toEqual([]);
    expect(r.byDifficulty).toHaveLength(5);
    expect(r.facts).toEqual([]);
  });

  it("a deadline exactly a week away is not 'due this week'", () => {
    const a = makeAssessment({ due_at: new Date(now + 7 * 86_400_000).toISOString() });
    expect(run([a]).dueThisWeek).toBe(0);
    expect(run([makeAssessment({ due_at: new Date(now + 7 * 86_400_000 - 1).toISOString() })]).dueThisWeek).toBe(1);
  });
});
