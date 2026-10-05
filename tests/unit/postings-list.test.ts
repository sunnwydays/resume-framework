import { describe, expect, it } from "vitest";
import { formatAgo } from "@/lib/tracker/format";
import { DEFAULT_POSTING_FILTERS, isDefaultPostingFilters, matchesPostingFilters, type PostingFilters } from "@/lib/tracker/postings/filters";
import { matchPosting } from "@/lib/tracker/postings/match";
import type { ParsedPosting } from "@/lib/tracker/postings/parse";
import { dedupePostings, defaultPostingScanFrom, summarizePostingScan, toPostingRow } from "@/lib/tracker/postings/scan";
import { NO_TERM } from "@/lib/tracker/postings/term";
import { postingSortValue } from "@/lib/tracker/postings/sorting";
import { buildPostingViews, splitTracked, type PostingView } from "@/lib/tracker/postings/view";
import { sortRows } from "@/lib/tracker/sorting";
import { local, makeApp, makePosting } from "../helpers/fixtures";

const ANY_TERM_AND_LENGTH: PostingFilters = { ...DEFAULT_POSTING_FILTERS, terms: new Set(), lengths: new Set() };

const parsed = (over: Partial<ParsedPosting> = {}): ParsedPosting => ({
  source: "jobright",
  sourceId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  url: "https://jobright.ai/jobs/info/aaaaaaaaaaaaaaaaaaaaaaaa",
  company: "Vandelay Industries",
  role: "Software Engineer Intern",
  location: null,
  pay: null,
  referrals: null,
  categories: null,
  matchPct: null,
  postedAt: null,
  firstSeenAt: "2026-10-04T12:00:00.000Z",
  gmailId: "gm-1",
  ...over,
});

describe("dedupePostings", () => {
  it("keeps one posting per job", () => {
    const out = dedupePostings([
      parsed({ sourceId: "a".repeat(24) }),
      parsed({ sourceId: "b".repeat(24) }),
      parsed({ sourceId: "a".repeat(24), gmailId: "gm-2", firstSeenAt: "2026-10-05T12:00:00.000Z" }),
    ]);
    expect(out.map((p) => p.sourceId)).toEqual(["a".repeat(24), "b".repeat(24)]);
  });

  it("keeps the earliest sighting and its email", () => {
    const [p] = dedupePostings([
      parsed({ gmailId: "late", firstSeenAt: "2026-10-06T12:00:00.000Z", matchPct: 70 }),
      parsed({ gmailId: "early", firstSeenAt: "2026-10-04T12:00:00.000Z", matchPct: 90 }),
    ]);
    expect(p).toMatchObject({ gmailId: "early", firstSeenAt: "2026-10-04T12:00:00.000Z", matchPct: 90 });
  });

  it("fills fields the earliest sighting lacked from later ones, without overwriting", () => {
    const [p] = dedupePostings([
      parsed({ firstSeenAt: "2026-10-04T12:00:00.000Z", location: "Toronto, ON" }),
      parsed({ firstSeenAt: "2026-10-05T12:00:00.000Z", location: "Remote", pay: "CA$40/hr", categories: "Apps · Public Company" }),
    ]);
    expect(p).toMatchObject({ location: "Toronto, ON", pay: "CA$40/hr", categories: "Apps · Public Company" });
  });

  it("doesn't change its input", () => {
    const input = [parsed({ firstSeenAt: "2026-10-05T12:00:00.000Z" }), parsed({ firstSeenAt: "2026-10-04T12:00:00.000Z", pay: "$1/hr" })];
    const copy = structuredClone(input);
    dedupePostings(input);
    expect(input).toEqual(copy);
  });

  it("handles nothing", () => expect(dedupePostings([])).toEqual([]));
});

describe("toPostingRow", () => {
  it("maps to the table's columns", () => {
    expect(toPostingRow(parsed({ location: "Austin, TX", matchPct: 80, postedAt: "2026-10-04T11:00:00.000Z" }))).toEqual({
      source: "jobright",
      source_id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      url: "https://jobright.ai/jobs/info/aaaaaaaaaaaaaaaaaaaaaaaa",
      company: "Vandelay Industries",
      role: "Software Engineer Intern",
      location: "Austin, TX",
      pay: null,
      referrals: null,
      categories: null,
      match_pct: 80,
      posted_at: "2026-10-04T11:00:00.000Z",
      first_seen_at: "2026-10-04T12:00:00.000Z",
      gmail_id: "gm-1",
    });
  });
});

