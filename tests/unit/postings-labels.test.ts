import { describe, expect, it } from "vitest";
import { postingGradDegree } from "@/lib/tracker/postings/degree";
import { noSponsorshipLine } from "@/lib/tracker/postings/eligibility";
import { DEFAULT_POSTING_FILTERS, isDefaultPostingFilters, matchesPostingFilters } from "@/lib/tracker/postings/filters";
import { matchPosting } from "@/lib/tracker/postings/match";
import { buildPostingViews } from "@/lib/tracker/postings/view";
import { makeApp, makePosting } from "../helpers/fixtures";

const ANY = { ...DEFAULT_POSTING_FILTERS, terms: new Set<string>(), lengths: new Set<never>(), levels: new Set<never>() };
const show = (role: string, filters = ANY) =>
  matchesPostingFilters(buildPostingViews([makePosting({ role })], [])[0], filters);

describe("hidden Data roles", () => {
  it("are off by default, back with the toggle or the Data chip", () => {
    expect(show("Data Engineer Intern")).toBe(false);
    expect(show("Data Engineer Intern", { ...ANY, showHiddenRoleTypes: true })).toBe(true);
    expect(show("Data Engineer Intern", { ...ANY, roleTypes: new Set(["data"]) })).toBe(true);
    expect(show("Software Engineer Intern")).toBe(true);
  });
  it("a toggle flips the filters off their defaults", () => {
    expect(isDefaultPostingFilters({ ...DEFAULT_POSTING_FILTERS, showHiddenRoleTypes: true })).toBe(false);
    expect(isDefaultPostingFilters({ ...DEFAULT_POSTING_FILTERS, showGradDegree: true })).toBe(false);
  });
});

describe("J-1 lines", () => {
  it("count as no sponsorship", () => {
    expect(noSponsorshipLine("Initech does not support students on J-1 visas.")).not.toBeNull();
  });
  it("leave eligible lines alone", () => {
    expect(noSponsorshipLine("F-1 students are eligible if using CPT.")).toBeNull();
    expect(noSponsorshipLine("You must be authorized to work in the U.S.")).toBeNull();
  });
});

describe("postingGradDegree", () => {
  it.each(["Software Engineer Intern (Masters)", "MS - Summer Intern", "Research Intern, Master's/PhD", "PhD Summer Associate"])(
    "flags %j",
    (role) => expect(postingGradDegree(role)).not.toBeNull()
  );
  it.each(["Software Engineer Intern [UG/Masters]", "Intern (Bachelors)", "MBA Intern", "New Graduate Engineer"])(
    "leaves %j",
    (role) => expect(postingGradDegree(role)).toBeNull()
  );
  it("is hidden by default", () => {
    expect(show("Software Engineer Intern (Masters)")).toBe(false);
    expect(show("Software Engineer Intern (Masters)", { ...ANY, showGradDegree: true })).toBe(true);
  });
});

describe("matching ignores location and company words", () => {
  it("a city in the posting role", () => {
    const apps = [makeApp({ id: "a1", company: "Globex", role: "swe" })];
    const p = { company: "Globex", role: "Software Engineer Intern (Summer 2027 - Austin)", location: "Austin, TX" };
    expect(matchPosting(p, apps)?.id).toBe("a1");
  });
  it("the company in the posting role", () => {
    const apps = [makeApp({ id: "a1", company: "Acme", role: "swe" })];
    expect(matchPosting({ company: "Acme", role: "Acme 2027 Internships - Software Engineering" }, apps)?.id).toBe("a1");
  });
  it("a city kept in the tracked role", () => {
    const apps = [makeApp({ id: "a1", company: "Globex", role: "SWE - (Mountain View, CA)" })];
    expect(matchPosting({ company: "Globex", role: "SWE (Sunnyvale, CA)" }, apps)?.id).toBe("a1");
  });
  it("the linked posting's location in the tracked role", () => {
    const apps = [makeApp({ id: "a1", company: "Globex", role: "swe Austin" })];
    const p = { company: "Globex", role: "Software Engineer Intern" };
    expect(matchPosting(p, apps, new Map([["a1", "Austin, TX"]]))?.id).toBe("a1");
  });
  it("different teams still clash", () => {
    const apps = [makeApp({ id: "a1", company: "Globex", role: "mle (Recommendation)" })];
    expect(matchPosting({ company: "Globex", role: "ML Engineer (Knowledge Graph)" }, apps)).toBeNull();
  });
});
