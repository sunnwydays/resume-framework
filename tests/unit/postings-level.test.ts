import { describe, expect, it } from "vitest";
import { postingLevel } from "@/lib/tracker/postings/level";

// Titles shaped like the ones Jobright alerts carry.
describe("postingLevel", () => {
  it.each([
    "Software Engineer Intern (Summer 2027)",
    "Intern - Software Engineer, Winter 2027",
    "Research Scientist-Model Efficiency (Intern)",
    "Co-op Researcher – Agentic AI",
    "Software Developer Co-op (Winter 2027)",
    "Data Scientist Student – Winter 2027",
    "Stage coopératif - Hiver 2027: Développeur (4 mois)",
    "Platform Applications Engineer Intern/Co-op (Tools Development)",
    "FY27 Intern - Machine Learning Compiler Engineering (16 months)",
    // A lower level named alongside wins.
    "Junior Developer Co-op",
    "C++ Software Engineer Co-op (Vancouver - Summer 2027 - 8-Months - Undergrad)",
    "Software Developer Full Stack / Backend I (Co-op)",
  ])("intern: %s", (role) => expect(postingLevel(role).level).toBe("intern"));

  it.each([
    "Site Reliability Engineer Graduate (Global SRE) - 2027 Start",
    "Frontend Software Engineer Graduate (Ads Interface) - 2027 Start",
    "Software Engineer, 2027 Graduate Canada",
    "Software Engineer - Python - Cloud - graduate level",
    "Associate, Software Engineer, New Grad",
    "Associate, Data Scientist - New Grad, 2027 Start",
    "Entry Level Software Engineer",
    "Entry-Level Software Engineer",
    "Software Development Engineer, Early Career - 2026",
    "Software Engineer, Early Career — Immediate Start",
    "Machine Learning Engineer, AI Processors (New Grad to Engineer Level)",
    "Junior Backend Developer",
    "New-Grad Software Engineer",
  ])("new grad: %s", (role) => expect(postingLevel(role).level).toBe("grad"));

  it.each(["Senior Software Engineer", "Sr. Data Engineer", "Staff Engineer, Platform", "Engineering Manager", "Software Engineer II", "Tech Lead, Payments"])(
    "experienced: %s",
    (role) => expect(postingLevel(role).level).toBe("experienced")
  );

  it.each(["Full Stack Engineer", "Web Interface Software Engineer", "Accounting Technology Analyst", "AI Engineer", "Machine Learning Resident"])(
    "not stated: %s",
    (role) => expect(postingLevel(role).level).toBe("unstated")
  );

  it("doesn't read a level out of part of a word", () => {
    expect(postingLevel("Undergraduate Research Program Engineer").level).toBe("unstated");
    expect(postingLevel("Internal Tools Engineer").level).toBe("unstated");
    expect(postingLevel("Leader in Cooperative Robotics").level).toBe("unstated");
    expect(postingLevel("Engineer, Hawaii Office").level).toBe("unstated");
  });

  describe("falls back on the posting page when the title says nothing", () => {
    it.each([
      ["New Grad · Full-time", "grad"],
      ["New Grad, Mid Level · Full-time", "grad"],
      ["Entry Level · Full-time", "grad"],
      ["Intern · Internship", "intern"],
      ["Internship", "intern"],
      ["Mid Level, Senior Level · Full-time", "experienced"],
      ["Full-time", "unstated"],
    ])("%s -> %s", (levelText, level) => expect(postingLevel("Web Interface Software Engineer", levelText).level).toBe(level));

    it("but the title wins when it says", () => {
      expect(postingLevel("Software Engineer Intern", "New Grad · Full-time").level).toBe("intern");
      expect(postingLevel("Entry Level Software Engineer", "Intern · Internship").level).toBe("grad");
    });

    it("nothing read is not stated", () => {
      expect(postingLevel("Full Stack Engineer", null).level).toBe("unstated");
      expect(postingLevel("Full Stack Engineer", "").level).toBe("unstated");
    });
  });

  describe("says where the level came from", () => {
    it("names the word in the title", () => {
      expect(postingLevel("Site Reliability Engineer Graduate - 2027 Start").why).toBe('Title says "Graduate"');
      expect(postingLevel("Software Engineer II").why).toBe('Title says "II"');
    });

    it("quotes the posting page", () => {
      expect(postingLevel("Web Interface Software Engineer", "New Grad · Full-time").why).toBe('Posting page says "New Grad · Full-time"');
    });

    it("explains a level that isn't stated", () => {
      expect(postingLevel("Web Interface Software Engineer", "Full-time").why).toBe('Posting page says "Full-time", which doesn\'t name a level');
      expect(postingLevel("Web Interface Software Engineer").why).toMatch(/hasn't been read or doesn't say/);
    });
  });
});
