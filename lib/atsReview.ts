// Logic for finding problems in parsed resume, displays in AtsResult.tsx

import { AtsContact, AtsPerson, AtsWorkExperience } from "./types";

export interface SectionReview<F> {
  section: AtsIssue[];  // about the section in general
  fields: F;            // keyed by field name
}

export interface AtsIssue {
  code: IssueCode;
  severity: "critical" | "minor" | "info";
  message?: string;     // short: what the parser produced. Omit when the
                        // field label + code already say it (e.g. MISSING)
  fix?: string;          // edit to make to resume
  evidence?: string;    // offending value from the parse
}

export type IssueCode =
  | "MISSING"
  | "ICON_LIGATURE"
  | "WRONG_SPLIT"
  | "UNEXPECTED_SYMBOL"
  | "UNBALANCED_PAREN"
  | "TRUNCATED"
  | "DUPLICATE"
  | "NOT_A_TITLE"
  | "SECTION_HEADER_BLEED";

// Issues keyed by field name; a field with no issues is just absent.
type FieldIssues<K extends string> = Partial<Record<K, AtsIssue[]>>;

// Append an issue to a field's list, creating the list on first use.
// Multiple rules can hit the same field, so never assign the array directly.
function add<K extends string>(fields: FieldIssues<K>, key: K, issue: AtsIssue) {
  (fields[key] ??= []).push(issue);
}

function emptySection<F>(fields: F): SectionReview<F> {
  return { section: [], fields };
}

// -----------  Personal  -----------

export type PersonIssues = FieldIssues<
  "given" |
  "middle" |
  "family" |
  "location"
>;

// Letters/marks (accented names), spaces, hyphen/en dash/em dash, apostrophe
// (O'Brien), and quote/paren pairs (a nickname bleeding into a name field,
// e.g. Robert "Bob" or Robert (Bob)
const ALLOWED_NAME_SYMBOLS = /[\p{L}\p{M}\s\-–—'’"“”()]/gu;

function unexpectedSymbols(value: string): string[] {
  return [...new Set(value.replace(ALLOWED_NAME_SYMBOLS, "").split(""))];
}

export function reviewPerson(person: AtsPerson): SectionReview<PersonIssues> {
  // missing first or last name
  // has middle name, and [given or family name has >1 word]
  // name contains unexpected symbol
  // unbalanced paretheses (like for containing legal name)
  // missing location or city
  const fields: PersonIssues = {};
  const review: SectionReview<PersonIssues> = emptySection(fields);

  if (!person.name.given) {
    add(fields, "given", { code: "MISSING", severity: "critical" });
  }

  for (const field of ["given", "middle", "family"] as const) {
    const value = person.name[field];
    if (!value) continue;

    const bad = unexpectedSymbols(value);
    if (bad.length > 0) {
      add(fields, field, {
        code: "UNEXPECTED_SYMBOL",
        severity: "minor",
        message: `Unexpected symbol(s) in ${field} name: ${bad.join(" ")}`,
        fix: "Avoid symbols in your name if possible. If you have a preferred name, you can use it in place of your legal name.",
        evidence: value,
      });
    }

    const openCount = (value.match(/\(/g) ?? []).length;
    const closeCount = (value.match(/\)/g) ?? []).length;
    if (openCount !== closeCount) {
      add(fields, field, {
        code: "UNBALANCED_PAREN",
        severity: "minor",
        message: `Unbalanced parentheses in ${field} name`,
        fix: "The resume text may have been cut off. Avoid symbols in your name if possible. If you have a preferred name, you can use it in place of your legal name.",
        evidence: value,
      });
    }
  }

  // some people may not have a family name but most do
  if (!person.name.family) {
    add(fields, "family", { code: "MISSING", severity: "critical" });
  }

  if (person.name.middle) {
    const givenMultipleWords = (person.name.given?.split(" ").length ?? 0) > 1;
    const familyMultipleWords = (person.name.family?.split(" ").length ?? 0) > 1;

    if (givenMultipleWords || familyMultipleWords) {
      const evidence = [
        givenMultipleWords && `given name: ${person.name.given}`,
        familyMultipleWords && `family name: ${person.name.family}`,
      ]
        .filter(Boolean)
        .join(", ");

      add(fields, "given", {
        code: "WRONG_SPLIT",
        severity: "minor",
        message: "Middle name exists, and given and/or family name is multiple words",
        fix: "Ensure names are clearly separated. Not major if name has >=4 words.",
        evidence,
      });
    }
  }

  const location = person.location;
  const hasAnyLocationData = !!(
    location &&
    (location.city || location.state || location.country || location.formatted || location.raw)
  );

  if (!hasAnyLocationData) {
    // `location` object can have every field empty/undefined which 
    // `!person.location` misses
    add(fields, "location", {
      code: "MISSING",
      severity: "critical",
    });
  } else if (!location!.city) {
    // ATS systems commonly filter/rank by city (commute distance, hybrid
    // requirements, remote-in-state rules)
    add(fields, "location", {
      code: "MISSING",
      severity: "critical",
      message: "Missing city",
      fix: "Include your city (and state/country) near your name or contact info so ATS location filters can match you.",
      evidence: location!.formatted ?? location!.raw,
    });
  }

  return review;
}

// -----------  Contact  -----------

export type ContactIssues = FieldIssues<"emails" | "phoneNumbers" | "websites">;

// The contact-line rules (icon ligatures, split text) will also need rawText;
// add it as a second param when writing those.
export function reviewContact(contact: AtsContact): SectionReview<ContactIssues> {
  const fields: ContactIssues = {};
  const review: SectionReview<ContactIssues> = emptySection(fields);

  if (contact.emails.length === 0) {
    add(fields, "emails", {
      code: "MISSING",
      severity: "critical",
    });
  }

  if (contact.phoneNumbers.length === 0) {
    add(fields, "phoneNumbers", {
      code: "MISSING",
      severity: "critical",
    });
  }

  if (contact.websites.length === 0) {
    add(fields, "websites", {
      code: "MISSING",
      severity: "info",
      fix: "Add your LinkedIn, portfolio site, or project URLs.",
    });
  }

  return review;
}

// -----------  Work Experience  -----------

export type WorkExperienceIssues = FieldIssues<"dateRange" | "description">;

// Per-entry rules only. Cross-entry rules live in reviewWorkExperiences.
export function reviewWorkExperience(we: AtsWorkExperience): WorkExperienceIssues {
  const fields: WorkExperienceIssues = {};

  if (!we.dateRange?.start?.date) {
    add(fields, "dateRange", {
      code: "MISSING",
      severity: "minor",
      message: "Missing start date",
      fix: "Write the dates on the same line as the job title, e.g. May 2025 - Present.",
    });
  }

  if (!we.description || we.description.trim().length === 0) {
    add(fields, "description", {
      code: "MISSING",
      severity: "minor",
      fix: "Add 2-4 bullets under the role. Empty roles get no keyword credit.",
    });
  }

  return fields;
}

export interface WorkExperiencesReview {
  section: AtsIssue[];              // rules about the list as a whole
  entries: WorkExperienceIssues[];  // parallel to workExperience[]
}

export function reviewWorkExperiences(
  list: AtsWorkExperience[]
): WorkExperiencesReview {
  return {
    section: [],
    entries: list.map(reviewWorkExperience),
  };
}
