import { describe, expect, it } from "vitest";
import {
  DEFAULT_ISSUE_MESSAGES,
  issueMessage,
  reviewAchievements,
  reviewContact,
  reviewEducation,
  reviewEducationEntry,
  reviewMeta,
  reviewPerson,
  reviewProjects,
  reviewRawText,
  reviewWorkExperience,
  reviewWorkExperiences,
  type AtsIssue,
} from "@/lib/atsReview";
import type { AtsContact, AtsEducation, AtsPerson, AtsProject, AtsWorkExperience } from "@/lib/types";

const codes = (issues: AtsIssue[] | undefined) => (issues ?? []).map((i) => `${i.code}:${i.severity}`);
const only = (issues: AtsIssue[] | undefined) => {
  expect(issues).toHaveLength(1);
  return issues![0];
};

describe("issueMessage", () => {
  it("prefers the specific message, else the code's default", () => {
    expect(issueMessage({ code: "MISSING", severity: "info" })).toBe("Missing");
    expect(issueMessage({ code: "MISSING", severity: "info", message: "No LinkedIn URL" })).toBe("No LinkedIn URL");
  });
  it("has a default for every code", () => {
    for (const message of Object.values(DEFAULT_ISSUE_MESSAGES)) expect(message).toBeTruthy();
  });
});

// ---------------------------------------------------------------- person

describe("reviewPerson", () => {
  const ok: AtsPerson = { name: { given: "Sunny", family: "Lee" }, location: { city: "Toronto", state: "ON" } };
  const review = (p: Partial<AtsPerson> | AtsPerson) => reviewPerson({ ...ok, ...p });

  it("a complete person has no issues", () => {
    expect(review({})).toEqual({ section: [], fields: {} });
  });

  describe("names", () => {
    it("a missing given or family name is critical", () => {
      expect(codes(review({ name: { family: "Lee" } }).fields.given)).toEqual(["MISSING:critical"]);
      expect(codes(review({ name: { given: "Sunny" } }).fields.family)).toEqual(["MISSING:critical"]);
    });
    it("a missing or null name misses both", () => {
      for (const name of [null, undefined, {}] as const) {
        const f = review({ name }).fields;
        expect(codes(f.given)).toEqual(["MISSING:critical"]);
        expect(codes(f.family)).toEqual(["MISSING:critical"]);
      }
    });
    it.each(["O'Brien", "O’Brien", "Jean-Luc", "Anne–Marie", "María", "Zoë", "Müller", "Nguyễn", "李", 'Robert "Bob"', "Robert (Bob)"])(
      "accepts %j",
      (given) => expect(review({ name: { given, family: "Lee" } }).fields.given).toBeUndefined()
    );
    it("flags symbols, listing each once", () => {
      const i = only(review({ name: { given: "Sunny2!2", family: "Lee" } }).fields.given);
      expect(i).toMatchObject({ code: "UNEXPECTED_SYMBOL", severity: "minor", message: "Unexpected symbol(s) in given name: 2 !" });
    });
    it("flags a trailing period or comma", () => {
      expect(codes(review({ name: { given: "Sunny", family: "Lee, Jr." } }).fields.family)).toEqual(["UNEXPECTED_SYMBOL:minor"]);
    });
    it("flags unbalanced parentheses (a cut-off legal name)", () => {
      const i = only(review({ name: { given: "Robert (Bob", family: "Lee" } }).fields.given);
      expect(i).toMatchObject({ code: "UNBALANCED_PAREN", severity: "minor", evidence: "…obert (Bob" });
      expect(review({ name: { given: "Robert (Bob)", family: "Lee" } }).fields.given).toBeUndefined();
    });
    it("a single-letter given or family name was split in the wrong place", () => {
      expect(only(review({ name: { given: "R", family: "Lee" } }).fields.given)).toMatchObject({
        code: "WRONG_SPLIT",
        message: "Given name is a single letter",
      });
      expect(only(review({ name: { given: "Rob", family: "W" } }).fields.family)).toMatchObject({
        message: "Family name is a single letter",
      });
    });
    it("but a single-letter middle initial is normal", () => {
      expect(review({ name: { given: "Sunny", middle: "J", family: "Lee" } }).fields.middle).toBeUndefined();
    });
    it("a middle name alongside a multi-word given or family name is a bad split", () => {
      const given = only(review({ name: { given: "Mary Ann", middle: "Q", family: "Lee" } }).fields.given);
      expect(given).toMatchObject({ code: "WRONG_SPLIT", severity: "minor", evidence: "given name: Mary Ann" });
      const both = only(review({ name: { given: "Mary Ann", middle: "Q", family: "Van Der" } }).fields.given);
      expect(both.evidence).toBe("given name: Mary Ann, family name: Van Der");
    });
    it("multi-word names without a middle name are left alone", () => {
      expect(review({ name: { given: "Mary Ann", family: "Van Der" } }).fields).toEqual({});
    });
    it("one field can collect several issues", () => {
      expect(codes(review({ name: { given: "Sunny2(", family: "Lee" } }).fields.given)).toEqual([
        "UNEXPECTED_SYMBOL:minor",
        "UNBALANCED_PAREN:minor",
      ]);
    });
    it("a one-character name is normal in Chinese, Korean and Japanese", () => {
      for (const name of ["李", "王", "김", "あ"]) {
        expect(review({ name: { given: "Wei", family: name } }).fields.family, name).toBeUndefined();
        expect(review({ name: { given: name, family: "Lee" } }).fields.given, name).toBeUndefined();
      }
    });
  });

  describe("location", () => {
    it.each([undefined, {}, { city: "", state: "" }])("none at all (%j) is critical", (location) => {
      const i = only(review({ location }).fields.location);
      expect(i).toMatchObject({ code: "MISSING", severity: "critical" });
      expect(i.message).toBeUndefined();
    });
    it("a missing city is critical, quoting what it did find", () => {
      const i = only(review({ location: { country: "Canada", raw: "Ontario, Canada" } }).fields.location);
      expect(i).toMatchObject({ code: "MISSING", severity: "critical", message: "Missing city", evidence: "Ontario, C…" });
    });
    it("a city is enough; formatted or raw text alone still lacks one", () => {
      expect(review({ location: { city: "Toronto" } }).fields.location).toBeUndefined();
      expect(only(review({ location: { formatted: "Toronto, ON" } }).fields.location).message).toBe("Missing city");
      expect(only(review({ location: { raw: "Toronto" } }).fields.location).message).toBe("Missing city");
    });
  });
});

