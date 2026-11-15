import { describe, expect, it } from "vitest";
import { exchangeRates, funnel, templateStats, thisWeek, type AppContext } from "@/lib/tracker/arbitrage";
import { buildDemoData } from "@/lib/tracker/demo/data";
import { buildReview } from "@/lib/tracker/email/review";
import { DEFAULT_APP_FILTERS, matchesApplicationFilters } from "@/lib/tracker/filters";
import {
  ASSESSMENT_KINDS,
  EMAIL_KINDS,
  EMAIL_STATES,
  MOVE_CHANNELS,
  MOVE_STAGES,
  MUTE_KINDS,
  OUTCOMES,
  POSTING_STATES,
  QUESTION_SOURCES,
  STATUSES,
  WAITING_ON,
} from "@/lib/tracker/format";
import { nextSteps } from "@/lib/tracker/nextSteps";
import { DEFAULT_POSTING_FILTERS, matchesPostingFilters } from "@/lib/tracker/postings/filters";
import { buildPostingViews } from "@/lib/tracker/postings/view";
import { roleType } from "@/lib/tracker/roles";
import { sectionsOf } from "@/lib/tracker/sections";
import { applicationStats, assessmentStats, groupBy } from "@/lib/tracker/stats";
import { BUILT_IN_TEMPLATES } from "@/lib/tracker/templates";
import { buildToday } from "@/lib/tracker/today";

const NOW = Date.now();
const data = buildDemoData(NOW);
const { applications, assessments, questions, statusChanges, gmail, postings, moves, templates } = data;

const uniqueIds = (rows: { id: string }[]) => new Set(rows.map((r) => r.id)).size === rows.length;
// Every value is in the allowed set (null values are skipped: they're optional columns).
const allIn = (allowed: readonly string[], values: (string | null)[]) =>
  expect(values.filter((v) => v !== null && !allowed.includes(v))).toEqual([]);

describe("demo fixtures: shape", () => {
  it("has the volume the demo promises, with unique ids", () => {
    expect(applications.length).toBeGreaterThanOrEqual(25);
    expect(postings.length).toBeGreaterThanOrEqual(15);
    expect(moves.length).toBeGreaterThanOrEqual(12);
    expect(templates.length).toBeGreaterThanOrEqual(1);
    for (const rows of [applications, assessments, questions, statusChanges, gmail.emails, postings, moves]) {
      expect(uniqueIds(rows)).toBe(true);
    }
  });

  it("only uses values the database would accept", () => {
    allIn(STATUSES, applications.map((a) => a.status));
    allIn(STATUSES, statusChanges.map((c) => c.status));
    allIn(["manual", "import", "email"], statusChanges.map((c) => c.origin));
    allIn(Object.keys(ASSESSMENT_KINDS), assessments.map((a) => a.kind));
    allIn(["pending", "completed"], assessments.map((a) => a.status));
    allIn(Object.keys(OUTCOMES), assessments.map((a) => a.outcome));
    allIn(Object.keys(QUESTION_SOURCES), questions.map((q) => q.source));
    allIn(Object.keys(MOVE_CHANNELS), moves.map((m) => m.channel));
    allIn(Object.keys(MOVE_CHANNELS), templates.map((t) => t.channel));
    allIn(MOVE_STAGES, moves.map((m) => m.stage));
    allIn(Object.keys(WAITING_ON), moves.map((m) => m.waiting_on));
    allIn(Object.keys(EMAIL_KINDS), gmail.emails.map((e) => e.kind));
    allIn(EMAIL_STATES, gmail.emails.map((e) => e.state));
    allIn(Object.keys(MUTE_KINDS), gmail.mutes.map((m) => m.kind));
    allIn(POSTING_STATES, postings.map((p) => p.state));
  });

  it("links rows that point at each other", () => {
    const apps = new Set(applications.map((a) => a.id));
    const asmts = new Set(assessments.map((a) => a.id));
    expect(assessments.filter((a) => !apps.has(a.application_id))).toEqual([]);
    expect(statusChanges.filter((c) => !apps.has(c.application_id))).toEqual([]);
    expect(questions.filter((q) => !asmts.has(q.assessment_id))).toEqual([]);
    expect(moves.filter((m) => m.application_id && !apps.has(m.application_id))).toEqual([]);
    expect(postings.filter((p) => p.application_id && !apps.has(p.application_id))).toEqual([]);
    const templateKeys = new Set([...BUILT_IN_TEMPLATES.map((t) => t.key), ...templates.map((t) => t.id)]);
    expect(moves.filter((m) => m.template_key && !templateKeys.has(m.template_key))).toEqual([]);
  });

  it("keeps dates relative to now, so it never goes stale", () => {
    const later = buildDemoData(NOW + 30 * 86_400_000);
    const due = (d: typeof data) => d.assessments.find((a) => a.id === "demo-asmt-01")!.due_at!;
    expect(new Date(due(later)).getTime() - new Date(due(data)).getTime()).toBeGreaterThan(29 * 86_400_000);
  });

  it("uses only made-up addresses", () => {
    const addresses = [...gmail.emails.map((e) => e.from_address), ...applications.map((a) => a.url ?? "")];
    expect(addresses.filter((a) => !/\.example(\/|$)/.test(a))).toEqual([]);
  });
});

