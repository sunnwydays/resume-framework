import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MOVE_CHANNELS } from "@/lib/tracker/format";
import {
  BLANKS,
  BUILT_IN_PREFIX,
  BUILT_IN_TEMPLATES,
  LINKEDIN_NOTE_LIMIT,
  blanksIn,
  fillTemplate,
  isBuiltIn,
  joinTarget,
  messageLength,
  missingFields,
  splitSubject,
  splitTarget,
  type TemplateFields,
} from "@/lib/tracker/templates";

const FULL: TemplateFields = {
  name: "Priya",
  company: "Acme",
  about: "a CS student who builds developer tools",
  hook: "I liked your post on search.",
  ask: "Open to a quick chat?",
};

describe("fillTemplate", () => {
  it("fills every blank that has a value", () => {
    expect(fillTemplate("Hi {name}, about {company}. {ask}", FULL)).toBe("Hi Priya, about Acme. Open to a quick chat?");
  });

  it("leaves blanks without a value visible", () => {
    expect(fillTemplate("Hi {name}, {hook}", { name: "Priya", hook: "   " })).toBe("Hi Priya, {hook}");
  });

  it("trims values and fills repeated blanks", () => {
    expect(fillTemplate("{name} {name}", { name: "  Sam " })).toBe("Sam Sam");
  });

  it("leaves unknown braces alone", () => {
    expect(fillTemplate("{name} {unknown} {}", FULL)).toBe("Priya {unknown} {}");
  });

  it("doesn't treat a value's own braces as blanks", () => {
    expect(fillTemplate("{name}, {company}", { name: "{company}", company: "Acme" })).toBe("{company}, Acme");
  });

  it("with every field filled, no blank is left in any built-in template", () => {
    fc.assert(
      fc.property(
        fc.record(Object.fromEntries(BLANKS.map((b) => [b, fc.string({ minLength: 1 }).filter((s) => s.trim() !== "" && !/[{}]/.test(s))]))),
        (fields) => {
          for (const t of BUILT_IN_TEMPLATES) expect(fillTemplate(t.body, fields)).not.toMatch(/\{\w+\}/);
        }
      )
    );
  });
});

describe("blanks", () => {
  it("blanksIn lists each blank once, in order", () => {
    expect(blanksIn("{ask} {name} {ask} {company}")).toEqual(["ask", "name", "company"]);
    expect(blanksIn("no blanks")).toEqual([]);
  });

  it("missingFields is the blanks with no (non-blank) value", () => {
    expect(missingFields("{name} {company} {hook}", { name: "x", company: " " })).toEqual(["company", "hook"]);
    expect(missingFields("{name}", FULL)).toEqual([]);
  });
});

describe("built-in templates", () => {
  it("have unique keys with the built-in prefix and real channels", () => {
    const keys = BUILT_IN_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of BUILT_IN_TEMPLATES) {
      expect(isBuiltIn(t.key)).toBe(true);
      expect(t.channel in MOVE_CHANNELS).toBe(true);
    }
    expect(isBuiltIn("4f9c0c1e-uuid")).toBe(false);
    expect(BUILT_IN_PREFIX).toBe("builtin:");
  });

  it("only use the known blanks", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      for (const b of blanksIn(t.body)) expect(BLANKS).toContain(b);
    }
  });

  it("the LinkedIn ones fit a connection note when filled with typical values", () => {
    for (const t of BUILT_IN_TEMPLATES.filter((x) => x.channel === "linkedin")) {
      expect(messageLength(fillTemplate(t.body, FULL)), t.name).toBeLessThanOrEqual(LINKEDIN_NOTE_LIMIT);
    }
  });

  it("the email ones start with a subject line", () => {
    for (const t of BUILT_IN_TEMPLATES.filter((x) => x.channel === "email")) {
      expect(splitSubject(t.body).subject, t.name).toBeTruthy();
    }
  });
});

describe("messageLength", () => {
  it("counts an emoji as one character, like LinkedIn", () => {
    expect(messageLength("hi 👋")).toBe(4);
    expect("hi 👋".length).toBe(5);
  });
});

describe("splitSubject", () => {
  it("separates an email's subject line", () => {
    expect(splitSubject("Subject: Hello\n\nBody here")).toEqual({ subject: "Hello", body: "Body here" });
    expect(splitSubject("subject:Hi\r\n\r\nBody")).toEqual({ subject: "Hi", body: "Body" });
  });

  it("leaves a message without one alone", () => {
    expect(splitSubject("Hi there\nSubject: not a header")).toEqual({ subject: null, body: "Hi there\nSubject: not a header" });
  });
});

describe("move targets", () => {
  it.each([
    ["Priya", "Acme", "Priya (Acme)"],
    [" Priya ", "", "Priya"],
    ["", "Acme", "Acme"],
    ["", "  ", ""],
  ])("joinTarget(%j, %j) = %j", (name, company, expected) => expect(joinTarget(name, company)).toBe(expected));

  it.each([
    ["Priya (Acme)", { name: "Priya", company: "Acme" }],
    ["Priya Shah  (Acme Corp) ", { name: "Priya Shah", company: "Acme Corp" }],
    ["Acme search demo", { name: "Acme search demo", company: "" }],
    ["(Acme)", { name: "(Acme)", company: "" }],
  ])("splitTarget(%j)", (target, expected) => expect(splitTarget(target)).toEqual(expected));

  it("split undoes join for ordinary names", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim() !== "" && !/[()]/.test(s)),
        fc.string({ minLength: 1 }).filter((s) => s.trim() !== "" && !/[()]/.test(s)),
        (name, company) => {
          expect(splitTarget(joinTarget(name, company))).toEqual({ name: name.trim(), company: company.trim() });
        }
      )
    );
  });
});
