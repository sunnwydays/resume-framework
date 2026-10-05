import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_TRIMS, trimRole, trimsFromString, trimsToString, type RoleTrimOptions } from "@/lib/tracker/trimRole";

const only = (o: Partial<RoleTrimOptions>): RoleTrimOptions => ({ term: false, intern: false, shorten: false, ...o });
const NONE = only({});

describe("trimRole with the defaults", () => {
  it.each([
    ["Software Engineer Intern, Test Automation (Summer 2027)", "SWE, Test Automation"],
    ["Software Engineer Intern - Summer 2027", "SWE"],
    ["Summer 2027 Software Engineer Intern", "SWE"],
    ["Software Engineering Internship (Fall/Winter 2026)", "SWE"],
    ["Software Engineer Intern - 2027 Summer", "SWE"],
    ["SWE Intern (Summer '27)", "SWE"],
    ["Software Engineer Intern, Winter 2027 Co-op", "SWE"],
    ["Frontend Developer Intern", "Front End SWE"],
    ["Back-End Software Engineer Intern", "Back End SWE"],
    ["Full Stack Engineer Co-op", "Fullstack SWE"],
    ["Software Development Engineer Intern", "SDE"],
    ["Intern/Co-op Software Developer", "SWE"],
    ["Co-op Engineer - Machine Learning and AI Infrastructure", "Engineer - Machine Learning and AI Infrastructure"],
    ["Data Science Co-op/Intern", "Data Science"],
    ["Data Science Coop", "Data Science"],
    ["Software Engineer Intern [Toronto]", "SWE [Toronto]"],
    ["Software Engineer (Remote)", "SWE (Remote)"],
    ["2027 Internship Perception, Learned Mapping & SLAM", "Perception, Learned Mapping & SLAM"],
    ["Software Engineer Intern - 2027", "SWE"],
  ])("%j -> %j", (input, expected) => expect(trimRole(input, DEFAULT_TRIMS)).toBe(expected));

  it("leaves words that merely contain 'intern' alone", () => {
    expect(trimRole("Internal Tools Engineer", DEFAULT_TRIMS)).toBe("Internal Tools Engineer");
  });

  it("never erases the whole title", () => {
    expect(trimRole("Intern", DEFAULT_TRIMS)).toBe("Intern");
    expect(trimRole("Summer 2027 Internship", DEFAULT_TRIMS)).not.toBe("");
  });
});

describe("each trim on its own", () => {
  const role = "Software Engineer Intern (Summer 2027)";
  it("term only drops the season and year", () => {
    expect(trimRole(role, only({ term: true }))).toBe("Software Engineer Intern");
  });
  it("intern only drops the word", () => {
    expect(trimRole(role, only({ intern: true }))).toBe("Software Engineer (Summer 2027)");
  });
  it("shorten only abbreviates", () => {
    expect(trimRole(role, only({ shorten: true }))).toBe("SWE Intern (Summer 2027)");
  });
  it("all off changes nothing but whitespace", () => {
    expect(trimRole(role, NONE)).toBe(role);
    expect(trimRole("  Software   Engineer  ", NONE)).toBe("Software Engineer");
  });
});

describe("trim options as a stored setting", () => {
  it("round-trips every combination, and reads junk as all off", () => {
    fc.assert(
      fc.property(fc.record({ term: fc.boolean(), intern: fc.boolean(), shorten: fc.boolean() }), (o) => {
        expect(trimsFromString(trimsToString(o))).toEqual(o);
      })
    );
    expect(trimsFromString("nonsense")).toEqual(NONE);
  });
});

describe("properties", () => {
  const opts = fc.record({ term: fc.boolean(), intern: fc.boolean(), shorten: fc.boolean() });

  it("never returns an empty string for a non-blank role", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }).filter((s) => s.trim() !== ""), opts, (role, o) => {
        expect(trimRole(role, o)).not.toBe("");
      })
    );
  });

  it("is idempotent with the defaults", () => {
    const roles = fc.constantFrom(
      "Software Engineer Intern, Test Automation (Summer 2027)",
      "Summer 2027 Software Engineer Intern",
      "Intern/Co-op Software Developer",
      "Frontend Developer Intern",
      "Data Scientist (Fall 2026)",
      "SWE"
    );
    fc.assert(
      fc.property(roles, (role) => {
        const once = trimRole(role, DEFAULT_TRIMS);
        expect(trimRole(once, DEFAULT_TRIMS)).toBe(once);
      })
    );
  });
});