// --------------------------------------------------------------- contact

describe("reviewContact", () => {
  const RAW = [
    "Sunny Lee",
    "Toronto, ON",
    "sunny@gmail.com | 416-555-0100 | linkedin.com/in/sunny",
    "",
    "EXPERIENCE",
  ].join("\n");
  const phone = { raw: "416-555-0100", nationalNumber: "4165550100", formatted: "+1 416 555 0100" };
  const linkedin = { url: "https://linkedin.com/in/sunny", domain: "linkedin.com/in/sunny", type: "linkedin" };
  const ok: AtsContact = { emails: ["sunny@gmail.com"], phoneNumbers: [phone], websites: [linkedin] };
  const review = (c: Partial<AtsContact>, raw = RAW) => reviewContact({ ...ok, ...c }, raw);

  it("a complete contact block has no issues", () => {
    expect(review({})).toEqual({ section: [], fields: {} });
  });

  describe("what's missing", () => {
    it("no email or phone is critical", () => {
      expect(codes(review({ emails: [] }).fields.emails)).toEqual(["MISSING:critical"]);
      expect(codes(review({ phoneNumbers: [] }).fields.phoneNumbers)).toEqual(["MISSING:critical"]);
    });
    it("no websites is only advice", () => {
      const i = only(review({ websites: [] }).fields.websites);
      expect(i).toMatchObject({ code: "MISSING", severity: "info" });
      expect(i.fix).toContain("LinkedIn");
    });
    it("websites without a LinkedIn one get a nudge", () => {
      const site = { url: "https://sunny.dev", domain: "sunny.dev", type: "personal" };
      const issues = review({ websites: [site] }, `${RAW}\nsunny.dev`).fields.websites;
      expect(issues).toHaveLength(1);
      expect(issues![0]).toMatchObject({ code: "MISSING", severity: "info", message: "No LinkedIn URL" });
    });
    it("copes with undefined lists", () => {
      const r = reviewContact({}, "");
      expect(codes(r.fields.emails)).toEqual(["MISSING:critical"]);
      expect(codes(r.fields.phoneNumbers)).toEqual(["MISSING:critical"]);
    });
  });

  describe("emails", () => {
    it("rejects an address that isn't one", () => {
      expect(codes(review({ emails: ["sunny@gmail"] }, "sunny@gmail").fields.emails)).toContain("INVALID_FORMAT:critical");
    });
    it("an icon name glued on the front is critical", () => {
      const raw = "Sunny Lee\nEnvelopesunny@gmail.com";
      const issues = review({ emails: ["Envelopesunny@gmail.com"] }, raw).fields.emails;
      expect(issues![0]).toMatchObject({ code: "ICON_LIGATURE", severity: "critical", evidence: "Envelopesunny@gmail.com" });
    });
    it("tolerates spaces the parser added to the raw text", () => {
      expect(review({}, "Sunny\nsu nny@gma il.com\n").fields.emails).toBeUndefined();
    });
    it("a space inside a truncated address is a critical split", () => {
      const issues = review({ emails: ["nny@gmail.com"] }, "Sunny\nsu nny@gmail.com").fields.emails;
      expect(only(issues)).toMatchObject({
        code: "WRONG_SPLIT",
        severity: "critical",
        message: "Email has space(s) in the extracted text",
        evidence: "su nny@gmail.com",
      });
    });
    it("the same without a space is just a mismatch", () => {
      const issues = review({ emails: ["nny@gmail.com"] }, "Sunny\nsunny@gmail.com").fields.emails;
      expect(only(issues)).toMatchObject({ code: "TRUNCATED", severity: "minor" });
    });
    it("a domain nowhere in the raw text is flagged", () => {
      const issues = review({ emails: ["sunny@yahoo.com"] }).fields.emails;
      expect(only(issues)).toMatchObject({ code: "NOT_IN_RAW_TEXT", severity: "minor", evidence: "sunny@yahoo.com" });
    });
    it("only the first 8 lines count as the header", () => {
      const raw = [...Array(8).fill("filler"), "sunny@gmail.com"].join("\n");
      expect(codes(review({}, raw).fields.emails)).toEqual(["NOT_IN_RAW_TEXT:minor"]);
    });

    describe("text and link disagree", () => {
      const emails = ["sunny@gmail.com", "placeholder@example.com"];
      it("reports one critical finding, not two loose ones", () => {
        const issues = review({ emails }).fields.emails;
        expect(only(issues)).toMatchObject({
          code: "LINK_TEXT_MISMATCH",
          severity: "critical",
          evidence: "visible: sunny@gmail.com, linked: placeholder@example.com",
        });
      });
      it("needs exactly one visible and one hidden address", () => {
        const three = review({ emails: [...emails, "other@elsewhere.com"] }).fields.emails;
        expect(codes(three)).not.toContain("LINK_TEXT_MISMATCH:critical");
        expect(codes(three)).toContain("NOT_IN_RAW_TEXT:minor");
        expect(codes(review({ emails: ["sunny@gmail.com", "sunny@gmail.com"] }).fields.emails)).toEqual([]);
      });
    });
  });

  describe("phone numbers", () => {
    const phones = (raw: string, extra: object = {}, text = RAW) =>
      review({ phoneNumbers: [{ raw, ...extra }] }, text).fields.phoneNumbers;
    it.each(["123", "12345", "1234567890123456"])("a number with the wrong digit count is critical: %s", (raw) => {
      expect(codes(phones(raw, {}, `${RAW}\n${raw}`))).toEqual(["INVALID_FORMAT:critical"]);
    });
    it("accepts 7 to 15 digits", () => {
      expect(phones("555-0100", {}, `${RAW}\n555-0100`)).toBeUndefined();
      expect(phones("+1 416 555 0100 12", {}, `${RAW}\n+1 416 555 0100 12`)).toBeUndefined();
    });
    it("a normalized number that doesn't end the raw digits is truncated", () => {
      expect(codes(phones(phone.raw, { nationalNumber: "4165559999" }))).toEqual(["TRUNCATED:minor"]);
    });
    it("not found in the header is only a note", () => {
      expect(only(phones("905-555-0199", {}, RAW))).toMatchObject({ code: "NOT_IN_RAW_TEXT", severity: "info" });
    });
  });

  describe("websites", () => {
    it("a malformed URL", () => {
      const site = { url: "linkedin.com/in/sunny", domain: "linkedin.com/in/sunny", type: "linkedin" };
      expect(codes(review({ websites: [site] }).fields.websites)).toEqual(["INVALID_FORMAT:minor"]);
    });
    it("a link that isn't visible anywhere is a note about hyperlinks", () => {
      const site = { url: "https://github.com/sunny/repo", domain: "github.com/sunny/repo", type: "github" };
      const issues = review({ websites: [linkedin, site] }).fields.websites;
      expect(only(issues)).toMatchObject({ code: "NOT_IN_RAW_TEXT", severity: "info", evidence: site.url });
    });
    it("the same URL twice", () => {
      const issues = review({ websites: [linkedin, linkedin] }).fields.websites;
      expect(only(issues)).toMatchObject({ code: "DUPLICATE", severity: "info" });
    });
    it("searches the whole document, not just the header", () => {
      const site = { url: "https://sunny.dev/x", domain: "sunny.dev/x", type: "personal" };
      const raw = `${RAW}\n${"filler\n".repeat(20)}see sunny.dev/x`;
      expect(codes(review({ websites: [linkedin, site] }, raw).fields.websites)).toEqual([]);
    });
    it("ignores a trailing slash on the domain", () => {
      const site = { url: "https://sunny.dev/", domain: "sunny.dev/", type: "personal" };
      expect(codes(review({ websites: [linkedin, site] }, `${RAW}\nsunny.dev`).fields.websites)).toEqual([]);
    });
  });

  describe("icon-font glyph names in the header", () => {
    const raw = ["Sunny Lee", "Envelope sunny@gmail.com | Phone 416-555-0100", "github.com/sunny | linkedin.com/in/sunny"].join("\n");
    it("flags them once, as a section issue", () => {
      const issues = review({}, raw).section;
      expect(only(issues)).toMatchObject({
        code: "ICON_LIGATURE",
        severity: "minor",
        message: "Icon-font glyph names found in the contact line: Envelope, Phone",
      });
    });
    it("doesn't mistake real addresses for glyph names (github.com, linkedin.com/...)", () => {
      const clean = ["Sunny Lee", "github.com/sunny | linkedin.com/in/sunny | sunny@gmail.com"].join("\n");
      expect(review({}, clean).section).toEqual([]);
    });
    it("leaves a glyph glued to an email to that email's own issue", () => {
      const glued = "Sunny\nEnvelopesunny@gmail.com";
      const r = review({ emails: ["Envelopesunny@gmail.com"] }, glued);
      expect(r.section).toEqual([]);
      expect(codes(r.fields.emails)).toContain("ICON_LIGATURE:critical");
    });
  });
});