describe("defaultPostingScanFrom", () => {
  it("starts a day before the newest posting, on the local calendar", () => {
    const postings = [{ first_seen_at: local(2026, 10, 1) }, { first_seen_at: local(2026, 10, 3, 0, 30) }];
    expect(defaultPostingScanFrom(postings)).toBe("2026-10-02");
    expect(defaultPostingScanFrom([{ first_seen_at: local(2026, 10, 3, 23, 30) }])).toBe("2026-10-02");
  });

  it("first scan: two weeks back", () => {
    expect(defaultPostingScanFrom([], new Date(2026, 9, 20, 9).getTime())).toBe("2026-10-06");
  });
});

describe("summarizePostingScan", () => {
  it("reads like the Gmail scan summary", () => {
    expect(summarizePostingScan({ alerts: 12, postings: 31, saved: 9 })).toBe("12 alerts → 31 postings, 9 new");
    expect(summarizePostingScan({ alerts: 1, postings: 1, saved: 0 })).toBe("1 alert → 1 posting, 0 new");
    expect(summarizePostingScan({ alerts: 0, postings: 0, saved: 0 })).toBe("No Jobright alerts in that range");
  });
});

describe("matchPosting", () => {
  const apps = [
    makeApp({ id: "a1", company: "Vandelay Industries", role: "SWE ML" }),
    makeApp({ id: "a2", company: "Vandelay Industries", role: "Software Engineer Intern" }),
    makeApp({ id: "a3", company: "Initech", role: "Software Engineer Intern" }),
  ];

  it("matches the same company with a similar role", () => {
    expect(matchPosting({ company: "Initech", role: "Software Engineer Intern (Summer 2027)" }, apps)?.id).toBe("a3");
  });

  it("takes the best role among a company's applications", () => {
    expect(matchPosting({ company: "Vandelay Industries Inc.", role: "Machine Learning Engineer Intern" }, apps)?.id).toBe("a1");
    expect(matchPosting({ company: "Vandelay Industries", role: "Software Engineer Intern" }, apps)?.id).toBe("a2");
  });

  it("is null for another company, or a clashing role at the same one", () => {
    expect(matchPosting({ company: "Globex", role: "Software Engineer Intern" }, apps)).toBeNull();
    expect(matchPosting({ company: "Initech", role: "Robotics Engineer Intern" }, apps)).toBeNull();
    expect(matchPosting({ company: "Initech", role: "Software Engineer Intern" }, [])).toBeNull();
  });
});

describe("buildPostingViews", () => {
  it("derives region, eligibility and the tracked application", () => {
    const app = makeApp({ id: "app-x", company: "Initech", role: "SWE Intern" });
    const linked = makePosting({ company: "Whatever", application_id: "app-x" });
    const matched = makePosting({ company: "Initech", role: "Software Engineer Intern", location: "Austin, TX" });
    const defense = makePosting({ company: "Raytheon", location: "Tucson, AZ" });
    const [a, b, c] = buildPostingViews([linked, matched, defense], [app]);
    expect(a.tracked?.id).toBe("app-x");
    expect(b.tracked?.id).toBe("app-x");
    expect(b.region.region).toBe("us");
    expect(c.eligibility.level).toBe("no");
    expect(c.tracked).toBeNull();
  });
});

