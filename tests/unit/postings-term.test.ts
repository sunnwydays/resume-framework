import { describe, expect, it } from "vitest";
import { formatLength, lengthBucket, postingLength, postingTerm } from "@/lib/tracker/postings/term";

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