// ---------------------------------------------------------- work & projects

describe("reviewWorkExperience", () => {
  const ok: AtsWorkExperience = {
    organization: "Acme",
    jobTitle: "Intern",
    description: "Built things",
    dateRange: { start: { date: "2025-05-01" } },
  };
  const review = (o: Partial<AtsWorkExperience>) => reviewWorkExperience({ ...ok, ...o });

  it("a complete entry has no issues", () => {
    expect(review({})).toEqual({});
  });
  it.each(["", "   "])("a blank organization (%j) means the entry was mis-parsed", (organization) => {
    expect(only(review({ organization }).organization)).toMatchObject({
      code: "MALFORMED_BLOCK",
      severity: "critical",
      message: "Missing organization",
    });
  });
  it.each(["", "   "])("a blank job title (%j) means the entry was mis-parsed", (jobTitle) => {
    expect(only(review({ jobTitle }).jobTitle)).toMatchObject({ code: "MALFORMED_BLOCK", severity: "critical" });
  });
  it("a missing start date is critical, an end date alone doesn't help", () => {
    expect(only(review({ dateRange: undefined }).dateRange)).toMatchObject({ code: "MISSING", severity: "critical" });
    expect(codes(review({ dateRange: { end: { date: "2025-08-01" } } }).dateRange)).toEqual(["MISSING:critical"]);
  });
  it.each([undefined, "", "  \n "])("a missing description (%j) is minor", (description) => {
    expect(only(review({ description }).description)).toMatchObject({ code: "MISSING", severity: "minor" });
  });
  it("reports every problem on a hollow entry", () => {
    const f = reviewWorkExperience({ organization: "", jobTitle: "" });
    expect(Object.keys(f).sort()).toEqual(["dateRange", "description", "jobTitle", "organization"]);
  });
  it("the list review is parallel to the list", () => {
    const r = reviewWorkExperiences([ok, { organization: "", jobTitle: "x" }]);
    expect(r.section).toEqual([]);
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]).toEqual({});
    expect(r.entries[1].organization).toBeDefined();
    expect(reviewWorkExperiences([])).toEqual({ section: [], entries: [] });
  });
});

