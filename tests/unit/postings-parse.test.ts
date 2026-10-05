import { describe, expect, it } from "vitest";
import { classifyTag, isJobrightAlert, parseAge, parseJobrightAlert } from "@/lib/tracker/postings/parse";
import { IDS, alertHtml, card } from "../helpers/postings";

const RECEIVED = "2026-10-04T12:00:00.000Z";
const HOUR = 3_600_000;

describe("isJobrightAlert", () => {
  it("is the instant-alert sender with a 'just posted' subject", () => {
    expect(isJobrightAlert("noreply@jobright.ai", "Vandelay just posted a 89% match Software Engineer Intern role 1 hour ago")).toBe(true);
    expect(isJobrightAlert("NoReply@Jobright.ai", "Initech JUST POSTED a role")).toBe(true);
  });
  it("is not the daily digest or other mail", () => {
    expect(isJobrightAlert("support@jobright.ai", "Today's Matching Jobs")).toBe(false);
    expect(isJobrightAlert("noreply@jobright.ai", "Welcome to Jobright")).toBe(false);
    expect(isJobrightAlert("noreply@example.com", "Vandelay just posted a role")).toBe(false);
  });
});

describe("parseAge", () => {
  it.each([
    ["37 minutes ago", 37 * 60_000],
    ["1 minute ago", 60_000],
    ["1 hour ago", HOUR],
    ["an hour ago", HOUR],
    ["23 hours ago", 23 * HOUR],
    ["2 days ago", 48 * HOUR],
    ["a day ago", 24 * HOUR],
    ["1 week ago", 7 * 24 * HOUR],
    ["just now", 0],
    ["  5 Hours Ago ", 5 * HOUR],
  ])("%s", (text, ms) => expect(parseAge(text)).toBe(ms));

  it.each(["", "yesterday", "3 fortnights ago", "posted 2 hours ago"])("can't read %j", (text) => {
    expect(parseAge(text)).toBeNull();
  });
});

describe("classifyTag", () => {
  it.each([
    ["CA$40/hr - CA$45/hr", "pay"],
    ["$47K/yr - $91K/yr", "pay"],
    ["CA$6000/mo - CA$7000/mo", "pay"],
    ["$18/hr", "pay"],
    ["5+ referrals", "referrals"],
    ["1 referral", "referrals"],
    ["Toronto, ON", "location"],
    ["Pleasanton, CA", "location"],
    ["Remote", "location"],
  ])("%s -> %s", (text, kind) => expect(classifyTag(text)).toBe(kind));
});

