import { describe, expect, it } from "vitest";
import { DEFAULT_POSTING_FILTERS, isDefaultPostingFilters, matchesPostingFilters } from "@/lib/tracker/postings/filters";
import { buildPostingViews } from "@/lib/tracker/postings/view";
import type { JobPosting } from "@/lib/tracker/format";
import { makeApp, makePosting } from "../helpers/fixtures";

const ANY = { ...DEFAULT_POSTING_FILTERS, terms: new Set<string>(), lengths: new Set<never>(), levels: new Set<never>() };
const NOV_11 = new Date(2026, 10, 11, 12).toISOString();

const dismissed = (over: Partial<JobPosting> = {}) =>
  makePosting({ company: "Globex", role: "Platform Engineer Intern", state: "dismissed", updated_at: NOV_11, ...over });
const fresh = (over: Partial<JobPosting> = {}) => makePosting({ company: "Globex", role: "Platform Engineer Intern", ...over });

const viewOf = (target: JobPosting, others: JobPosting[], apps = [] as ReturnType<typeof makeApp>[]) =>
  buildPostingViews([...others, target], apps).find((v) => v.posting.id === target.id)!;

describe("relisted postings", () => {
  it("same company and role under a new source id is a relist, with the dismissed date", () => {
    const old = dismissed();
    const v = viewOf(fresh(), [old]);
    expect(v.relist?.of.id).toBe(old.id);
    expect(v.relist?.why).toBe("You dismissed this on Nov 11");
  });

  it("the same role in another city is a relist", () => {
    const v = viewOf(fresh({ location: "Austin, TX", role: "Platform Engineer Intern (Austin, TX)" }), [
      dismissed({ location: "Chicago, IL" }),
    ]);
    expect(v.relist).not.toBeNull();
  });

  it("a different role at the same company is not", () => {
    expect(viewOf(fresh({ role: "Hardware Engineer Intern" }), [dismissed({ role: "Software Engineer Intern" })]).relist).toBeNull();
    expect(viewOf(fresh({ role: "Backend Platform Intern" }), [dismissed({ role: "Backend Search Intern" })]).relist).toBeNull();
  });

  it("the same role at another company is not", () => {
    expect(viewOf(fresh({ company: "Initech" }), [dismissed()]).relist).toBeNull();
  });

  it("uses the most recent dismissed match", () => {
    const older = dismissed({ updated_at: new Date(2026, 9, 22, 12).toISOString() });
    expect(viewOf(fresh(), [older, dismissed()]).relist?.why).toBe("You dismissed this on Nov 11");
  });

  it("never marks the dismissed posting itself, or saved and applied ones", () => {
    const old = dismissed();
    const views = buildPostingViews([old, fresh({ state: "saved" }), fresh({ state: "applied" }), dismissed()], []);
    expect(views.map((v) => v.relist)).toEqual([null, null, null, null]);
  });

  it("a posting that only matches an applied posting is not a relist", () => {
    expect(viewOf(fresh(), [fresh({ state: "applied" })]).relist).toBeNull();
  });

  it("an application match is left to the tracked path", () => {
    const app = makeApp({ company: "Globex", role: "Platform Engineer Intern" });
    const v = viewOf(fresh(), [dismissed()], [app]);
    expect(v.tracked).not.toBeNull();
    expect(v.relist).toBeNull();
  });

  it("restoring the dismissed posting un-marks the relist", () => {
    const old = dismissed();
    expect(viewOf(fresh(), [{ ...old, state: "new" }]).relist).toBeNull();
  });

  it("dismissing one of two new per-city duplicates marks the other", () => {
    const a = fresh({ location: "Chicago, IL" });
    const b = fresh({ location: "Austin, TX" });
    expect(buildPostingViews([a, b], []).map((v) => v.relist)).toEqual([null, null]);
    const views = buildPostingViews([{ ...a, state: "dismissed" }, b], []);
    expect(views[1].relist?.of.id).toBe(a.id);
  });

  it("uses hand-edited company and role", () => {
    const edited = fresh({ company: "Other Co", role: "Something Else", edits: { company: "Globex", role: "Platform Engineer Intern" } });
    expect(viewOf(edited, [dismissed()]).relist).not.toBeNull();
  });

  it("is hidden by default and shown with showRelists", () => {
    const v = viewOf(fresh(), [dismissed()]);
    expect(matchesPostingFilters(v, ANY)).toBe(false);
    expect(matchesPostingFilters(v, { ...ANY, showRelists: true })).toBe(true);
    expect(DEFAULT_POSTING_FILTERS.showRelists).toBe(false);
    expect(isDefaultPostingFilters({ ...DEFAULT_POSTING_FILTERS, showRelists: true })).toBe(false);
  });
});