describe("reviewProjects", () => {
  const date = { start: { date: "2025-01-01" } };
  const project = (title: string, extra: Partial<AtsProject> = {}): AtsProject => ({
    title,
    description: "Built a thing with care",
    dateRange: date,
    ...extra,
  });

  it("a complete project has no issues", () => {
    expect(reviewProjects([project("ECE Pathmaker")])).toEqual({ section: [], entries: [{}] });
  });

  it("an empty list has nothing to say", () => {
    expect(reviewProjects([])).toEqual({ section: [], entries: [] });
  });

  it("a missing title is critical", () => {
    const f = reviewProjects([project("", {})]).entries[0];
    expect(only(f.title)).toMatchObject({ code: "MALFORMED_BLOCK", severity: "critical", message: "Missing title" });
  });

  it("a missing description or start date is minor", () => {
    const f = reviewProjects([project("Alpha", { description: undefined, dateRange: undefined })]).entries[0];
    expect(codes(f.description)).toEqual(["MISSING:minor"]);
    expect(codes(f.dateRange)).toEqual(["MISSING:minor"]);
  });

  describe("a title that is really a wrapped bullet", () => {
    it.each([
      ["starts lowercase", "built a scheduler for the lab"],
      ["has more than 8 words", "One Two Three Four Five Six Seven Eight Nine"],
    ])("when it %s", (_why, title) => {
      expect(codes(reviewProjects([project(title)]).entries[0].title)).toEqual(["MALFORMED_BLOCK:minor"]);
    });
    it("when another entry's description contains it", () => {
      const list = [project("Alpha", { description: "Used Redis for caching and queues" }), project("Redis for caching")];
      expect(codes(reviewProjects(list).entries[1].title)).toContain("MALFORMED_BLOCK:minor");
    });
    it("exactly 8 words is still a title", () => {
      expect(reviewProjects([project("One Two Three Four Five Six Seven Eight")]).entries[0].title).toBeUndefined();
    });
    it.todo("a lowercase brand name (iOS Tracker, eBay clone, npm package) is not a bullet");
  });

  describe("a heading split into two entries", () => {
    const list = [project("ECE Pathmaker"), project("ECE Pathmaker - React, TypeScript", { description: undefined })];
    it("notes the tech-stack copy as a duplicate (info)", () => {
      const f = reviewProjects(list).entries[1];
      expect(f.title).toHaveLength(1);
      expect(f.title![0]).toMatchObject({
        code: "DUPLICATE",
        severity: "info",
        message: 'Duplicate of project "ECE Pathmaker" with the tech stack appended',
      });
    });
    it.each([" - ", " – ", " — ", " | ", ": "])("splits on %j", (sep) => {
      const two = [project("Alpha"), project(`Alpha${sep}Go`, { description: undefined })];
      expect(codes(reviewProjects(two).entries[1].title)).toContain("DUPLICATE:info");
    });
    it("the original entry is left alone", () => {
      expect(reviewProjects(list).entries[0]).toEqual({});
    });
  });

  describe("parser fragments are flagged once, not charged three times", () => {
    it("a repeated title with no content", () => {
      const list = [project("ECE Pathmaker"), project("ECE Pathmaker", { description: undefined })];
      const r = reviewProjects(list);
      expect(codes(r.entries[1].title)).toEqual(["DUPLICATE:minor"]);
      expect(r.entries[1].description).toBeUndefined();
      expect(r.entries[1].dateRange).toBeUndefined();
      expect(only(r.section)).toMatchObject({
        code: "DUPLICATE",
        severity: "info",
        message: expect.stringContaining("1 of 2 project entries look like parser fragments"),
      });
    });
    it("a tech-stack/link line whose 'organization' is a bare domain", () => {
      const list = [project("Alpha"), project("React, Node", { description: undefined, organization: "github.com/user/repo" })];
      const r = reviewProjects(list);
      expect(codes(r.entries[1].title)).toEqual(["DUPLICATE:minor"]);
      expect(r.entries[1].description).toBeUndefined();
    });
    it("a wrapped bullet with no content", () => {
      const list = [project("Alpha"), project("which cut load time in half", { description: undefined })];
      const r = reviewProjects(list);
      expect(codes(r.entries[1].title)).toEqual(["MALFORMED_BLOCK:minor"]);
      expect(r.entries[1].description).toBeUndefined();
    });
    it("a real project that just lacks a description is still charged for it", () => {
      const r = reviewProjects([project("Alpha", { description: undefined })]);
      expect(codes(r.entries[0].description)).toEqual(["MISSING:minor"]);
      expect(r.section).toEqual([]);
    });
    it("counts fragments across the whole list", () => {
      const list = [
        project("Alpha"),
        project("Alpha", { description: undefined }),
        project("Beta"),
        project("Beta", { description: undefined }),
      ];
      expect(reviewProjects(list).section[0].message).toContain("2 of 4 project entries");
    });
  });
});

