import { describe, expect, it } from "vitest";
import {
  findMinutes,
  formatSections,
  keepNotes,
  moveItem,
  nextDuration,
  parseSections,
  sectionsOf,
  sectionText,
  setSectionNotes,
  totalMinutes,
  type Section,
} from "@/lib/tracker/sections";

const counter = () => {
  let n = 0;
  return () => `id${++n}`;
};
const parse = (text: string) => parseSections(text, counter());

// Drops ids, so shapes can be compared.
const shape = (sections: Section[]): unknown =>
  sections.map(({ title, minutes, details, notes, parts }) => ({ title, minutes, details, notes, parts: shape(parts) }));

const sec = (title: string, extra: Partial<Section> = {}): Section => ({
  id: title,
  title,
  minutes: null,
  details: null,
  notes: null,
  parts: [],
  ...extra,
});

// Same shape as a real multi-part OA invite, made-up wording.
const INVITE = [
  "There are 3 types of exercises in the assessment:",
  "",
  "Coding Challenge – this timed section takes 100 minutes, solve two coding problems. One will be a classic algorithm question, and in the other you will have access to an AI pair programmer in a sample repository.",
  "Work Simulation – typically takes 45 minutes, work through engineering decisions and scenarios from the team.",
  "Work Style Survey – typically takes 6 minutes - answer questions about how you approach work in general.",
].join("\n");

describe("parseSections", () => {
  it("reads a pasted invite breakdown into sections, minutes, details and sub-parts", () => {
    const s = parse(INVITE);
    expect(shape(s)).toEqual([
      {
        title: "Coding Challenge",
        minutes: 100,
        details:
          "Solve two coding problems. One will be a classic algorithm question, and in the other you will have access to an AI pair programmer in a sample repository.",
        notes: null,
        parts: [
          { title: "Classic algorithm question", minutes: null, details: null, notes: null, parts: [] },
          { title: "AI pair programmer in a sample repository", minutes: null, details: null, notes: null, parts: [] },
        ],
      },
      {
        title: "Work Simulation",
        minutes: 45,
        details: "Work through engineering decisions and scenarios from the team.",
        notes: null,
        parts: [],
      },
      {
        title: "Work Style Survey",
        minutes: 6,
        details: "Answer questions about how you approach work in general.",
        notes: null,
        parts: [],
      },
    ]);
    // The sub-parts have no minutes of their own; the section's 100 counts.
    expect(totalMinutes(s)).toBe(151);
  });

  it("drops a leading time clause from the details, but not a time that starts a phrase", () => {
    const details = (line: string) => parse(line)[0].details;
    expect(details("Coding – this timed section takes 90 minutes, solve one problem")).toBe("Solve one problem");
    expect(details("Coding – lasts about 1.5 hours: three problems")).toBe("Three problems");
    expect(details("Debugging – 20 min, fix the bugs")).toBe("Fix the bugs");
    expect(details("Debugging – about 20 minutes")).toBeNull();
    expect(details("Pairing – 2 hours of pair programming with an engineer")).toBe("2 hours of pair programming with an engineer");
    expect(details("Coding – Two problems")).toBe("Two problems");
  });

  it("skips intro text and treats a different bullet style as sub-parts", () => {
    const s = parse(
      [
        "Your assessment has the following parts:",
        "• Coding (90 min)",
        "   ◦ Problem 1",
        "   ◦ Problem 2",
        "• Debugging – about 20 minutes",
        "Fix as many bugs as you can.",
      ].join("\n")
    );
    expect(shape(s)).toEqual([
      {
        title: "Coding",
        minutes: 90,
        details: null,
        notes: null,
        parts: [
          { title: "Problem 1", minutes: null, details: null, notes: null, parts: [] },
          { title: "Problem 2", minutes: null, details: null, notes: null, parts: [] },
        ],
      },
      { title: "Debugging", minutes: 20, details: "Fix as many bugs as you can.", notes: null, parts: [] },
    ]);
  });

  it("keeps a colon or hyphen inside a title when what follows is only a name or a time", () => {
    expect(shape(parse("Part 1: Coding (60 min)\nBehavioral - 30 minutes"))).toEqual([
      { title: "Part 1: Coding", minutes: 60, details: null, notes: null, parts: [] },
      { title: "Behavioral", minutes: 30, details: null, notes: null, parts: [] },
    ]);
  });

  it("reads plain short lines as sections and numbered lists as one level", () => {
    expect(parse("1. Logic\n2. Numerical\n3. Verbal").map((s) => s.title)).toEqual(["Logic", "Numerical", "Verbal"]);
    expect(parse("")).toEqual([]);
  });
});

