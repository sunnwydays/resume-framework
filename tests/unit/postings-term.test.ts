import { describe, expect, it } from "vitest";
import { formatLength, lengthBucket, lengthFromText, postingLength, postingTerm } from "@/lib/tracker/postings/term";

describe("postingTerm", () => {
  it.each([
    ["Software Engineer Intern, Backend (Summer 2027 - Toronto)", "2027-summer", "Summer 2027"],
    ["SWE Intern - Summer 2027", "2027-summer", "Summer 2027"],
    ["[Fall 2026] Data Intern", "2026-fall", "Fall 2026"],
    ["Autumn 2026 Intern", "2026-fall", "Fall 2026"],
    ["Winter 2027 Co-op", "2027-winter", "Winter 2027"],
    ["Spring 2027 Software Intern", "2027-spring", "Spring 2027"],
    ["Software Intern (Summer '27)", "2027-summer", "Summer 2027"],
    ["2027 Summer Software Engineering Intern", "2027-summer", "Summer 2027"],
    ["Intern, Fall/Winter 2026", "2026-fall", "Fall 2026"],
    ["Intern - SUMMER 2027", "2027-summer", "Summer 2027"],
    ["Software Intern (May - August 2027)", "2027-summer", "Summer 2027"],
    ["Software Co-op, Jan-Apr 2027", "2027-winter", "Winter 2027"],
    ["Co-op September to December 2026", "2026-fall", "Fall 2026"],
  ])("%s", (role, key, label) => {
    expect(postingTerm(role)).toMatchObject({ key, label });
  });

  it.each(["Software Engineer Intern", "New Grad Software Engineer 2027", "Summer Intern", "Summer 10 Interns Wanted", "Intern, 2027"])(
    "no term in %j",
    (role) => expect(postingTerm(role)).toBeNull()
  );

  it("orders terms by date, then season", () => {
    const order = (role: string) => postingTerm(role)!.order;
    expect(order("Fall 2026")).toBeLessThan(order("Winter 2027"));
    expect(order("Winter 2027")).toBeLessThan(order("Summer 2027"));
    expect(order("Summer 2027")).toBeLessThan(order("Fall 2027"));
  });
});

describe("postingLength", () => {
  it.each([
    ["Intern (3-4 months)", { min: 3, max: 4 }],
    ["Intern, 4 months", { min: 4, max: 4 }],
    ["Co-op - 8 month term", { min: 8, max: 8 }],
    ["Co-op 12-16 months", { min: 12, max: 16 }],
    ["Co-op, 12 to 16 months", { min: 12, max: 16 }],
    ["Intern, 4-month placement", { min: 4, max: 4 }],
    ["Intern (16 weeks)", { min: 4, max: 4 }],
    ["Intern (12-16 weeks)", { min: 3, max: 4 }],
    ["Summer 2027 Intern - 4 mos", { min: 4, max: 4 }],
  ])("%s", (role, length) => expect(postingLength(role)).toEqual(length));

  it("doesn't read a year or an unrelated number as a length", () => {
    expect(postingLength("Software Intern, Summer 2027")).toBeNull();
    expect(postingLength("Intern 2027 - 2028")).toBeNull();
    expect(postingLength("Software Engineer Intern")).toBeNull();
    expect(postingLength("Intern (36 months)")).toBeNull();
    expect(postingLength("Intern (0 months)")).toBeNull();
  });
});

describe("lengthBucket / formatLength", () => {
  it("buckets by the shortest length the title allows", () => {
    expect(lengthBucket({ min: 3, max: 4 })).toBe("short");
    expect(lengthBucket({ min: 4, max: 8 })).toBe("short");
    expect(lengthBucket({ min: 5, max: 8 })).toBe("medium");
    expect(lengthBucket({ min: 8, max: 8 })).toBe("medium");
    expect(lengthBucket({ min: 12, max: 16 })).toBe("long");
    expect(lengthBucket(null)).toBe("unstated");
  });

  it("formats", () => {
    expect(formatLength({ min: 4, max: 4 })).toBe("4 mo");
    expect(formatLength({ min: 3, max: 4 })).toBe("3–4 mo");
  });
});