// -------------------------------------------------------------- education

describe("reviewEducation", () => {
  const ok: AtsEducation = {
    institution: "University of Toronto",
    level: "bachelors",
    qualification: "BASc",
    fieldsOfStudy: ["Computer Engineering"],
    dateRange: { start: { date: "2023-09-01" }, end: { date: "2027-06-01" } },
  };
  const entry = (o: Partial<AtsEducation>, raw = "") => reviewEducationEntry({ ...ok, ...o }, raw);

  it("a complete entry has no issues", () => {
    expect(entry({})).toEqual({});
  });

  it("a blank institution is critical", () => {
    expect(only(entry({ institution: "  " }).institution)).toMatchObject({ code: "MALFORMED_BLOCK", severity: "critical" });
  });

  it("no dates at all is minor; either one is enough", () => {
    expect(only(entry({ dateRange: undefined }).dateRange)).toMatchObject({ code: "MISSING", severity: "minor" });
    expect(entry({ dateRange: { end: { date: "2027-06-01" } } }).dateRange).toBeUndefined();
    expect(entry({ dateRange: { start: { date: "2023-09-01" } } }).dateRange).toBeUndefined();
  });

  it("no qualification is minor; no level or field of study are only notes", () => {
    expect(only(entry({ qualification: "" }).qualification)).toMatchObject({ code: "MISSING", severity: "minor" });
    expect(only(entry({ level: "" }).level)).toMatchObject({ code: "LOW_CONFIDENCE", severity: "info" });
    expect(only(entry({ fieldsOfStudy: [] }).fieldsOfStudy)).toMatchObject({ code: "MISSING", severity: "info" });
    expect(only(entry({ fieldsOfStudy: undefined }).fieldsOfStudy)).toMatchObject({ severity: "info" });
  });

  it.each(["Bachelor of", "Bachelor of Science in", "BASc, with", "Degree and"])(
    "a qualification ending on a connecting word looks cut off: %j",
    (qualification) => expect(codes(entry({ qualification }).qualification)).toEqual(["TRUNCATED:minor"])
  );
  it("quotes the end of a cut-off qualification", () => {
    expect(entry({ qualification: "Bachelor of" }).qualification![0].evidence).toBe("…achelor of");
  });
  it("a trailing period or comma doesn't hide it", () => {
    expect(codes(entry({ qualification: "Bachelor of," }).qualification)).toEqual(["TRUNCATED:minor"]);
  });

  describe("a grade with no value", () => {
    const grade = (raw: string, metric = "GPA") => entry({ grade: { metric } }, raw).grade;

    it("nothing in the text: just a note", () => {
      const i = only(grade("no numbers here"));
      expect(i).toMatchObject({ code: "LOW_CONFIDENCE", severity: "info", message: 'Parsed a grade ("GPA") with no value', evidence: "GPA" });
    });
    it("a stray space around the scale breaks it: critical, with the narrow-1 hint", () => {
      const i = only(grade("Education\nGPA: 3.51 /4.00\n"));
      expect(i).toMatchObject({
        code: "WRONG_SPLIT",
        severity: "critical",
        message: 'GPA "3.51 /4.00" is in the text, but a stray space stopped it being read as a value',
        evidence: "GPA: 3.51 /4.00",
      });
      expect(i.fix).toContain('A narrow "1" left a gap');
      expect(i.fix).toContain('Write "GPA: 3.50 / 4.00" or just "GPA: 3.50".');
    });
    it("a stray space inside the number (no 1 involved) gets no narrow-1 hint", () => {
      const i = only(grade("GPA: 3 .85"));
      expect(i).toMatchObject({ code: "WRONG_SPLIT", severity: "critical" });
      expect(i.fix).not.toContain("narrow");
    });
    it("a clean value that wasn't extracted is critical but not a split", () => {
      for (const raw of ["GPA: 3.5 / 4.0", "GPA: 3.85", "gpa - 3.8", "GPA 3,9"]) {
        expect(only(grade(raw)), raw).toMatchObject({ code: "LOW_CONFIDENCE", severity: "critical" });
      }
    });
    it("matches the metric as typed, case-insensitively", () => {
      expect(only(grade("cgpa: 3.8", "CGPA")).message).toBe('CGPA "3.8" is in the text but wasn\'t extracted as a value');
    });
    it("copes with metric names containing regex characters", () => {
      expect(() => grade("anything", "[unclosed")).not.toThrow();
      expect(() => grade("GPA (4.0): 3.8", "GPA (4.0)")).not.toThrow();
      expect(() => grade("a.b*c", ".*")).not.toThrow();
    });
    it("is skipped when a value was parsed", () => {
      expect(entry({ grade: { metric: "GPA", value: "3.8" } }, "GPA: 3.8").grade).toBeUndefined();
      expect(entry({ grade: { metric: "GPA", value: 3.8 } }, "").grade).toBeUndefined();
    });
  });

  describe("the list", () => {
    it("no entries at all is critical, with nothing to review", () => {
      expect(reviewEducation([], "")).toEqual({
        section: [{ code: "MISSING", severity: "critical", message: "No education entries found" }],
        entries: [],
      });
    });
    it("reviews each entry, in order", () => {
      const r = reviewEducation([ok, { ...ok, institution: "York University", qualification: "" }], "");
      expect(r.section).toEqual([]);
      expect(r.entries[0]).toEqual({});
      expect(r.entries[1].qualification).toBeDefined();
    });
    it("a repeated institution (ignoring case and spacing) hints at a split block, once per repeat", () => {
      const r = reviewEducation([ok, { ...ok, institution: " university  of toronto" }, { ...ok, institution: "UofT" }], "");
      expect(r.section).toHaveLength(1);
      expect(r.section[0]).toMatchObject({ code: "DUPLICATE", severity: "info", evidence: " university  of toronto" });
    });
    it("blank institutions are not 'duplicates' of each other", () => {
      const r = reviewEducation([{ ...ok, institution: "" }, { ...ok, institution: "" }], "");
      expect(r.section).toEqual([]);
    });
  });
});