describe("matchesPostingFilters", () => {
  const apps = [makeApp({ company: "Initech", role: "Software Engineer Intern" })];
  const views = buildPostingViews(
    [
      makePosting({ id: "p-new-ca", company: "Vandelay Industries", location: "Toronto, ON", match_pct: 90 }),
      makePosting({ id: "p-new-us", company: "Globex", location: "Austin, TX", match_pct: 60, role: "Machine Learning Intern" }),
      makePosting({ id: "p-defense", company: "Lockheed Martin", location: "Marietta, GA", match_pct: 99 }),
      makePosting({ id: "p-aero", company: "Hooli", location: "Denver, CO", categories: "Aerospace · Private", match_pct: null }),
      makePosting({ id: "p-tracked", company: "Initech", location: "Toronto, ON" }),
      makePosting({ id: "p-saved", company: "Umbrella", state: "saved" }),
      makePosting({ id: "p-applied", company: "Initech", state: "applied", application_id: apps[0].id }),
      makePosting({ id: "p-dismissed", company: "Stark", state: "dismissed" }),
    ],
    apps
  );
  // The fixtures state no term or length, so most tests clear those two.
  const ids = (f: Partial<PostingFilters>) =>
    views.filter((v) => matchesPostingFilters(v, { ...ANY_TERM_AND_LENGTH, ...f })).map((v) => v.posting.id);

  it("by default: new ones, not-eligible and already-tracked hidden", () => {
    expect(ids({})).toEqual(["p-new-ca", "p-new-us", "p-aero"]);
  });

  it("by default: Summer 2027 and up to 4 months, keeping postings that state neither", () => {
    expect(DEFAULT_POSTING_FILTERS.terms).toEqual(new Set(["2027-summer", NO_TERM]));
    expect(DEFAULT_POSTING_FILTERS.lengths).toEqual(new Set(["short", "unstated"]));
    const defaultIds = (list: PostingView[]) => list.filter((v) => matchesPostingFilters(v, DEFAULT_POSTING_FILTERS)).map((v) => v.posting.id);
    const candidates = buildPostingViews(
      [
        makePosting({ id: "d-match", role: "SWE Intern (Summer 2027, 4 months)" }),
        makePosting({ id: "d-long", role: "SWE Co-op (Summer 2027, 8 months)" }),
        makePosting({ id: "d-fall", role: "SWE Intern (Fall 2026, 4 months)" }),
        makePosting({ id: "d-none", role: "SWE Intern" }),
      ],
      []
    );
    expect(defaultIds(candidates)).toEqual(["d-match", "d-none"]);
  });

  it("by state", () => {
    expect(ids({ state: "saved" })).toEqual(["p-saved"]);
    expect(ids({ state: "dismissed" })).toEqual(["p-dismissed"]);
  });

  it("the applied chip still shows tracked postings", () => {
    expect(ids({ state: "applied" })).toEqual(["p-applied"]);
  });

  it("all states", () => {
    expect(ids({ state: "all", hideTracked: false, showIneligible: true })).toHaveLength(views.length);
  });

  it("not-eligible ones come back when asked", () => {
    expect(ids({ showIneligible: true })).toContain("p-defense");
  });

  it("tracked ones come back when asked", () => {
    expect(ids({ hideTracked: false })).toContain("p-tracked");
  });

  it("by region", () => {
    expect(ids({ regions: new Set(["us"]) })).toEqual(["p-new-us", "p-aero"]);
    expect(ids({ regions: new Set(["canada"]) })).toEqual(["p-new-ca"]);
    expect(ids({ regions: new Set(["us", "canada"]) })).toEqual(["p-new-ca", "p-new-us", "p-aero"]);
  });

  it("by role type", () => {
    expect(ids({ roleTypes: new Set(["ml"]) })).toEqual(["p-new-us"]);
  });

  it("by term; ones with no term are their own choice", () => {
    const termViews = buildPostingViews(
      [
        makePosting({ id: "t-summer", role: "Software Engineer Intern (Summer 2027)" }),
        makePosting({ id: "t-fall", role: "SWE Intern, Fall 2026" }),
        makePosting({ id: "t-none", role: "Software Engineer Intern" }),
      ],
      []
    );
    const pick = (terms: string[]) =>
      termViews.filter((v) => matchesPostingFilters(v, { ...ANY_TERM_AND_LENGTH, terms: new Set(terms) })).map((v) => v.posting.id);
    expect(pick([])).toEqual(["t-summer", "t-fall", "t-none"]);
    expect(pick(["2027-summer"])).toEqual(["t-summer"]);
    expect(pick(["2027-summer", NO_TERM])).toEqual(["t-summer", "t-none"]);
    expect(pick(["2030-summer"])).toEqual([]);
  });

  it("the default filters hide a Winter intern and a long co-op that the title doesn't date or size", () => {
    const seen = { first_seen_at: new Date(2026, 9, 4, 12).toISOString() };
    const views = buildPostingViews(
      [
        // Title says only "(Winter)": the year comes from when it was seen.
        makePosting({ id: "bare-winter", role: "Intern, Platform (Winter)", ...seen }),
        // Title says nothing: the posting page gave the start and the length.
        makePosting({
          id: "page-winter-long",
          role: "Intern Developer, Solutions",
          start_text: "Start in 2027 Winter",
          length_text: "This is a full-time, 8, or 12-month position, starting January 2027",
          details_read_at: "2026-10-04T12:00:00.000Z",
          ...seen,
        }),
        makePosting({ id: "page-summer-short", role: "Intern Developer", start_text: "Start in 2027 Summer", length_text: "A 16-week internship program", ...seen }),
        makePosting({ id: "unread", role: "Software Intern", ...seen }),
      ],
      []
    );
    const shown = views.filter((v) => matchesPostingFilters(v, DEFAULT_POSTING_FILTERS)).map((v) => v.posting.id);
    expect(shown).toEqual(["page-summer-short", "unread"]);
  });

  it("by length bucket", () => {
    const lengthViews = buildPostingViews(
      [
        makePosting({ id: "l-short", role: "Intern, 3-4 months" }),
        makePosting({ id: "l-mid", role: "Co-op, 8 month term" }),
        makePosting({ id: "l-long", role: "Co-op (12-16 months)" }),
        makePosting({ id: "l-none", role: "Intern" }),
      ],
      []
    );
    const pick = (lengths: ("short" | "medium" | "long" | "unstated")[]) =>
      lengthViews.filter((v) => matchesPostingFilters(v, { ...ANY_TERM_AND_LENGTH, lengths: new Set(lengths) })).map((v) => v.posting.id);
    expect(pick(["short"])).toEqual(["l-short"]);
    expect(pick(["medium", "long"])).toEqual(["l-mid", "l-long"]);
    expect(pick(["short", "unstated"])).toEqual(["l-short", "l-none"]);
  });

  it("by minimum match; no score counts as zero", () => {
    expect(ids({ minMatch: 80 })).toEqual(["p-new-ca"]);
    expect(ids({ minMatch: 0 })).toContain("p-aero");
  });

  it("by search over company, role, location and industry", () => {
    expect(ids({ query: " globex " })).toEqual(["p-new-us"]);
    expect(ids({ query: "machine learning" })).toEqual(["p-new-us"]);
    expect(ids({ query: "denver" })).toEqual(["p-aero"]);
    expect(ids({ query: "aerospace" })).toEqual(["p-aero"]);
    expect(ids({ query: "nothing like this" })).toEqual([]);
  });

  it("knows when filters are at their defaults", () => {
    expect(isDefaultPostingFilters(DEFAULT_POSTING_FILTERS)).toBe(true);
    expect(isDefaultPostingFilters({ ...DEFAULT_POSTING_FILTERS, minMatch: 50 })).toBe(false);
    expect(isDefaultPostingFilters({ ...DEFAULT_POSTING_FILTERS, regions: new Set(["us"]) })).toBe(false);
    expect(isDefaultPostingFilters({ ...DEFAULT_POSTING_FILTERS, terms: new Set() })).toBe(false);
    expect(isDefaultPostingFilters({ ...DEFAULT_POSTING_FILTERS, terms: new Set(["2027-summer"]) })).toBe(false);
    expect(isDefaultPostingFilters({ ...DEFAULT_POSTING_FILTERS, lengths: new Set(["long"]) })).toBe(false);
  });
});

