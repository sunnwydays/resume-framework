import { beforeEach, describe, expect, it } from "vitest";
import { postingEditFeedback } from "@/lib/tracker/feedback/posting";
import type { JobPosting } from "@/lib/tracker/format";
import { draftOf, editsOf, planPostingEdit, readLengthInput, readTermInput, type PostingEdits } from "@/lib/tracker/postings/edits";
import { DEFAULT_POSTING_FILTERS, matchesPostingFilters } from "@/lib/tracker/postings/filters";
import { postingView, ruleValues, type PostingView } from "@/lib/tracker/postings/view";
import { makePosting, resetFixtureIds } from "../helpers/fixtures";

beforeEach(() => resetFixtureIds());

const auto = (p: JobPosting) => {
  const r = ruleValues(p);
  return { region: r.region.region, level: r.level.level, term: r.term, length: r.length, roleType: r.roleType };
};

// Plans an edit from the view's own form values with `change` applied, and
// returns the plan plus the view after saving it.
function edit(view: PostingView, change: Partial<ReturnType<typeof draftOf>>) {
  const initial = draftOf(view);
  const plan = planPostingEdit(view.parsed, initial, { ...initial, ...change }, auto);
  if ("error" in plan) return { plan, after: null };
  return { plan, after: postingView({ ...view.parsed, edits: plan.edits as JobPosting["edits"] }, []) };
}

describe("editsOf", () => {
  it("keeps only well-formed fields", () => {
    const edits = editsOf(makePosting({ edits: { region: "us", level: "boss", company: "", location: null, term: 5, role_type: "data" } }));
    expect(edits).toEqual({ region: "us", location: null, role_type: "data" });
  });

  it("reads junk as no edits", () => {
    expect(editsOf(makePosting({ edits: [] }))).toEqual({});
    expect(editsOf(makePosting({ edits: null as unknown as JobPosting["edits"] }))).toEqual({});
  });
});

describe("typed term and length", () => {
  it("reads a term, a bare season, or nothing", () => {
    expect(readTermInput("Summer 2027")?.label).toBe("Summer 2027");
    expect(readTermInput("fall", "2026-10-04T11:00:00.000Z")?.label).toMatch(/^Fall 20\d\d$/);
    expect(readTermInput("  ")).toBeNull();
    expect(readTermInput("soon")).toBeUndefined();
  });

  it("reads a bare number as months", () => {
    expect(readLengthInput("4")).toEqual({ min: 4, max: 4 });
    expect(readLengthInput("4-8")).toEqual({ min: 4, max: 8 });
    expect(readLengthInput("16 weeks")).toEqual({ min: 4, max: 4 });
    expect(readLengthInput("")).toBeNull();
    expect(readLengthInput("a while")).toBeUndefined();
  });
});

describe("postingView with edits", () => {
  it("leaves the parsed row alone and applies text edits before the rules", () => {
    const view = postingView(makePosting({ location: null, edits: { location: "Austin, TX" } }), []);
    expect(view.parsed.location).toBeNull();
    expect(view.posting.location).toBe("Austin, TX");
    expect(view.region.region).toBe("us");
    expect(view.edited).toEqual(["location"]);
  });

  it("lets a region override drive eligibility", () => {
    const parsed = makePosting({ company: "Lockheed Martin", location: null });
    expect(postingView(parsed, []).eligibility.level).toBe("ok");
    const view = postingView({ ...parsed, edits: { region: "us" } }, []);
    expect(view.region).toEqual({ region: "us", why: "Set by you" });
    expect(view.eligibility.level).toBe("no");
  });

  it("uses an overridden role type in the filters", () => {
    const view = postingView(makePosting({ edits: { role_type: "data" } }), []);
    expect(view.roleType).toBe("data");
    expect(matchesPostingFilters(view, { ...DEFAULT_POSTING_FILTERS, roleTypes: new Set(["data"]) })).toBe(true);
  });

  it("reads term and length overrides, null meaning not stated", () => {
    const view = postingView(makePosting({ role: "Software Engineer Intern (Summer 2027, 4 months)", edits: { term: null, length: "8 months" } }), []);
    expect(view.term).toBeNull();
    expect(view.length).toEqual({ min: 8, max: 8 });
  });
});