// ----------------------------------------------------------- achievements

describe("reviewAchievements", () => {
  it("none parsed is a note about the section", () => {
    const r = reviewAchievements([]);
    expect(r.entries).toEqual([]);
    expect(only(r.section)).toMatchObject({ code: "MISSING", severity: "info", message: "No achievements parsed" });
  });
  it("clean bullets have no issues", () => {
    expect(reviewAchievements(["Won the 2025 hackathon", "Dean's list"])).toEqual({ section: [], entries: [[], []] });
  });
  it.each(["Won first place in", "Built the pipeline using", "Led a team of", "Awarded by the"])(
    "a bullet ending on a connecting word is cut off: %j",
    (text) => expect(codes(reviewAchievements([text]).entries[0])).toEqual(["TRUNCATED:info"])
  );
  it("quotes the end of a cut-off bullet", () => {
    expect(reviewAchievements(["Won first place in the national finals of"]).entries[0][0].evidence).toBe("… finals of");
  });
  it("a lowercase start means the line was split", () => {
    const [i] = reviewAchievements(["and placed in the top ten"]).entries[0];
    expect(i).toMatchObject({ code: "WRONG_SPLIT", severity: "info", evidence: "and placed…" });
  });
  it("can be both", () => {
    expect(codes(reviewAchievements(["and placed in"]).entries[0])).toEqual(["TRUNCATED:info", "WRONG_SPLIT:info"]);
  });
  it("blank bullets are ignored, keeping the list parallel", () => {
    expect(reviewAchievements(["", "   ", "Good one"]).entries).toEqual([[], [], []]);
  });
  it("an achievement is never worse than a note", () => {
    const all = reviewAchievements(["and the", "of", "x in"]).entries.flat();
    expect(all.every((i) => i.severity === "info")).toBe(true);
  });
});

