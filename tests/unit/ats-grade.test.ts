import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  GRADE_BANDS,
  SEVERITY_PENALTY,
  flattenEntriesReview,
  flattenSectionReview,
  gradeSections,
} from "@/lib/atsGrade";
import { buildAtsReport, sectionId } from "@/lib/atsReport";
import type { AtsIssue, IssueCode } from "@/lib/atsReview";
import { SAMPLE_RESUMES } from "@/lib/samples";
import type { AtsParseResult } from "@/lib/types";

const issue = (severity: AtsIssue["severity"], code: IssueCode = "MISSING"): AtsIssue => ({ code, severity });
const many = (n: number, severity: AtsIssue["severity"], code?: IssueCode) => Array.from({ length: n }, () => issue(severity, code));
const section = (label: string, ...issues: AtsIssue[]) => ({ label, issues });

describe("penalties and bands", () => {
  it("pins the weights", () => {
    // info is a note, not a deduction (commit "Set info warning to 0 penalty")
    expect(SEVERITY_PENALTY).toEqual({ critical: 10, minor: 3, info: 0 });
  });

  it("bands run from best to worst and end in a catch-all", () => {
    const mins = GRADE_BANDS.map((b) => b.min);
    expect(mins).toEqual([85, 70, 40, -Infinity]);
    expect(GRADE_BANDS.map((b) => b.label)).toEqual([
      "ATS-ready",
      "Recommend fixes",
      "Significant issues",
      "Needs major, major cleanup",
    ]);
  });

  describe("score -> band, at every edge", () => {
    // penalty = 100 - score, built from the weights above
    const at = (critical: number, minor: number) => gradeSections([section("s", ...many(critical, "critical"), ...many(minor, "minor"))]);
    it.each([
      [100, 0, 0, "ATS-ready"],
      [85, 0, 5, "ATS-ready"],
      [84, 1, 2, "Recommend fixes"],
      [70, 3, 0, "Recommend fixes"],
      [69, 1, 7, "Significant issues"],
      [40, 6, 0, "Significant issues"],
      [39, 4, 7, "Needs major, major cleanup"],
      [0, 10, 0, "Needs major, major cleanup"],
    ])("score %i (%i critical, %i minor) is '%s'", (score, critical, minor, label) => {
      const g = at(critical, minor);
      expect(g.score).toBe(score);
      expect(g.band.label).toBe(label);
    });
    it("tones follow the bands", () => {
      expect(at(0, 0).band.tone).toBe("good");
      expect(at(3, 0).band.tone).toBe("warn");
      expect(at(6, 0).band.tone).toBe("bad");
    });
    it("every possible score lands in a band", () => {
      fc.assert(
        fc.property(fc.integer({ min: -500, max: 100 }), (score) => {
          expect(GRADE_BANDS.find((b) => score >= b.min)).toBeDefined();
        })
      );
    });
  });

  it("the score is deliberately not floored", () => {
    const g = gradeSections([section("s", ...many(20, "critical"))]);
    expect(g.score).toBe(-100);
    expect(g.band.label).toBe("Needs major, major cleanup");
  });
});

