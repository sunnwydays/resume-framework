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
  it("non-engineering AI roles are hidden the same way, engineering AI ones are not", () => {
    expect(show("AI Intern")).toBe(false);
    expect(show("AI Intern", { ...ANY, showHiddenRoleTypes: true })).toBe(true);
    expect(show("AI Intern", { ...ANY, roleTypes: new Set(["ai_noneng"]) })).toBe(true);
    expect(show("Machine Learning Engineer Intern")).toBe(true);
    expect(show("ASIC Engineer Intern")).toBe(true);
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
  it("flags Summer Associate but not Summer Analyst", () => {
    expect(postingGradDegree("2027 Quant Summer Associate (Initech)")).toBe('The title says "Summer Associate"');
    expect(postingGradDegree("2027 Engineering Summer Analyst")).toBeNull();
    expect(postingGradDegree("Summer Associate [UG/Masters]")).toBeNull();
  });
  it("reads a requiring sentence from the description", () => {
    const why = (d: string | null | undefined, role = "Software Engineer Intern") => postingGradDegree(role, d);
    expect(why("About us.\nEnrolled in a PhD or MS program in Computer Science.")).toBe(
      'The description says "Enrolled in a PhD or MS program in Computer Science."'
    );
    expect(why("Currently pursuing a graduate degree in Data Science.")).not.toBeNull();
    expect(why("Graduate degree in CS with focus on compilers.")).not.toBeNull();
    expect(why("You will graduate with a Master's or PhD degree in 2027.")).not.toBeNull();
    expect(why("Must be pursuing a Master's degree.", "Intern (Masters)")).toBe('The title says "Masters"');
  });
  it("leaves description guards alone", () => {
    const why = (d: string | null | undefined) => postingGradDegree("Software Engineer Intern", d);
    expect(why("Current enrollment in a BS, MS, or PhD program.")).toBeNull();
    expect(why("Pursuing a BS/MS in Computer Science.")).toBeNull();
    expect(why("Required: Bachelor's or Master's degree.")).toBeNull();
    expect(why("Have a mastery of at least one systems language. Must be enrolled in a program.")).toBeNull();
    expect(why("PhD candidates may receive additional compensation.")).toBeNull();
    expect(why("Pursuing a degree. Contact Ms. Smith, currently in HR. Items in ms are fast.")).toBeNull();
    expect(why("Proficiency in MS Office is required.")).toBeNull();
    expect(why("A Master's degree in Data Science is preferred.")).toBeNull();
    expect(why("Enrolled in a Master's program. Also an associate's degree is fine.")).toBeNull();
    expect(why("")).toBeNull();
    expect(why(null)).toBeNull();
  });
  it("hides a description-only grad posting by default", () => {
    const view = (description: string) => buildPostingViews([makePosting({ role: "Data Scientist Intern", description })], [])[0];
    const grad = view("Currently pursuing a graduate degree in Data Science.");
    expect(grad.gradDegree).toContain("The description says");
    expect(matchesPostingFilters(grad, { ...ANY, showHiddenRoleTypes: true })).toBe(false);
    expect(matchesPostingFilters(grad, { ...ANY, showHiddenRoleTypes: true, showGradDegree: true })).toBe(true);
  });
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