// --------------------------------------------------------------- raw text

describe("reviewRawText", () => {
  const header = (n = 8) => Array.from({ length: n }, (_, i) => `header line ${i}`).join("\n");
  const body = (...lines: string[]) => `${header()}\n${lines.join("\n")}`;
  const find = (issues: AtsIssue[], pattern: RegExp) => issues.filter((i) => pattern.test(i.message ?? ""));

  it("empty text has nothing to review", () => {
    expect(reviewRawText("")).toEqual([]);
  });
  it("ordinary text has no issues", () => {
    expect(reviewRawText(body("Built a REST API in Go", "Improved latency by 40%", "Led a team of 4 interns"))).toEqual([]);
  });

  it("typographic ligatures are critical, listing each once", () => {
    const issues = reviewRawText(body("ﬁnance and ﬁnal ﬂow"));
    expect(find(issues, /ligature/)).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "ICON_LIGATURE",
      severity: "critical",
      message: "Typographic ligature character(s) found in the extracted text: ﬁ (fi), ﬂ (fl)",
    });
  });
  it("catches a ligature in the header too", () => {
    expect(codes(reviewRawText("ﬁnance"))).toEqual(["ICON_LIGATURE:critical"]);
  });

  describe("icon-font glyph names", () => {
    it("past the header, a glyph name is minor", () => {
      const issues = reviewRawText(body("Envelope sunny@gmail.com"));
      expect(codes(issues)).toEqual(["ICON_LIGATURE:minor"]);
      expect(issues[0].message).toContain("Envelope");
    });
    it("not in the header (reviewContact owns that)", () => {
      expect(reviewRawText("Envelope sunny@gmail.com")).toEqual([]);
    });
    it("a visible link isn't a glyph name", () => {
      expect(reviewRawText(body("see github.com/sunny and linkedin.com/in/sunny"))).toEqual([]);
    });
    it("one glued onto an address still is", () => {
      expect(codes(reviewRawText(body("Envelopesunny@gmail.com")))).toEqual(["ICON_LIGATURE:minor"]);
    });
    it.todo("ordinary words that are also icon names ('phone interviews', 'home automation', 'link') are not glyphs");
  });

  it("private-use characters (icons with no name) are minor", () => {
    expect(codes(reviewRawText(body("Phone  555")))).toContain("UNEXPECTED_SYMBOL:minor");
    expect(codes(reviewRawText(body("plain text")))).toEqual([]);
  });

  it("a word hyphenated across a line break is a note", () => {
    expect(codes(reviewRawText(body("improved opti-", "mization of builds")))).toEqual(["WRONG_SPLIT:info"]);
    expect(reviewRawText(body("a - b", "full-time"))).toEqual([]);
  });

  describe("stray spaces", () => {
    it("needs three before it says anything", () => {
      expect(reviewRawText(body("based in Toronto , ON", "ranked 1 st"))).toEqual([]);
    });
    it("reports the count with examples", () => {
      const issues = reviewRawText(body("based in Toronto , ON", "ranked 1 st", "over 1 M+ users"));
      expect(codes(issues)).toEqual(["WRONG_SPLIT:info"]);
      expect(issues[0].message).toMatch(/^3 stray spaces inside words or numbers in the extracted text, e\.g\. /);
      expect(issues[0].message).toContain("Toronto , ON");
    });
    it.each([
      ["a space before a comma", "Toronto , ON"],
      ["a space before a dot", "gma il . com"],
      ["a split ordinal", "the 1 st place"],
      ["a split number", "GPA 3.51 /4.00"],
      ["a split magnitude", "over 1 M+ users"],
    ])("detects %s", (_what, text) => {
      const three = `${text}\n${text}\n${text}`;
      expect(codes(reviewRawText(body(three))), text).toContain("WRONG_SPLIT:info");
    });
    it("lists at most four examples", () => {
      const issues = reviewRawText(body(...Array(8).fill("Toronto , ON")));
      expect(issues[0].message?.match(/"[^"]+"/g)).toHaveLength(4);
      expect(issues[0].message).toContain("8 stray spaces");
    });
  });

  it("a stray arrow from \\pdfinterwordspaceon is a note", () => {
    expect(codes(reviewRawText(body("Skills ← Python")))).toEqual(["UNEXPECTED_SYMBOL:info"]);
  });

  describe("text drawn several times (stacked glyph effects)", () => {
    it("four identical lines in a row is minor", () => {
      const issues = reviewRawText(body("SUNNY LEE", "SUNNY LEE", "SUNNY LEE", "SUNNY LEE"));
      expect(codes(issues)).toEqual(["GLYPH_DUPLICATION:minor"]);
      expect(issues[0].message).toContain('"SUNNY LEE"');
    });
    it("three is not enough", () => {
      expect(reviewRawText(body("SUNNY LEE", "SUNNY LEE", "SUNNY LEE"))).toEqual([]);
    });
    it("separated repeats don't count", () => {
      expect(reviewRawText(body("A", "B", "A", "B", "A", "B", "A", "B"))).toEqual([]);
    });
    it("ignores blank lines between repeats", () => {
      expect(codes(reviewRawText(body("X", "", "X", "", "X", "X")))).toEqual(["GLYPH_DUPLICATION:minor"]);
    });
  });
});