describe("gradeSections", () => {
  it("an empty review is a perfect score", () => {
    const g = gradeSections([section("A"), section("B")]);
    expect(g).toMatchObject({ score: 100, penalty: 0, counts: { critical: 0, minor: 0, info: 0 }, byCode: [] });
    expect(g.band.label).toBe("ATS-ready");
    expect(gradeSections([])).toMatchObject({ score: 100, sections: [] });
  });

  it("every occurrence counts", () => {
    expect(gradeSections([section("s", ...many(5, "minor"))]).penalty).toBe(15);
  });

  it("info never changes the score", () => {
    expect(gradeSections([section("s", ...many(50, "info"))]).score).toBe(100);
  });

  it("totals across sections and keeps each section's own", () => {
    const g = gradeSections([
      section("Contact", ...many(2, "critical"), issue("info")),
      section("Work", ...many(3, "minor")),
      section("Empty"),
    ]);
    expect(g.counts).toEqual({ critical: 2, minor: 3, info: 1 });
    expect(g.penalty).toBe(29);
    expect(g.score).toBe(71);
    expect(g.sections).toEqual([
      { label: "Contact", counts: { critical: 2, minor: 0, info: 1 }, penalty: 20 },
      { label: "Work", counts: { critical: 0, minor: 3, info: 0 }, penalty: 9 },
      { label: "Empty", counts: { critical: 0, minor: 0, info: 0 }, penalty: 0 },
    ]);
  });

  it("keeps sections in the order given", () => {
    expect(gradeSections([section("Z"), section("A")]).sections.map((s) => s.label)).toEqual(["Z", "A"]);
  });

  describe("byCode", () => {
    it("lists only the codes that occurred, biggest penalty first", () => {
      const g = gradeSections([
        section("a", ...many(1, "critical", "MISSING"), ...many(4, "minor", "WRONG_SPLIT"), ...many(2, "minor", "DUPLICATE")),
        section("b", issue("critical", "WRONG_SPLIT")),
      ]);
      expect(g.byCode.map((c) => [c.code, c.penalty])).toEqual([
        ["WRONG_SPLIT", 22], // 1 critical + 4 minor, merged across sections
        ["MISSING", 10],
        ["DUPLICATE", 6],
      ]);
      expect(g.byCode[0].counts).toEqual({ critical: 1, minor: 4, info: 0 });
    });
    it("ties go alphabetically, so the order is stable", () => {
      const g = gradeSections([section("s", issue("minor", "WRONG_SPLIT"), issue("minor", "DUPLICATE"), issue("minor", "MISSING"))]);
      expect(g.byCode.map((c) => c.code)).toEqual(["DUPLICATE", "MISSING", "WRONG_SPLIT"]);
    });
    it("info-only codes show up last with no penalty", () => {
      const g = gradeSections([section("s", issue("info", "DUPLICATE"), issue("minor", "MISSING"))]);
      expect(g.byCode.map((c) => [c.code, c.penalty])).toEqual([["MISSING", 3], ["DUPLICATE", 0]]);
    });
  });

  it("always adds up, whatever the issues", () => {
    const sev = fc.constantFrom<AtsIssue["severity"]>("critical", "minor", "info");
    const code = fc.constantFrom<IssueCode>("MISSING", "DUPLICATE", "WRONG_SPLIT", "TRUNCATED");
    const one = fc.record({ severity: sev, code });
    fc.assert(
      fc.property(fc.array(fc.array(one, { maxLength: 8 }), { maxLength: 6 }), (groups) => {
        const g = gradeSections(groups.map((issues, i) => section(`s${i}`, ...issues)));
        const total = groups.flat();
        expect(g.score).toBe(100 - g.penalty);
        expect(g.penalty).toBeGreaterThanOrEqual(0);
        expect(g.counts.critical + g.counts.minor + g.counts.info).toBe(total.length);
        expect(g.sections.reduce((n, s) => n + s.penalty, 0)).toBe(g.penalty);
        expect(g.byCode.reduce((n, c) => n + c.penalty, 0)).toBe(g.penalty);
        expect(g.byCode.reduce((n, c) => n + c.counts.critical + c.counts.minor + c.counts.info, 0)).toBe(total.length);
      })
    );
  });
});

describe("flattening reviews", () => {
  const a = issue("critical", "MISSING");
  const b = issue("minor", "DUPLICATE");
  const c = issue("info", "WRONG_SPLIT");

  it("flattenSectionReview: section issues first, then every field's", () => {
    expect(flattenSectionReview({ section: [c], fields: { emails: [a], phoneNumbers: [b, b], websites: undefined } })).toEqual([c, a, b, b]);
    expect(flattenSectionReview({ section: [], fields: {} })).toEqual([]);
  });

  it("flattenEntriesReview: field-map entries and plain-list entries both work", () => {
    expect(
      flattenEntriesReview({
        section: [c],
        entries: [{ title: [a], description: [b] }, {}, [a, b]],
      })
    ).toEqual([c, a, b, a, b]);
    expect(flattenEntriesReview({ section: [], entries: [] })).toEqual([]);
    expect(flattenEntriesReview({ section: [], entries: [[], {}] })).toEqual([]);
  });
});

describe("sectionId", () => {
  it.each([
    ["Work experience", "section-work-experience"],
    ["Personal info", "section-personal-info"],
    ["Parse quality", "section-parse-quality"],
    ["Contact", "section-contact"],
    ["Skills", "section-skills"],
    ["Raw output", "section-raw-output"],
    ["A / B & C", "section-a-b-c"],
  ])("%j -> %s", (label, id) => expect(sectionId(label)).toBe(id));
});