describe("parseJobrightAlert", () => {
  const html = alertHtml([
    card({
      id: IDS.a,
      company: "Vandelay Industries",
      categories: "Apps · Public Company",
      pct: 89,
      title: "Software Engineer Intern, Backend (Summer 2027 - Toronto)",
      tags: ["CA$40/hr - CA$45/hr", "Toronto, ON", "5+ referrals"],
      age: "1 hour ago",
    }),
    card({ id: IDS.b, company: "Initech", categories: "Fintech · Series B", pct: 77, title: "SWE Intern", tags: ["Austin, TX"], age: "37 minutes ago" }),
    card({ id: IDS.c, company: "Globex &amp; Sons", pct: 60, title: "Data Intern", age: "2 days ago" }),
  ]);

  it("reads the headline and the extra cards", () => {
    const postings = parseJobrightAlert(html, RECEIVED, "gm-1");
    expect(postings.map((p) => [p.sourceId, p.company])).toEqual([
      [IDS.a, "Vandelay Industries"],
      [IDS.b, "Initech"],
      [IDS.c, "Globex & Sons"],
    ]);
  });

  it("reads every field of a full card", () => {
    expect(parseJobrightAlert(html, RECEIVED, "gm-1")[0]).toEqual({
      source: "jobright",
      sourceId: IDS.a,
      url: `https://jobright.ai/jobs/info/${IDS.a}`,
      company: "Vandelay Industries",
      role: "Software Engineer Intern, Backend (Summer 2027 - Toronto)",
      location: "Toronto, ON",
      pay: "CA$40/hr - CA$45/hr",
      referrals: "5+ referrals",
      categories: "Apps · Public Company",
      matchPct: 89,
      postedAt: new Date(Date.parse(RECEIVED) - HOUR).toISOString(),
      firstSeenAt: RECEIVED,
      gmailId: "gm-1",
    });
  });

  it("takes tags in any subset and order, by what they say", () => {
    const tags = (list: string[]) =>
      parseJobrightAlert(alertHtml([card({ id: IDS.a, company: "X Co", title: "Intern", tags: list })]), RECEIVED, "g")[0];
    expect(tags(["5+ referrals", "Remote"])).toMatchObject({ location: "Remote", pay: null, referrals: "5+ referrals" });
    expect(tags(["$47K/yr - $91K/yr"])).toMatchObject({ location: null, pay: "$47K/yr - $91K/yr", referrals: null });
    expect(tags([])).toMatchObject({ location: null, pay: null, referrals: null });
    expect(tags(["Pleasanton, CA", "$20/hr"])).toMatchObject({ location: "Pleasanton, CA", pay: "$20/hr" });
  });

  it("strips tracking params from the link", () => {
    const [p] = parseJobrightAlert(html, RECEIVED, "g");
    expect(p.url).not.toContain("utm");
    expect(p.url).not.toContain("?");
  });

  it("works from the age text; no age means no posted time", () => {
    const [, second, third] = parseJobrightAlert(html, RECEIVED, "g");
    expect(second.postedAt).toBe(new Date(Date.parse(RECEIVED) - 37 * 60_000).toISOString());
    expect(third.postedAt).toBe(new Date(Date.parse(RECEIVED) - 48 * HOUR).toISOString());
    const noAge = parseJobrightAlert(alertHtml([card({ id: IDS.a, company: "X", title: "Intern" })]), RECEIVED, "g")[0];
    expect(noAge.postedAt).toBeNull();
    expect(noAge.matchPct).toBeNull();
  });

  it("skips a card missing its company, title or id instead of throwing", () => {
    const broken = alertHtml([
      card({ id: IDS.a, company: "X", title: "No company", omit: ["company"] }),
      card({ id: IDS.b, company: "Y", title: "No title", omit: ["title"] }),
      card({ id: IDS.c, company: "Z", title: "Fine" }),
    ]);
    expect(parseJobrightAlert(broken, RECEIVED, "g").map((p) => p.company)).toEqual(["Z"]);
    expect(parseJobrightAlert("<p>nothing here</p>", RECEIVED, "g")).toEqual([]);
    expect(parseJobrightAlert("", RECEIVED, "g")).toEqual([]);
  });

  it("falls back on the title's own link, and never borrows the previous card's id", () => {
    const noWrapper = alertHtml([
      card({ id: IDS.a, company: "First", title: "One", age: "1 hour ago" }),
      card({ id: IDS.b, company: "Second", title: "Two", age: "1 hour ago", wrapperLink: false }),
    ]);
    expect(parseJobrightAlert(noWrapper, RECEIVED, "g").map((p) => [p.company, p.sourceId])).toEqual([
      ["First", IDS.a],
      ["Second", IDS.b],
    ]);
  });

  it("keeps text that follows a nested tag of the same name", () => {
    const nested = alertHtml([
      `<a href="https://jobright.ai/jobs/info/${IDS.d}"><table id="job-section"><tr><td>
        <span id="job-company-name">Nest Co</span>
        <span id="job-match-percentage"><span>72</span>%</span>
        <a id="job-title" href="x">Intern, <b>Platform</b></a>
      </td></tr></table></a>`,
    ]);
    expect(parseJobrightAlert(nested, RECEIVED, "g")[0]).toMatchObject({ company: "Nest Co", matchPct: 72, role: "Intern, Platform" });
  });
});