// ----------------------------------------------------------------- meta

describe("reviewMeta", () => {
  const doc = (document: object) => reviewMeta({ document });

  it("no metadata is a note", () => {
    for (const meta of [undefined, {}]) {
      expect(only(reviewMeta(meta))).toMatchObject({ code: "MISSING", severity: "info", message: "No parse-quality metadata was returned" });
    }
  });
  it("a healthy parse has no issues", () => {
    expect(doc({ classification: { label: "resume", confidence: 0.99 }, extractionQuality: { band: "high", score: 0.95 } })).toEqual([]);
  });
  it("a document that isn't a resume is critical", () => {
    const i = only(doc({ classification: { label: "invoice" } }));
    expect(i).toMatchObject({ code: "LOW_CONFIDENCE", severity: "critical" });
    expect(i.message).toContain('"invoice"');
  });

  describe("classification confidence", () => {
    it.each([
      [0.1, "minor"],
      [0.49, "minor"],
      [0.5, "info"], // 0.5 is "moderate", not "low"
      [0.69, "info"],
      [0.7, null],
      [0.99, null],
    ])("%d -> %s", (confidence, severity) => {
      const issues = doc({ classification: { label: "resume", confidence } });
      expect(issues.map((i) => i.severity)).toEqual(severity ? [severity] : []);
    });
    it("quotes the number to two places", () => {
      expect(only(doc({ classification: { confidence: 0.456 } })).message).toBe("Low confidence that this is a resume (0.46)");
    });
  });

  describe("extraction quality score", () => {
    it.each([
      [0.1, "critical"],
      [0.69, "critical"],
      [0.7, "minor"], // 0.7 is "moderate", not "low"
      [0.79, "minor"],
      [0.8, null],
      [1, null],
    ])("%d -> %s", (score, severity) => {
      const issues = doc({ extractionQuality: { band: "high", score } });
      expect(issues.map((i) => i.severity)).toEqual(severity ? [severity] : []);
    });
    it("the band is only used when the score said nothing", () => {
      expect(codes(doc({ extractionQuality: { band: "low", score: 0.2 } }))).toEqual(["LOW_CONFIDENCE:critical"]);
      expect(codes(doc({ extractionQuality: { band: "medium", score: 0.9 } }))).toEqual(["LOW_CONFIDENCE:info"]);
      expect(codes(doc({ extractionQuality: { band: "medium" } }))).toEqual(["LOW_CONFIDENCE:info"]);
      expect(doc({ extractionQuality: { band: "high" } })).toEqual([]);
    });
  });

  it("can report classification and quality problems together", () => {
    const issues = doc({ classification: { label: "other", confidence: 0.3 }, extractionQuality: { score: 0.5 } });
    expect(issues.map((i) => i.severity)).toEqual(["critical", "minor", "critical"]);
  });
});