describe("buildAtsReport", () => {
  const empty: AtsParseResult = {
    data: {
      contact: {},
      person: {},
      education: [],
      workExperience: [],
      projects: [],
      skills: [],
      achievements: [],
      rawText: "",
    },
  };

  it("grades the seven sections in page order", () => {
    expect(buildAtsReport(empty).grade.sections.map((s) => s.label)).toEqual([
      "Parse quality",
      "Personal info",
      "Contact",
      "Education",
      "Work experience",
      "Projects",
      "Achievements",
    ]);
  });

  it("an empty parse is graded on what's missing", () => {
    const r = buildAtsReport(empty);
    expect(r.grade.sections.map((s) => [s.label, s.penalty])).toEqual([
      ["Parse quality", 0],
      ["Personal info", 30], // no first name, last name or location
      ["Contact", 20], // no email, no phone
      ["Education", 10],
      ["Work experience", 0],
      ["Projects", 0],
      ["Achievements", 0],
    ]);
    expect(r.grade.score).toBe(40);
    expect(r.grade.band.label).toBe("Significant issues");
  });

  it("fills in defaults for parts the parser left out", () => {
    const sparse = { data: { rawText: undefined } } as unknown as AtsParseResult;
    const r = buildAtsReport(sparse);
    expect(r.contact).toEqual({ emails: [], phoneNumbers: [], websites: [] });
    expect(r.person).toEqual({ name: {}, location: undefined });
    expect([r.education, r.workExperience, r.projects, r.skills, r.achievements]).toEqual([[], [], [], [], []]);
    expect(r.grade.score).toBe(40);
  });

  it("passes the parts through unchanged", () => {
    const result: AtsParseResult = {
      data: {
        ...empty.data,
        skills: [{ name: "Go", text: "Go" }],
        achievements: ["Won a hackathon"],
        workExperience: [{ organization: "Acme", jobTitle: "Intern", description: "x", dateRange: { start: { date: "2025-01-01" } } }],
      },
    };
    const r = buildAtsReport(result);
    expect(r.skills).toEqual([{ name: "Go", text: "Go" }]);
    expect(r.achievements).toEqual(["Won a hackathon"]);
    expect(r.workReview.entries).toEqual([{}]);
    expect(r.achievementsReview.section).toEqual([]);
  });

  it("keeps parse-quality issues (metadata and raw text) in one section", () => {
    const r = buildAtsReport({
      data: { ...empty.data, rawText: "ﬁnance" },
      meta: { document: { extractionQuality: { score: 0.5 } } },
    });
    const parse = r.grade.sections[0];
    expect(parse.counts).toEqual({ critical: 2, minor: 0, info: 0 }); // low quality + ligature
    expect(r.metaIssues).toHaveLength(1);
    expect(r.rawTextIssues).toHaveLength(1);
  });
});

// A snapshot of how the current rules grade the public sample resumes. If a
// rule or weight changes on purpose, update the numbers; if they move
// unexpectedly, a rule changed behavior.
describe("the sample resumes, graded", () => {
  const golden: Record<string, { score: number; band: string; counts: { critical: number; minor: number; info: number }; sections: number[]; byCode: string[] }> = {
    "pragmatic-engineer": {
      score: 47,
      band: "Significant issues",
      counts: { critical: 2, minor: 11, info: 4 },
      sections: [0, 0, 10, 0, 0, 43, 0],
      byCode: ["MISSING:37", "MALFORMED_BLOCK:16", "DUPLICATE:0", "LOW_CONFIDENCE:0"],
    },
    "generic-software-resume": {
      score: 59,
      band: "Significant issues",
      counts: { critical: 2, minor: 7, info: 2 },
      sections: [3, 10, 10, 0, 0, 18, 0],
      byCode: ["MISSING:25", "LINK_TEXT_MISMATCH:10", "ICON_LIGATURE:3", "MALFORMED_BLOCK:3", "DUPLICATE:0"],
    },
    "john-smith": {
      score: 80,
      band: "Recommend fixes",
      counts: { critical: 2, minor: 0, info: 6 },
      sections: [0, 10, 10, 0, 0, 0, 0],
      byCode: ["MISSING:10", "WRONG_SPLIT:10", "LOW_CONFIDENCE:0", "NOT_IN_RAW_TEXT:0"],
    },
    "jane-doe": {
      score: 100,
      band: "ATS-ready",
      counts: { critical: 0, minor: 0, info: 3 },
      sections: [0, 0, 0, 0, 0, 0, 0],
      byCode: ["NOT_IN_RAW_TEXT:0", "WRONG_SPLIT:0"],
    },
  };

  it("covers every sample", () => {
    expect(SAMPLE_RESUMES.map((s) => s.id).sort()).toEqual(Object.keys(golden).sort());
  });

  it.each(SAMPLE_RESUMES.map((s) => [s.id, s] as const))("%s", (id, sample) => {
    const g = buildAtsReport(sample.result).grade;
    const want = golden[id];
    expect({
      score: g.score,
      band: g.band.label,
      counts: g.counts,
      sections: g.sections.map((s) => s.penalty),
      byCode: g.byCode.map((c) => `${c.code}:${c.penalty}`),
    }).toEqual(want);
  });

  it.each(SAMPLE_RESUMES.map((s) => [s.id, s] as const))("%s: a review never mutates the parse", (_id, sample) => {
    const before = JSON.stringify(sample.result);
    buildAtsReport(sample.result);
    expect(JSON.stringify(sample.result)).toBe(before);
  });
});