describe("findMinutes", () => {
  it.each([
    ["takes 100 minutes", 100],
    ["1.5 hours", 90],
    ["1h 30m", 90],
    ["2 hours and 15 minutes", 135],
    ["45 min", 45],
    ["60-90 minutes", 90],
    ["Ref: 131999", null],
    ["you must finish", null],
  ])("%s -> %s", (input, want) => {
    expect(findMinutes(input)).toBe(want);
  });
});

describe("formatSections / parseSections round trip", () => {
  it("reads back what it writes, notes and sub-parts included", () => {
    const sections: Section[] = [
      sec("Coding Challenge", {
        minutes: 100,
        details: "Two problems, one with an AI assistant",
        notes: "Ran out of time on the second",
        parts: [sec("Code writing", { minutes: 50 }), sec("AI assistant in a repo", { notes: "It kept rewriting my tests" })],
      }),
      sec("Part 2: Simulation", { minutes: 45 }),
      sec("Survey"),
    ];
    const text = formatSections(sections);
    expect(text).toBe(
      [
        "Coding Challenge (100 min) – Two problems, one with an AI assistant",
        "  Notes: Ran out of time on the second",
        "  - Code writing (50 min)",
        "  - AI assistant in a repo",
        "    Notes: It kept rewriting my tests",
        "Part 2: Simulation (45 min)",
        "Survey",
      ].join("\n")
    );
    expect(shape(parse(text))).toEqual(shape(sections));
  });
});

describe("sectionsOf", () => {
  it("drops malformed entries and a third level, and gives stable ids to ones without", () => {
    const s = sectionsOf([
      { title: " A ", minutes: 10.4, parts: [{ title: "a1", parts: [{ title: "too deep" }] }] },
      { title: "" },
      "nope",
      null,
      { id: "keep", title: "B", minutes: -5, details: "  ", notes: "n" },
    ]);
    expect(s).toEqual([
      { id: "s0", title: "A", minutes: 10, details: null, notes: null, parts: [{ id: "s0.0", title: "a1", minutes: null, details: null, notes: null, parts: [] }] },
      { id: "keep", title: "B", minutes: null, details: null, notes: "n", parts: [] },
    ]);
    expect(sectionsOf(null)).toEqual([]);
    expect(sectionsOf({ title: "x" })).toEqual([]);
  });
});

describe("totalMinutes", () => {
  it("uses a section's own minutes, else its parts', and is null when nothing says", () => {
    expect(totalMinutes([sec("a", { minutes: 30 }), sec("b", { parts: [sec("b1", { minutes: 10 }), sec("b2", { minutes: 5 })] })])).toBe(45);
    expect(totalMinutes([sec("a"), sec("b")])).toBeNull();
    expect(totalMinutes([])).toBeNull();
  });
});

describe("nextDuration", () => {
  const before = [sec("a", { minutes: 30 })];
  const after = [sec("a", { minutes: 30 }), sec("b", { minutes: 15 })];
  it("follows the sections' total while blank or still equal to the old total", () => {
    expect(nextDuration(null, [], after)).toBe(45);
    expect(nextDuration(30, before, after)).toBe(45);
  });
  it("keeps a number typed by hand, and keeps the old one when the new sections say nothing", () => {
    expect(nextDuration(60, before, after)).toBe(60);
    expect(nextDuration(30, before, [sec("x")])).toBe(30);
    expect(nextDuration(null, [], [])).toBeNull();
  });
});

describe("notes", () => {
  it("keepNotes takes the saved notes by id and leaves new sections alone", () => {
    const current = [sec("a", { notes: "saved", parts: [sec("a1", { notes: "part saved" })] })];
    const next = [sec("a", { title: "A renamed", notes: "stale", parts: [sec("a1"), sec("new", { notes: "x" })] })];
    const kept = keepNotes(next, current);
    expect(kept[0].title).toBe("A renamed");
    expect(kept[0].notes).toBe("saved");
    expect(kept[0].parts.map((p) => p.notes)).toEqual(["part saved", "x"]);
  });

  it("setSectionNotes changes one section or sub-part", () => {
    const s = [sec("a", { parts: [sec("a1")] }), sec("b")];
    expect(setSectionNotes(s, "a1", "hi")[0].parts[0].notes).toBe("hi");
    expect(setSectionNotes(s, "b", "yo")[1].notes).toBe("yo");
    expect(s[1].notes).toBeNull();
  });
});

describe("helpers", () => {
  it("moveItem swaps neighbors and ignores moves off the ends", () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  it("sectionText lists every title, details and notes", () => {
    expect(sectionText([sec("a", { details: "d", parts: [sec("a1", { notes: "n" })] })])).toEqual(["a", "d", "a1", "n"]);
  });
});