describe("demo fixtures: variety", () => {
  it("covers every status, assessment kind and outcome, and several role types", () => {
    expect(new Set(applications.map((a) => a.status))).toEqual(new Set(STATUSES));
    expect(new Set(assessments.map((a) => a.kind))).toEqual(new Set(Object.keys(ASSESSMENT_KINDS)));
    expect(new Set(assessments.map((a) => a.outcome).filter(Boolean))).toEqual(new Set(["bombed", "expired"]));
    expect(new Set(applications.map((a) => roleType(a.role))).size).toBeGreaterThanOrEqual(7);
  });

  it("has overdue, upcoming and multi-section assessments, and answered questions", () => {
    const open = assessments.filter((a) => a.status === "pending" && a.outcome !== "expired" && a.due_at);
    expect(open.some((a) => new Date(a.due_at!).getTime() < NOW)).toBe(true);
    expect(open.some((a) => new Date(a.due_at!).getTime() > NOW)).toBe(true);
    expect(assessments.some((a) => sectionsOf(a.sections).some((s) => s.parts.length > 0))).toBe(true);
    expect(questions.some((q) => q.answer)).toBe(true);
  });

  it("has pending Gmail cards that group into jobs, and a dismissed one", () => {
    const review = buildReview(gmail.emails, gmail.mutes, applications, assessments, statusChanges);
    expect(review.groups.length).toBeGreaterThanOrEqual(3);
    expect(gmail.emails.some((e) => e.state === "dismissed")).toBe(true);
  });

  it("covers US, Canada and unclear postings, plus eligibility and sponsorship flags", () => {
    const views = buildPostingViews(postings, applications);
    expect(new Set(views.map((v) => v.region.region))).toEqual(new Set(["us", "canada", "unknown"]));
    expect(views.some((v) => v.eligibility.level === "no")).toBe(true);
    expect(views.some((v) => v.noSponsorship)).toBe(true);
    expect(new Set(views.map((v) => v.level.level)).size).toBeGreaterThanOrEqual(3);
    expect(buildPostingViews(postings, applications, data.postingMutes).some((v) => v.mutedCompany)).toBe(true);
    expect(views.filter((v) => v.relist).map((v) => v.relist!.of.id)).toEqual(["demo-post-14"]);
    // The default filters leave something to look at.
    expect(views.filter((v) => matchesPostingFilters(v, DEFAULT_POSTING_FILTERS)).length).toBeGreaterThan(3);
  });

  it("has moves in every channel and a spread of stages", () => {
    expect(new Set(moves.map((m) => m.channel))).toEqual(new Set(Object.keys(MOVE_CHANNELS)));
    expect(new Set(moves.map((m) => m.stage)).size).toBeGreaterThanOrEqual(5);
  });
});

describe("demo fixtures: pure builders accept them", () => {
  const appsById = new Map(applications.map((a) => [a.id, a]));
  const assessmentsByApp = groupBy(assessments, (a) => a.application_id);
  const changesByApp = groupBy(statusChanges, (c) => c.application_id);
  const questionsByAssessment = groupBy(questions, (q) => q.assessment_id);
  const ctx: AppContext = { appsById, assessmentsByApp, changesByApp };

  it("stats", () => {
    expect(() => applicationStats(applications, assessmentsByApp, changesByApp, NOW)).not.toThrow();
    expect(() => assessmentStats(assessments, appsById, assessmentsByApp, changesByApp, questionsByAssessment, NOW)).not.toThrow();
  });

  it("the application filters", () => {
    const shown = applications.filter((a) => matchesApplicationFilters(a, DEFAULT_APP_FILTERS, assessmentsByApp.get(a.id) ?? [], NOW));
    expect(shown.length).toBeGreaterThan(0);
  });

  it("the Today card has something in each section", () => {
    const review = buildReview(gmail.emails, gmail.mutes, applications, assessments, statusChanges);
    const brief = buildToday({
      applications,
      assessments,
      moves,
      postings,
      pendingEmails: review.groups.length,
      lastScanAt: gmail.lastScan?.scanned_at ?? null,
      now: NOW,
    });
    expect(brief.assessments.length).toBeGreaterThan(0);
    expect(brief.steps.length).toBeGreaterThan(0);
    expect(brief.pendingEmails).toBeGreaterThan(0);
    expect(brief.newPostings).toBeGreaterThan(0);
  });

  it("arbitrage: funnel, rates, this week, next steps", () => {
    expect(nextSteps(moves, applications, NOW).length).toBeGreaterThan(0);
    expect(() => funnel(moves, ctx)).not.toThrow();
    expect(() => exchangeRates(moves, applications, ctx)).not.toThrow();
    expect(() => thisWeek(moves, applications, NOW)).not.toThrow();
    expect(templateStats(moves).size).toBeGreaterThan(0);
  });
});
