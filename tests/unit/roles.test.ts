import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ROLE_TYPES, ROLE_TYPE_ORDER, normalizeRole, roleType, roleTypeLabel } from "@/lib/tracker/roles";

describe("normalizeRole", () => {
  it.each([
    ["Front-End Developer", "frontend developer"],
    ["front end SWE", "frontend swe"],
    ["Back  End Eng", "backend eng"],
    ["Full Stack Dev", "fullstack dev"],
    ["AI/ML Engineer", "ai ml engineer"],
    ["  SWE (Robotics) ", "swe robotics"],
  ])("%j -> %j", (input, expected) => expect(normalizeRole(input)).toBe(expected));
});

describe("roleType", () => {
  // The spellings that actually get typed into the tracker.
  it.each([
    ["SWE Robo", "robotics"],
    ["Robotics Software Engineer Intern", "robotics"],
    ["Autonomous Vehicle SWE", "robotics"],
    ["Data Scientist Intern", "data"],
    ["Data Engineer", "data"],
    ["Business Analyst", "data"],
    ["Research Scientist", "research"],
    ["MLE Intern", "ml"],
    ["AI/ML Engineer", "ml"],
    ["Software Engineer, Machine Learning", "ml"],
    ["Computer Vision Engineer", "ml"],
    ["Embedded Systems", "embedded"],
    ["Hardware Engineer", "embedded"],
    ["Firmware Developer", "embedded"],
    ["iOS Developer", "mobile"],
    ["Android Developer", "mobile"],
    ["Site Reliability Engineer", "infra"],
    ["Security Engineer", "infra"],
    ["Cloud Engineer", "infra"],
    ["Platform Engineer", "infra"],
    ["DevOps Intern", "infra"],
    ["Full-Stack Dev", "fullstack"],
    ["Full Stack Developer", "fullstack"],
    ["front end swe", "frontend"],
    ["Front-End Engineer", "frontend"],
    ["UI Engineer", "frontend"],
    ["Web Developer", "frontend"],
    ["Backend Developer", "backend"],
    ["BE Intern", "backend"],
    ["QA Engineer", "qa"],
    ["SDET", "qa"],
    ["Software Test Engineer", "qa"],
    ["Solutions Engineer", "solutions"],
    ["Forward Deployed Engineer", "solutions"],
    ["Sales Engineer", "solutions"],
    ["Software Engineer Intern", "swe"],
    ["SWE", "swe"],
    ["SDE Intern", "swe"],
    ["Software Developer", "swe"],
    ["Developer Advocate", "swe"],
    ["Product Manager", "other"],
    ["Technical Program Manager", "other"],
    ["", "other"],
  ])("%j -> %s", (role, expected) => expect(roleType(role)).toBe(expected));

  it("specific types win over the SWE catch-all", () => {
    expect(roleType("SWE Robo")).toBe("robotics");
    expect(roleType("SWE ML")).toBe("ml");
    expect(roleType("SWE Embedded")).toBe("embedded");
  });

  it("follows rule order when two types match (documented behavior)", () => {
    expect(roleType("Embedded ML Engineer")).toBe("ml");
    expect(roleType("Data Science Research Intern")).toBe("data");
  });

  it("matches whole words only", () => {
    expect(roleType("Maintenance Technician")).toBe("other"); // contains "ai" inside a word
    expect(roleType("Trainee")).toBe("other");
    expect(roleType("Software Engineer, Rail Systems")).toBe("swe"); // "ai" inside "rail"
  });

  it("is case-insensitive", () => {
    expect(roleType("SOFTWARE ENGINEER")).toBe(roleType("software engineer"));
  });

  it("always returns a known key and never throws", () => {
    const keys = new Set(ROLE_TYPES.map((t) => t.key));
    fc.assert(fc.property(fc.string(), (role) => keys.has(roleType(role))));
  });
});

describe("role type tables", () => {
  it("keys are unique and 'other' is the last, pattern-less fallback", () => {
    const keys = ROLE_TYPES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    const last = ROLE_TYPES[ROLE_TYPES.length - 1];
    expect(last.key).toBe("other");
    expect(last.pattern).toBeNull();
  });
  it("labels and order cover every type", () => {
    ROLE_TYPES.forEach((t, i) => {
      expect(roleTypeLabel(t.key)).toBe(t.label);
      expect(ROLE_TYPE_ORDER[t.key]).toBe(i);
    });
  });
});
