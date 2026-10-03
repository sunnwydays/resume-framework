import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_FILTERS,
  DEFAULT_ASSESSMENT_FILTERS,
  isDefault,
  matchesApplicationFilters,
  matchesApplicationSearch,
  matchesAssessmentFilters,
  matchesAssessmentSearch,
  matchesRoleTypes,
  type AppFilters,
  type AssessmentFilters,
} from "@/lib/tracker/filters";
import type { RoleType } from "@/lib/tracker/roles";
import { makeApp, makeAssessment, makeQuestion } from "../helpers/fixtures";

const NOW = new Date(2026, 9, 3, 12).getTime(); // Sat 3 Oct 2026, local
const ago = (days: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("matchesApplicationSearch", () => {
  const app = makeApp({ company: "Snowflake", role: "SWE Intern", location: "Toronto, ON", notes: "referred by Priya" });
  it.each(["snow", "SWE", "toronto", "priya", "  Snowflake  ", ""])("matches %j", (q) =>
    expect(matchesApplicationSearch(app, q)).toBe(true)
  );
  it.each(["microsoft", "vancouver"])("does not match %j", (q) => expect(matchesApplicationSearch(app, q)).toBe(false));
  it("copes with missing optional fields", () => {
    expect(matchesApplicationSearch(makeApp({ location: null, notes: null }), "zzz")).toBe(false);
  });
});

describe("matchesAssessmentSearch", () => {
  const app = makeApp({ company: "Ramp", role: "Backend Intern" });
  const a = makeAssessment({
    title: "CodeSignal GCA",
    details: "four problems",
    interviewer: "Sam Lee",
    score: "800/850",
    notes: "calm",
    prep_notes: "graphs and DP",
    reflection: "ran out of time",
  });
  const qs = [makeQuestion({ question: "Detect a cycle", answer: "Floyd's tortoise" })];
  it.each(["ramp", "backend", "codesignal", "four problems", "sam", "800", "calm", "graphs", "ran out", "cycle", "tortoise"])(
    "finds %j",
    (q) => expect(matchesAssessmentSearch(a, app, qs, q)).toBe(true)
  );
  it("returns true for an empty query and false for a miss", () => {
    expect(matchesAssessmentSearch(a, app, qs, "  ")).toBe(true);
    expect(matchesAssessmentSearch(a, app, qs, "kubernetes")).toBe(false);
  });
  it("works when the application is unknown", () => {
    expect(matchesAssessmentSearch(a, undefined, [], "codesignal")).toBe(true);
    expect(matchesAssessmentSearch(a, undefined, [], "ramp")).toBe(false);
  });
});

describe("matchesRoleTypes", () => {
  const swe = new Set<RoleType>(["swe"]);
  it("an empty selection matches everything, even a missing role", () => {
    expect(matchesRoleTypes(new Set(), "Anything")).toBe(true);
    expect(matchesRoleTypes(new Set(), undefined)).toBe(true);
  });
  it("matches by derived role type", () => {
    expect(matchesRoleTypes(swe, "Software Engineer Intern")).toBe(true);
    expect(matchesRoleTypes(swe, "Data Scientist")).toBe(false);
  });
  it("a missing role matches no specific type", () => {
    expect(matchesRoleTypes(swe, undefined)).toBe(false);
  });
});

describe("matchesApplicationFilters", () => {
  const f = (o: Partial<AppFilters> = {}): AppFilters => ({ ...DEFAULT_APP_FILTERS, ...o });
  const run = (app = makeApp(), o: Partial<AppFilters> = {}, asmts = makeAssessmentList()) =>
    matchesApplicationFilters(app, f(o), asmts, NOW);
  function makeAssessmentList(n = 0) {
    return Array.from({ length: n }, () => makeAssessment());
  }

  describe("status", () => {
    it("'active' (the default) hides rejected and withdrawn", () => {
      expect(run(makeApp({ status: "applied" }))).toBe(true);
      expect(run(makeApp({ status: "offer" }))).toBe(true);
      expect(run(makeApp({ status: "rejected" }))).toBe(false);
      expect(run(makeApp({ status: "withdrawn" }))).toBe(false);
    });
    it("'all' shows everything", () => {
      for (const status of ["applied", "oa", "rejected", "withdrawn"]) {
        expect(run(makeApp({ status }), { status: "all" })).toBe(true);
      }
    });
    it("a specific status shows only that one", () => {
      expect(run(makeApp({ status: "oa" }), { status: "oa" })).toBe(true);
      expect(run(makeApp({ status: "interview" }), { status: "oa" })).toBe(false);
      expect(run(makeApp({ status: "rejected" }), { status: "rejected" })).toBe(true);
    });
    it("'All + hide rejected' hides only rejected", () => {
      const o = { status: "all", hideRejected: true } as const;
      expect(run(makeApp({ status: "rejected" }), o)).toBe(false);
      expect(run(makeApp({ status: "withdrawn" }), o)).toBe(true);
    });
  });

  describe("appliedWithin", () => {
    it("keeps applications up to N days old, inclusive", () => {
      expect(run(makeApp({ applied_on: ago(7) }), { appliedWithin: 7 })).toBe(true);
      expect(run(makeApp({ applied_on: ago(8) }), { appliedWithin: 7 })).toBe(false);
      expect(run(makeApp({ applied_on: ago(0) }), { appliedWithin: 7 })).toBe(true);
    });
    it("0 means any time", () => {
      expect(run(makeApp({ applied_on: "2020-01-01" }), { appliedWithin: 0 })).toBe(true);
    });
  });

  describe("hasSteps", () => {
    it("needs an assessment or a stage past 'applied'", () => {
      const o = { hasSteps: true };
      expect(run(makeApp({ status: "applied" }), o)).toBe(false);
      expect(run(makeApp({ status: "applied" }), o, makeAssessmentList(1))).toBe(true);
      for (const status of ["oa", "video_interview", "interview", "offer"]) {
        expect(run(makeApp({ status }), o)).toBe(true);
      }
    });
  });

  describe("noReply", () => {
    const o = { noReply: true };
    it("matches applied, assessment-free applications 30+ days old", () => {
      expect(run(makeApp({ applied_on: ago(30) }), o)).toBe(true);
      expect(run(makeApp({ applied_on: ago(29) }), o)).toBe(false);
    });
    it("not once there was any reply", () => {
      expect(run(makeApp({ applied_on: ago(60), status: "oa" }), o)).toBe(false);
      expect(run(makeApp({ applied_on: ago(60) }), o, makeAssessmentList(1))).toBe(false);
    });
  });

  it("combines filters with AND", () => {
    const app = makeApp({ status: "oa", applied_on: ago(40) });
    expect(run(app, { appliedWithin: 30, hasSteps: true })).toBe(false);
    expect(run(app, { appliedWithin: 90, hasSteps: true })).toBe(true);
  });
});

describe("matchesAssessmentFilters", () => {
  const f = (o: Partial<AssessmentFilters> = {}): AssessmentFilters => ({ ...DEFAULT_ASSESSMENT_FILTERS, ...o });
  const past = new Date(NOW - 86_400_000).toISOString();
  const future = new Date(NOW + 86_400_000).toISOString();
  const run = (a = makeAssessment(), o: Partial<AssessmentFilters> = {}, app = makeApp()) =>
    matchesAssessmentFilters(a, app, f(o), NOW);

  it("defaults to pending only", () => {
    expect(run(makeAssessment({ status: "pending" }))).toBe(true);
    expect(run(makeAssessment({ status: "completed" }))).toBe(false);
    expect(run(makeAssessment({ status: "completed" }), { status: "completed" })).toBe(true);
    expect(run(makeAssessment({ status: "completed" }), { status: "all" })).toBe(true);
  });
  it("kind", () => {
    expect(run(makeAssessment({ kind: "oa" }), { kind: "oa" })).toBe(true);
    expect(run(makeAssessment({ kind: "interview" }), { kind: "oa" })).toBe(false);
  });
  it("outcome, including 'not set'", () => {
    expect(run(makeAssessment({ outcome: null }), { outcome: "unset" })).toBe(true);
    expect(run(makeAssessment({ outcome: "passed" }), { outcome: "unset" })).toBe(false);
    expect(run(makeAssessment({ outcome: "passed" }), { outcome: "passed" })).toBe(true);
    expect(run(makeAssessment({ outcome: "waiting" }), { outcome: "passed" })).toBe(false);
    expect(run(makeAssessment({ outcome: null }), { outcome: "any" })).toBe(true);
  });
  it("hideRejected only looks at rejected applications", () => {
    const rejected = makeApp({ status: "rejected" });
    expect(run(makeAssessment(), { hideRejected: true }, rejected)).toBe(false);
    expect(run(makeAssessment(), { hideRejected: false }, rejected)).toBe(true);
    expect(run(makeAssessment(), { hideRejected: true }, makeApp({ status: "withdrawn" }))).toBe(true);
    expect(matchesAssessmentFilters(makeAssessment(), undefined, f({ hideRejected: true }), NOW)).toBe(true);
  });
  it("importantOnly", () => {
    expect(run(makeAssessment({ important: false }), { importantOnly: true })).toBe(false);
    expect(run(makeAssessment({ important: true }), { importantOnly: true })).toBe(true);
  });
  it("overdueOnly means pending and past due", () => {
    const o = { overdueOnly: true };
    expect(run(makeAssessment({ due_at: past }), o)).toBe(true);
    expect(run(makeAssessment({ due_at: future }), o)).toBe(false);
    expect(run(makeAssessment({ due_at: null }), o)).toBe(false);
    expect(run(makeAssessment({ due_at: past, status: "completed" }), { ...o, status: "all" })).toBe(false);
  });
});

describe("isDefault", () => {
  it("is true for the defaults and false after any change", () => {
    expect(isDefault(DEFAULT_APP_FILTERS, DEFAULT_APP_FILTERS)).toBe(true);
    expect(isDefault({ ...DEFAULT_APP_FILTERS, noReply: true }, DEFAULT_APP_FILTERS)).toBe(false);
    expect(isDefault({ ...DEFAULT_ASSESSMENT_FILTERS }, DEFAULT_ASSESSMENT_FILTERS)).toBe(true);
    expect(isDefault({ ...DEFAULT_ASSESSMENT_FILTERS, kind: "oa" }, DEFAULT_ASSESSMENT_FILTERS)).toBe(false);
  });
});