describe("planPostingEdit", () => {
  it("stores nothing when nothing changed", () => {
    const view = postingView(makePosting(), []);
    expect(edit(view, {}).plan).toEqual({ edits: {}, touched: [] });
  });

  it("stores a changed value and drops one set back to the parse", () => {
    const view = postingView(makePosting({ location: null }), []);
    const { plan, after } = edit(view, { location: "Seattle, WA", region: "us" });
    // The location alone makes the rules say US, so no region override is kept.
    expect(plan).toEqual({ edits: { location: "Seattle, WA" }, touched: ["location", "region"] });
    expect(after!.region.region).toBe("us");

    const back = edit(after!, { location: "" });
    expect(back.plan).toMatchObject({ edits: {} });
  });

  it("overrides the region when the location can't say it", () => {
    const view = postingView(makePosting({ location: "Remote" }), []);
    expect(view.region.region).toBe("unknown");
    expect(edit(view, { region: "us" }).plan).toMatchObject({ edits: { region: "us" } });
  });

  it("doesn't turn a role edit into a level override", () => {
    const view = postingView(makePosting({ role: "Software Engineer Intern" }), []);
    const { plan, after } = edit(view, { role: "Software Engineer, New Grad" });
    expect(plan).toEqual({ edits: { role: "Software Engineer, New Grad" }, touched: ["role"] });
    expect(after!.level.level).toBe("grad");
  });

  it("keeps earlier edits on fields left alone", () => {
    const view = postingView(makePosting({ edits: { pay: "$40/hr" } }), []);
    expect(edit(view, { company: "Vandelay" }).plan).toMatchObject({ edits: { pay: "$40/hr", company: "Vandelay" } });
  });

  it("stores typed terms and lengths in a standard form", () => {
    const view = postingView(makePosting(), []);
    expect(edit(view, { term: "summer '27", length: "4" }).plan).toMatchObject({ edits: { term: "Summer 2027", length: "4 months" } });
  });

  it("refuses what it can't read, and an empty company or role", () => {
    const view = postingView(makePosting(), []);
    expect(edit(view, { term: "soon" }).plan).toEqual({ error: expect.stringContaining("soon") });
    expect(edit(view, { length: "a while" }).plan).toEqual({ error: expect.stringContaining("a while") });
    expect(edit(view, { role: " " }).plan).toEqual({ error: "Role can't be empty" });
  });
});

describe("postingEditFeedback", () => {
  it("records what the row showed before and after, and what changed", () => {
    const view = postingView(makePosting({ location: "Remote" }), []);
    const { plan, after } = edit(view, { region: "us", pay: "$45/hr" });
    const event = postingEditFeedback(view, after!, "edits" in plan ? plan.touched : [])!;
    expect(event.action).toBe("edit");
    expect(event.changed).toEqual(["pay", "region"]);
    expect(event.guess).toMatchObject({ region: "unknown", pay: null });
    expect(event.final).toMatchObject({ region: "us", pay: "$45/hr" });
    const context = event.context as unknown as { posting: JobPosting; set_by_hand: string[]; edits_after: PostingEdits };
    expect(context.posting.location).toBe("Remote");
    expect(context.posting).not.toHaveProperty("user_id");
    expect(context.set_by_hand).toEqual(["pay", "region"]);
    expect(context.edits_after).toEqual({ pay: "$45/hr", region: "us" });
  });

  it("notes fields that moved because the text under them did", () => {
    const view = postingView(makePosting({ role: "Software Engineer Intern" }), []);
    const { plan, after } = edit(view, { role: "Senior Software Engineer" });
    const event = postingEditFeedback(view, after!, "edits" in plan ? plan.touched : [])!;
    expect(event.changed).toEqual(["level", "role"]);
    expect((event.context as { set_by_hand: string[] }).set_by_hand).toEqual(["role"]);
  });

  it("records nothing when nothing changed", () => {
    const view = postingView(makePosting(), []);
    expect(postingEditFeedback(view, view, [])).toBeNull();
  });

  it("marks a reset", () => {
    const view = postingView(makePosting({ edits: { region: "us" }, location: "Remote" }), []);
    const after = postingView({ ...view.parsed, edits: {} }, []);
    const event = postingEditFeedback(view, after, [], true)!;
    expect(event.changed).toEqual(["region"]);
    expect((event.context as { reset: boolean }).reset).toBe(true);
  });
});