describe("postingTerm: a season with no year", () => {
  // Alert seen in October 2026.
  const seenAt = new Date(2026, 9, 4, 12).toISOString();

  it.each([
    ["Intern, AI/ML Platform (Winter)", "2027-winter"],
    ["Software Intern [Winter]", "2027-winter"],
    ["Winter Co-op, Platform", "2027-winter"],
    ["Software Intern - Summer", "2027-summer"],
    ["Co-op Fall", "2026-fall"],
  ])("%s -> %s", (role, key) => {
    expect(postingTerm(role, { seenAt })?.key).toBe(key);
  });

  it("takes the year from when the alert arrived", () => {
    expect(postingTerm("Intern (Winter)", { seenAt: new Date(2027, 0, 5).toISOString() })?.key).toBe("2027-winter");
    expect(postingTerm("Intern (Winter)", { seenAt: new Date(2026, 11, 20).toISOString() })?.key).toBe("2027-winter");
    expect(postingTerm("Intern (Summer)", { seenAt: new Date(2027, 1, 1).toISOString() })?.key).toBe("2027-summer");
  });

  it("needs a bracket or a work-term word, and a date to count from", () => {
    expect(postingTerm("Fall Protection Engineer", { seenAt })).toBeNull();
    expect(postingTerm("Summer Associate Lawyer", { seenAt })).toBeNull();
    expect(postingTerm("Intern (Winter)")).toBeNull();
    expect(postingTerm("Intern (Winter)", { seenAt: "not a date" })).toBeNull();
  });

  it("a year in the title beats everything else", () => {
    expect(postingTerm("Intern (Summer 2027)", { seenAt, startText: "Start in 2027 Winter" })?.key).toBe("2027-summer");
  });
});

describe("postingTerm: the posting page's start line", () => {
  it("is read when the title says nothing", () => {
    expect(postingTerm("Intern Developer, AI Solutions", { startText: "Start in 2027 Winter" })).toMatchObject({
      key: "2027-winter",
      label: "Winter 2027",
    });
  });

  it("beats a bare season guessed from the title", () => {
    const seenAt = new Date(2026, 9, 4).toISOString();
    expect(postingTerm("Intern (Fall)", { seenAt, startText: "Start in 2027 Fall" })?.key).toBe("2027-fall");
  });

  it("ignores a start line that names no term", () => {
    expect(postingTerm("Intern", { startText: "Start immediately" })).toBeNull();
  });
});

describe("lengthFromText", () => {
  it.each([
    ["This is a full-time, 8, or 12-month position, starting January 2027", { min: 8, max: 12 }],
    ["16-week internship program running January 4th–April 23rd, 2027.", { min: 4, max: 4 }],
    ["This is a 4 month internship", { min: 4, max: 4 }],
    ["The internship duration is 12 to 16 months.", { min: 12, max: 16 }],
    ["Length of term: 4, 8 or 12 months", { min: 4, max: 12 }],
    ["Work term: 8 month co-op", { min: 8, max: 8 }],
  ])("%s", (text, length) => expect(lengthFromText(text)).toEqual(length));

  it.each([
    "must be a recent or upcoming graduate within 12 months of the placement end date",
    "5+ years of experience; 6 months of Python",
    "Starting January 2027",
    "You will report to the manager every 2 weeks",
  ])("not a length: %s", (text) => expect(lengthFromText(text)).toBeNull());
});

describe("postingLength: the title first, then the page", () => {
  it("falls back to the page's sentence", () => {
    expect(postingLength("Intern Developer", "This is a full-time, 8, or 12-month position")).toEqual({ min: 8, max: 12 });
    expect(postingLength("Intern (4 months)", "This is a 12-month position")).toEqual({ min: 4, max: 4 });
    expect(postingLength("Intern Developer", null)).toBeNull();
  });
});