describe("splitTracked", () => {
  it("puts postings already in the tracker last, keeping each group's order", () => {
    const views = buildPostingViews(
      [
        makePosting({ id: "a", company: "Globex" }),
        makePosting({ id: "b", company: "Initech" }),
        makePosting({ id: "c", company: "Hooli" }),
        makePosting({ id: "d", company: "Initech", state: "applied" }),
      ],
      [makeApp({ company: "Initech", role: "Software Engineer Intern" })]
    );
    const { open, tracked } = splitTracked(views);
    expect(open.map((v) => v.posting.id)).toEqual(["a", "c"]);
    expect(tracked.map((v) => v.posting.id)).toEqual(["b", "d"]);
  });
});

describe("postingSortValue", () => {
  const views = buildPostingViews(
    [
      makePosting({ id: "old", company: "Beta", posted_at: "2026-10-01T00:00:00.000Z", match_pct: 70, location: "Austin, TX" }),
      makePosting({ id: "new", company: "alpha", posted_at: "2026-10-04T00:00:00.000Z", match_pct: null, location: "Toronto, ON" }),
      makePosting({ id: "unposted", company: "Gamma", posted_at: null, first_seen_at: "2026-10-02T00:00:00.000Z", match_pct: 95, location: "Remote" }),
    ],
    []
  );
  const order = (key: Parameters<typeof postingSortValue>[1], dir: "asc" | "desc") =>
    sortRows(views, postingSortValue, { key, dir }).map((v) => v.posting.id);

  it("posted: newest first, falling back on when it was first seen", () => {
    expect(order("posted", "desc")).toEqual(["new", "unposted", "old"]);
    expect(order("posted", "asc")).toEqual(["old", "unposted", "new"]);
  });

  it("match: no score goes last either way", () => {
    expect(order("match", "desc")).toEqual(["unposted", "old", "new"]);
    expect(order("match", "asc")).toEqual(["old", "unposted", "new"]);
  });

  it("company ignores case", () => {
    expect(order("company", "asc")).toEqual(["new", "old", "unposted"]);
  });

  it("region: US, Canada, unclear, then elsewhere", () => {
    expect(order("region", "asc")).toEqual(["old", "new", "unposted"]);
  });
});

describe("formatAgo", () => {
  const now = Date.parse("2026-10-04T12:00:00.000Z");
  const before = (ms: number) => new Date(now - ms).toISOString();
  it.each([
    [10_000, "just now"],
    [37 * 60_000, "37m ago"],
    [3 * 3_600_000 + 5 * 60_000, "3h ago"],
    [49 * 3_600_000, "2d ago"],
  ])("%d ms ago -> %s", (ms, text) => expect(formatAgo(before(ms), now)).toBe(text));

  it("a time slightly in the future reads as just now; nothing reads as a dash", () => {
    expect(formatAgo(before(-5000), now)).toBe("just now");
    expect(formatAgo(null, now)).toBe("—");
    expect(formatAgo("garbage", now)).toBe("—");
  });
});
