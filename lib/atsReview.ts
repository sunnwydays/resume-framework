// Logic for finding problems in parsed resume, displays in AtsResult.tsx

import { AtsContact, AtsEducation, AtsMeta, AtsPerson, AtsProject, AtsWorkExperience } from "./types";

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
  | "SECTION_HEADER_BLEED"
  | "INVALID_FORMAT"
  | "NOT_IN_RAW_TEXT"
  | "LOW_CONFIDENCE"
  | "MALFORMED_BLOCK";

export const DEFAULT_ISSUE_MESSAGES: Record<IssueCode, string> = {
  MISSING: "Missing",
  ICON_LIGATURE: "Icon-font glyph name found in the parsed text",
  WRONG_SPLIT: "Value is split incorrectly",
  UNEXPECTED_SYMBOL: "Unexpected symbol",
  UNBALANCED_PAREN: "Unbalanced parentheses",
  TRUNCATED: "Value may be truncated",
  DUPLICATE: "Duplicate value",
  SECTION_HEADER_BLEED: "Section header text bled into this field",
  INVALID_FORMAT: "Invalid format",
  NOT_IN_RAW_TEXT: "Not found in the extracted raw text",
  LOW_CONFIDENCE: "Low confidence",
  MALFORMED_BLOCK: "This entry wasn't parsed correctly",
};

export function issueMessage(issue: AtsIssue): string {
  return issue.message ?? DEFAULT_ISSUE_MESSAGES[issue.code];
}

// Issues keyed by field name; a field with no issues is just absent.
export type FieldIssues<K extends string> = Partial<Record<K, AtsIssue[]>>;

// Append an issue to a field's list, creating the list on first use.
// Multiple rules can hit the same field, so never assign the array directly.
function add<K extends string>(fields: FieldIssues<K>, key: K, issue: AtsIssue) {
  (fields[key] ??= []).push(issue);
}

function emptySection<F>(fields: F): SectionReview<F> {
  return { section: [], fields };
}

// Icon fonts (FontAwesome etc.) have no real glyphs in the text layer, so PDF
// extraction emits the glyph *name* instead, e.g. "Envelope su nny@gmail.com".
const ICON_WORDS = [
  "envelope",
  "phone",
  "phone-alt",
  "mobile-alt",
  "linkedin",
  "github",
  "globe",
  "link",
  "map-marker",
  "map-marker-alt",
  "home",
  "briefcase",
  "graduation-cap",
  "external-link-alt",
];

// Longest names first so "phone-alt" wins over "phone". Word boundary on the
// left; on the right allow the name to be glued to the following text
// ("Envelopenny") since that's exactly the failure we're catching.
const ICON_WORD_RE = new RegExp(
  `\\b(${[...ICON_WORDS].sort((a, b) => b.length - a.length).join("|")})`,
  "gi"
);

function findIconWords(value: string): string[] {
  return [...new Set(value.match(ICON_WORD_RE) ?? [])];
}

// URL/email-shaped tokens, so a real address like "github.com/user/repo"
// isn't mistaken for an icon-font glyph name landing in running text.
const URLISH_TOKEN_RE = /\b[\w.-]+@[\w.-]+\.\w+|\b(?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+(?:\/\S*)?/gi;

// Same icon words, anchored to the start of a token. Used to tell an icon
// glued directly onto the front of a URL/email ("Envelopesunny@x.com" — the
// actual glyph-extraction failure this check exists to catch) apart from a
// domain that merely contains an icon word as a substring ("github.com").
const ICON_WORD_PREFIX_RE = new RegExp(
  `^(${[...ICON_WORDS].sort((a, b) => b.length - a.length).join("|")})`,
  "i"
);

// Scans free-running text (as opposed to a single already-isolated field
// value, e.g. one email) for icon-font glyph names. URL/email-shaped tokens
// are blanked out first so a visible link like "github.com/..." isn't
// flagged as a "github" icon glyph, unless an icon name is glued onto the
// very front of the token with nothing else preceding it in the token —
// that's the icon-glued-to-contact-info failure, kept intact.
function findIconWordsInText(text: string): string[] {
  const stripped = text.replace(URLISH_TOKEN_RE, (token) => {
    const prefixMatch = token.match(ICON_WORD_PREFIX_RE);
    if (!prefixMatch) return " ";
    const rest = token.slice(prefixMatch[0].length);
    return rest === "" || /^[./]/.test(rest) ? " " : token;
  });
  return findIconWords(stripped);
}

// Lowercase + drop all whitespace, so "su nny@x.com" still matches
// "sunny@x.com" when checking whether a value appears in the raw text.
function squash(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

// For evidence that's just the value of a field already shown in full right
// next to the issue (an achievement line, a title, a name) — a short snippet
// is enough to place it; repeating the whole thing is redundant. Which end
// to keep depends on the issue: a "starts with lowercase" issue is about the
// front, but a "cut off mid-sentence" issue is about the end.
const EVIDENCE_SNIPPET_LENGTH = 10;

function snippet(value: string, end: "start" | "end" = "start"): string {
  const trimmed = value.trim();
  if (trimmed.length <= EVIDENCE_SNIPPET_LENGTH) return trimmed;
  return end === "start"
    ? `${trimmed.slice(0, EVIDENCE_SNIPPET_LENGTH)}…`
    : `…${trimmed.slice(-EVIDENCE_SNIPPET_LENGTH)}`;
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
  const name = person.name ?? {};

  if (!name.given) {
    add(fields, "given", { code: "MISSING", severity: "critical" });
  }

  for (const field of ["given", "middle", "family"] as const) {
    const value = name[field];
    if (!value) continue;

    const bad = unexpectedSymbols(value);
    if (bad.length > 0) {
      add(fields, field, {
        code: "UNEXPECTED_SYMBOL",
        severity: "minor",
        message: `Unexpected symbol(s) in ${field} name: ${bad.join(" ")}`,
        fix: "Avoid symbols in your name if possible. If you have a preferred name, you can use it in place of your legal name.",
        evidence: snippet(value),
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
        evidence: snippet(value, "end"),
      });
    }

    // Given/family names are almost never a single letter
    // Mismatched capitalization or an unusual font (e.g. small caps) can make 
    // name one character early, e.g. "Rob W Ang" -> given "R", middle "obw".
    if (field !== "middle" && value.trim().length === 1) {
      add(fields, field, {
        code: "WRONG_SPLIT",
        severity: "minor",
        message: `${field === "given" ? "Given" : "Family"} name is a single letter`,
        fix: "Unusual capitalization or font formatting (e.g. small caps) can cause the name to be split at the wrong point. Use normally-capitalized text.",
        evidence: value,
      });
    }
  }

  // some people may not have a family name but most do
  if (!name.family) {
    add(fields, "family", { code: "MISSING", severity: "critical" });
  }

  if (name.middle) {
    const givenMultipleWords = (name.given?.split(" ").length ?? 0) > 1;
    const familyMultipleWords = (name.family?.split(" ").length ?? 0) > 1;

    if (givenMultipleWords || familyMultipleWords) {
      const evidence = [
        givenMultipleWords && `given name: ${snippet(name.given!)}`,
        familyMultipleWords && `family name: ${snippet(name.family!)}`,
      ]
        .filter(Boolean)
        .join(", ");

      add(fields, "given", {
        code: "WRONG_SPLIT",
        severity: "minor",
        message: "Multiple words in given or family name",
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
      evidence: snippet(location!.formatted ?? location!.raw ?? ""),
    });
  }

  return review;
}

// -----------  Contact  -----------

export type ContactIssues = FieldIssues<"emails" | "phoneNumbers" | "websites">;

// Separators that typically precede a contact field on a header line:
// "Phone | Envelope su nny@gmail.com", "Envelope su nny@gmail.com • LINKEDIN "
const CONTACT_SEPARATOR_RE = /[|•·\n]|\s{2,}/g;

// Index just past the last contact-line separator before `index`, or 0 if
// there isn't one (start of string/line).
function lastSeparatorEnd(text: string, index: number): number {
  const before = text.slice(0, index);
  let end = 0;
  for (const match of before.matchAll(CONTACT_SEPARATOR_RE)) {
    end = match.index! + match[0].length;
  }
  return end;
}

// Compares a parsed email against the header block of raw extracted text
// (see reviewContact) and reports how, if at all, it disagrees. Split out on
// its own since this is the piece most likely to need tuning against more
// real resumes.
function compareEmailToRaw(email: string, headerBlock: string): AtsIssue[] {
  const issues: AtsIssue[] = [];

  const iconWords = findIconWords(email);
  if (iconWords.length > 0) {
    issues.push({
      code: "ICON_LIGATURE",
      severity: "critical",
      message: `Email parsed with an icon-font word glued to it: ${iconWords.join(", ")}`,
      fix: "An icon (e.g. an envelope glyph) next to your email got extracted as text and merged into the address. Recommend removing the icon.",
      evidence: email,
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    issues.push({
      code: "INVALID_FORMAT",
      severity: "critical",
      message: "Parsed email doesn't look like a valid address",
      evidence: email,
    });
  }

  const domain = email.split("@")[1] ?? "";
  const atIndex = headerBlock.indexOf(`@${domain}`);
  if (atIndex === -1) {
    // The parser itself sometimes reflows extra whitespace into its raw
    // text (e.g. "sunny@gma il . com"), which defeats a literal substring
    // search even though the address is genuinely present and unbroken in
    // the source document. Only report the domain as missing if it can't
    // be found even ignoring whitespace; when it can, the address is
    // present, just reflowed, so there's nothing more to check
    // positionally (the finer-grained checks below need a real index).
    if (squash(headerBlock).includes(squash(`@${domain}`))) {
      return issues;
    }
    issues.push({
      code: "NOT_IN_RAW_TEXT",
      severity: "minor",
      message: "Parsed email's domain wasn't found in the extracted raw text",
      evidence: email,
    });
    return issues;
  }

  const segmentStart = lastSeparatorEnd(headerBlock, atIndex);
  const rawLocalPart = headerBlock
    .slice(segmentStart, atIndex)
    .replace(ICON_WORD_RE, "")
    .trim();

  if (/\s/.test(rawLocalPart)) {
    issues.push({
      code: "WRONG_SPLIT",
      severity: "critical",
      message: "Email has space(s) in the extracted text",
      fix: "The raw text has whitespace inside the email address (likely from letter-spacing or an icon glyph next to it). Type the email as plain text with nothing touching it.",
      evidence: `${rawLocalPart}@${email.split("@")[1] ?? ""}`,
    });
  } else if (squash(rawLocalPart) !== squash(email.split("@")[0] ?? "")) {
    issues.push({
      code: "TRUNCATED",
      severity: "minor",
      message: "Parsed email differs from the raw text near it",
      evidence: `raw: ${rawLocalPart}@..., parsed: ${email}`,
    });
  }

  return issues;
}

function reviewPhoneNumber(phone: NonNullable<AtsContact["phoneNumbers"]>[number], headerBlock: string): AtsIssue[] {
  const issues: AtsIssue[] = [];

  const rawDigits = phone.raw.replace(/\D/g, "");
  const nationalDigits = phone.nationalNumber.replace(/\D/g, "");
  if (rawDigits.length < 7 || rawDigits.length > 15) {
    issues.push({
      code: "INVALID_FORMAT",
      severity: "critical",
      message: `Parsed phone number has ${rawDigits.length} digits`,
      evidence: phone.raw,
    });
  } else if (nationalDigits && !rawDigits.endsWith(nationalDigits)) {
    issues.push({
      code: "TRUNCATED",
      severity: "minor",
      message: "Parser's normalized number doesn't match the raw digits",
      evidence: `raw: ${phone.raw}, normalized: ${phone.formatted}`,
    });
  }

  if (!squash(headerBlock).includes(squash(phone.raw))) {
    issues.push({
      code: "NOT_IN_RAW_TEXT",
      severity: "info",
      message: "Phone number wasn't found in the extracted raw text (it may be after the first 8 lines)",
      evidence: phone.raw,
    });
  }

  return issues;
}

function reviewWebsite(site: NonNullable<AtsContact["websites"]>[number], rawText: string): AtsIssue[] {
  const issues: AtsIssue[] = [];

  try {
    new URL(site.url);
  } catch {
    issues.push({
      code: "INVALID_FORMAT",
      severity: "minor",
      message: "Parsed website URL is not well-formed",
      evidence: site.url,
    });
  }

  // Websites (project links especially) can appear anywhere in the resume,
  // not just the header, so this checks the whole document rather than
  // headerBlock. Trailing slash stripped since Affinda's `domain` sometimes
  // carries one that the visible text never does (e.g. a LinkedIn URL).
  // Deliberately no "last path segment" fallback: a resume that repeats a
  // project's URL as visible text alongside the hyperlink should match on
  // the full domain, and falling back to just the slug produced false
  // negatives (e.g. "ecepathmaker" the slug matching "ecepathmaker.com"
  // elsewhere in the doc, hiding a real case of a GitHub link that's only
  // ever a hyperlink target, never visible text).
  const squashedRaw = squash(rawText);
  const squashedDomain = squash(site.domain).replace(/\/+$/, "");

  if (!squashedRaw.includes(squashedDomain)) {
    issues.push({
      code: "NOT_IN_RAW_TEXT",
      severity: "info",
      message: "URL doesn't appear in the visible resume text",
      fix: "URL likely from a hyperlink rather than visible text.",
      evidence: site.url,
    });
  }

  return issues;
}

// Assume contact fields live in the first few lines to avoid false matches
// further down (e.g. "github" mentioned in a work description). Shared with
// reviewRawText so its whole-document scan doesn't re-report the same header
// icon words reviewContact already covers.
const HEADER_LINE_COUNT = 8;

export function reviewContact(contact: AtsContact, rawText: string): SectionReview<ContactIssues> {
  const fields: ContactIssues = {};
  const review: SectionReview<ContactIssues> = emptySection(fields);

  const emails = contact.emails ?? [];
  const phoneNumbers = contact.phoneNumbers ?? [];
  const websites = contact.websites ?? [];

  const headerBlock = rawText.split("\n").slice(0, HEADER_LINE_COUNT).join("\n");

  // Icon glyphs glued to a specific email are already reported
  const emailIconWords = new Set(emails.flatMap(findIconWords));
  const headerIconWords = findIconWordsInText(headerBlock).filter((w) => !emailIconWords.has(w));
  if (headerIconWords.length > 0) {
    review.section.push({
      code: "ICON_LIGATURE",
      severity: "minor",
      message: `Icon-font glyph names found in the contact line: ${headerIconWords.join(", ")}`,
      fix: "Remove icon or use plain-text labels.",
    });
  }

  if (emails.length === 0) {
    add(fields, "emails", {
      code: "MISSING",
      severity: "critical",
    });
  } else {
    for (const email of emails) {
      for (const issue of compareEmailToRaw(email, headerBlock)) {
        add(fields, "emails", issue);
      }
    }
  }

  if (phoneNumbers.length === 0) {
    add(fields, "phoneNumbers", {
      code: "MISSING",
      severity: "critical",
    });
  } else {
    for (const phone of phoneNumbers) {
      for (const issue of reviewPhoneNumber(phone, headerBlock)) {
        add(fields, "phoneNumbers", issue);
      }
    }
  }

  if (websites.length === 0) {
    add(fields, "websites", {
      code: "MISSING",
      severity: "info",
      fix: "Add your LinkedIn, portfolio site, or project URLs.",
    });
  } else {
    for (const site of websites) {
      for (const issue of reviewWebsite(site, rawText)) {
        add(fields, "websites", issue);
      }
    }

    const seenUrls = new Set<string>();
    for (const site of websites) {
      if (seenUrls.has(site.url)) {
        add(fields, "websites", {
          code: "DUPLICATE",
          severity: "info",
          message: "Same URL parsed more than once",
          evidence: site.url,
        });
      }
      seenUrls.add(site.url);
    }

    if (!websites.some((s) => s.type === "linkedin")) {
      add(fields, "websites", {
        code: "MISSING",
        severity: "info",
        message: "No LinkedIn URL",
        fix: "Recommend adding a LinkedIn URL",
      });
    }
  }

  return review;
}

// -----------  Work Experience  -----------

export type WorkExperienceIssues = FieldIssues<"organization" | "jobTitle" | "dateRange" | "description">;

// Per-entry rules only. Cross-entry rules live in reviewWorkExperiences.
export function reviewWorkExperience(we: AtsWorkExperience): WorkExperienceIssues {
  const fields: WorkExperienceIssues = {};

  // `organization` and `jobTitle` are typed as required, but Affinda can
  // still hand back an empty string. Missing either one (unlike a missing
  // date or description) usually means the whole entry got mis-parsed
  // rather than that the applicant just left something out.
  if (!we.organization?.trim()) {
    add(fields, "organization", {
      code: "MALFORMED_BLOCK",
      severity: "critical",
      message: "Missing organization",
      fix: "Ensure consistent, simple formatting. Separate experiences into their own blocks without reusing details like organization.",
    });
  }

  if (!we.jobTitle?.trim()) {
    add(fields, "jobTitle", {
      code: "MALFORMED_BLOCK",
      severity: "critical",
      message: "Missing job title",
      fix: "Ensure consistent, simple formatting. Separate experiences into their own blocks without reusing details like organization.",
    });
  }

  if (!we.dateRange?.start?.date) {
    add(fields, "dateRange", {
      code: "MISSING",
      severity: "critical",
      message: "Missing start date",
      fix: "Write dates near the job title.",
    });
  }

  if (!we.description || we.description.trim().length === 0) {
    add(fields, "description", {
      code: "MISSING",
      severity: "minor",
      fix: "Ensure consistent, simple formatting, or add 2-4 bullets.",
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

// -----------  Projects  -----------

export type ProjectIssues = FieldIssues<"title" | "description" | "dateRange">;

export interface ProjectsReview {
  section: AtsIssue[];         // rules about the list as a whole
  entries: ProjectIssues[];    // parallel to projects[]
}

// "Name - Tech, Stack" / "Name: Tech, Stack" heading lines commonly get split
// into a full entry ("Name", with the description) plus a title-only entry
// for the same heading including the tech stack.
const TITLE_SPLIT_SEPARATORS = [" - ", " – ", " — ", " | ", ": "];

// Finds another project in the list whose title is this one's title up to a
// separator, e.g. "ECE Pathmaker" for "ECE Pathmaker - React, TypeScript".
function findSplitTitleMatch(
  title: string,
  list: AtsProject[],
  selfIndex: number
): string | undefined {
  for (const sep of TITLE_SPLIT_SEPARATORS) {
    const cut = title.indexOf(sep);
    if (cut <= 0) continue;
    const prefix = squash(title.slice(0, cut));
    const match = list.find(
      (other, j) => j !== selfIndex && other.title && squash(other.title) === prefix
    );
    if (match) return match.title;
  }
  return undefined;
}

// A "title" that's really a bullet: a wrapped description line the parser
// mistook for the start of a new project.
function looksLikeBullet(title: string, list: AtsProject[], selfIndex: number): boolean {
  const trimmed = title.trim();
  if (/^[a-z]/.test(trimmed)) return true;
  if (trimmed.split(/\s+/).filter(Boolean).length > 8) return true;

  const squashedTitle = squash(trimmed);
  return list.some(
    (other, j) =>
      j !== selfIndex && other.description && squash(other.description).includes(squashedTitle)
  );
}

// A no-description entry whose title exactly repeats another entry's title
// (e.g. a project heading parsed twice, the second time carrying only a
// date) is the same split-heading pattern as findSplitTitleMatch, just
// without a separator to key off of.
function isRepeatedTitleFragment(title: string, list: AtsProject[], selfIndex: number): boolean {
  const squashedTitle = squash(title);
  return list.some((other, j) => j !== selfIndex && other.title && squash(other.title) === squashedTitle);
}

// A bare domain ("github.com/user/repo", "example.com") rather than a real
// org/company name in `organization` is a strong signal this entry is
// really a "Tech stack | URL" line that got split off from a project
// heading into its own entry.
const BARE_DOMAIN_RE = /^[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/;

function looksLikeBareDomainOrg(organization: string | undefined): boolean {
  return !!organization && BARE_DOMAIN_RE.test(organization.trim());
}

// An entry that isn't a real (if incomplete) project, but noise from the
// parser splitting one project heading into several entries: a wrapped
// bullet mistaken for a title, a heading repeated with no new content, or a
// tech-stack/link line with no description of its own. Missing-field
// penalties are skipped for these (see reviewProject) since dinging them
// for "no description" on top of already being flagged as malformed just
// double-counts the same root cause.
function isProjectFragment(project: AtsProject, index: number, list: AtsProject[]): boolean {
  const title = project.title?.trim();
  if (!title || project.description?.trim()) return false;
  return (
    looksLikeBullet(title, list, index) ||
    isRepeatedTitleFragment(title, list, index) ||
    looksLikeBareDomainOrg(project.organization)
  );
}

// Per-entry rules only. Cross-entry rules (duplicate/split titles, the
// section summary) live in reviewProjects, since they need the full list.
export function reviewProject(
  project: AtsProject,
  index: number,
  list: AtsProject[]
): ProjectIssues {
  const fields: ProjectIssues = {};
  const title = project.title?.trim();

  if (!title) {
    add(fields, "title", {
      code: "MALFORMED_BLOCK",
      severity: "critical",
      message: "Missing title",
      fix: "Ensure consistent, simple formatting. Separate experiences into their own blocks without reusing details like organization.",
    });
  } else {
    if (looksLikeBullet(title, list, index)) {
      add(fields, "title", {
        code: "MALFORMED_BLOCK",
        severity: "critical",
        message: "This looks like a bullet point, not a project name",
        fix: "A bullet line became its own project entry. Start each line with a consistent bullet character.",
        evidence: snippet(title),
      });
    }

    const splitFrom = findSplitTitleMatch(title, list, index);
    if (splitFrom) {
      add(fields, "title", {
        code: "DUPLICATE",
        severity: "info",
        message: `Duplicate of project "${splitFrom}" with the tech stack appended`,
        fix: "Put technologies on their own line under the project.",
        evidence: snippet(title),
      });
    }

    // These don't get a MALFORMED_BLOCK (that would double-count the same
    // root cause isProjectFragment already excuses from the missing-field
    // checks below) but are worth surfacing on the entry itself, not just
    // in the section-level count, since the fix is concrete and specific.
    if (!project.description?.trim() && looksLikeBareDomainOrg(project.organization)) {
      add(fields, "title", {
        code: "DUPLICATE",
        severity: "info",
        message: "This looks like a tech-stack/link line, not its own project",
        fix: `Label it (e.g. "Tech: ${title}") directly under the real project's title instead of leaving it as its own unlabeled line.`,
        evidence: snippet(title),
      });
    }

    if (!project.description?.trim() && isRepeatedTitleFragment(title, list, index)) {
      add(fields, "title", {
        code: "DUPLICATE",
        severity: "info",
        message: "Repeats another entry's title with no new content",
        fix: "Keep the project's tech stack, link, and dates all in the same heading block as the title, rather than a second heading further down.",
        evidence: snippet(title),
      });
    }
  }

  // Skip "missing description/date" penalties on entries that are really
  // just noise from a parser split (see isProjectFragment) rather than an
  // actual incomplete project — those already get one issue above (or are
  // covered by the section-level count below), so this avoids charging the
  // same root cause three times per fragment.
  if (!isProjectFragment(project, index, list)) {
    if (!project.description || project.description.trim().length === 0) {
      add(fields, "description", {
        code: "MISSING",
        severity: "minor",
        fix: "Ensure consistent, simple formatting, or add 2-4 bullets.",
      });
    }

    if (!project.dateRange?.start?.date) {
      add(fields, "dateRange", {
        code: "MISSING",
        severity: "minor",
        message: "Missing start date",
        fix: "Write a date on the same line as the project name.",
      });
    }
  }

  return fields;
}

export function reviewProjects(list: AtsProject[]): ProjectsReview {
  const entries = list.map((p, i) => reviewProject(p, i, list));
  const section: AtsIssue[] = [];

  const fragmentCount = list.filter((p, i) => isProjectFragment(p, i, list)).length;
  if (fragmentCount > 0) {
    section.push({
      code: "DUPLICATE",
      severity: "info",
      message: `${fragmentCount} of ${list.length} project entries look like parser fragments (a tech-stack/link line, a repeated heading, or a wrapped bullet) rather than real projects.`,
      fix: 'Put the tech stack and link on their own clearly separate line under the project title, prefixed with a label like "Tech:" so it can\'t be mistaken for a separate project heading (see the per-entry notes above for which fragment is which).',
    });
  }

  return { section, entries };
}

// -----------  Education  -----------

export type EducationIssues = FieldIssues<
  "institution" | "qualification" | "level" | "fieldsOfStudy" | "dateRange" | "grade"
>;

export interface EducationReview {
  section: AtsIssue[];          // rules about the list as a whole
  entries: EducationIssues[];   // parallel to education[]
}

// Per-entry rules only. Cross-entry rules (duplicate institution) live in
// reviewEducation, since they need the full list.
export function reviewEducationEntry(ed: AtsEducation): EducationIssues {
  const fields: EducationIssues = {};

  if (!ed.institution?.trim()) {
    add(fields, "institution", {
      code: "MALFORMED_BLOCK",
      severity: "critical",
      message: "Missing institution",
      fix: "Ensure consistent, simple formatting. Separate education entries into their own blocks.",
    });
  }

  if (!ed.dateRange?.start?.date && !ed.dateRange?.end?.date) {
    add(fields, "dateRange", {
      code: "MISSING",
      severity: "minor",
      fix: "Write a date range (or expected graduation date) near the institution name.",
    });
  }

  if (!ed.qualification?.trim()) {
    add(fields, "qualification", {
      code: "MISSING",
      severity: "minor",
      message: "Missing degree qualification (e.g. BASc, BSc, MEng)",
      fix: "Write the degree abbreviation next to your field of study.",
    });
  }

  // Affinda infers `level` from recognizing the qualification/degree text;
  // an empty level with a qualification present means that text wasn't
  // recognized as a standard degree name.
  if (!ed.level?.trim()) {
    add(fields, "level", {
      code: "LOW_CONFIDENCE",
      severity: "info",
      message: "Degree level (e.g. bachelor's, master's) not recognized",
      fix: 'Use a standard degree name (e.g. "BASc").',
    });
  }

  if (!ed.fieldsOfStudy || ed.fieldsOfStudy.length === 0) {
    // No field of study in high school
    add(fields, "fieldsOfStudy", {
      code: "MISSING",
      severity: "info",
      fix: "Write your major/field of study near the degree, if post-secondary.",
    });
  }

  if (ed.qualification?.trim() && endsOnStopword(ed.qualification)) {
    add(fields, "qualification", {
      code: "TRUNCATED",
      severity: "minor",
      message: "Qualification looks cut off mid-phrase",
      fix: 'Keep the full degree title on one line (e.g. "Bachelor of Computer Engineering"), separate from the institution name.',
      evidence: snippet(ed.qualification, "end"),
    });
  }

  // Just listing award is also shown in Affinda's example
  if (ed.grade?.metric && !ed.grade.value) {
    add(fields, "grade", {
      code: "LOW_CONFIDENCE",
      severity: "info",
      message: `Parsed a grade ("${ed.grade.metric}") with no value`,
      fix: "If this is an award or honor rather than a GPA, consider listing it under Achievements instead. Add GPA if high.",
      evidence: ed.grade.metric,
    });
  }

  return fields;
}

export function reviewEducation(list: AtsEducation[]): EducationReview {
  const section: AtsIssue[] = [];

  if (list.length === 0) {
    section.push({
      code: "MISSING",
      severity: "critical",
      message: "No education entries found",
    });
    return { section, entries: [] };
  }

  const entries = list.map(reviewEducationEntry);

  const seen = new Set<string>();
  for (const ed of list) {
    if (!ed.institution?.trim()) continue;
    const key = squash(ed.institution);
    if (seen.has(key)) {
      section.push({
        code: "DUPLICATE",
        severity: "info",
        message: `"${ed.institution}" appears in more than one entry. Degree/minor may have been split into separate blocks`,
        evidence: ed.institution,
      });
    }
    seen.add(key);
  }

  return { section, entries };
}

// -----------  Achievements  -----------

export interface AchievementsReview {
  section: AtsIssue[];      // rules about the list as a whole
  entries: AtsIssue[][];    // parallel to achievements[]
}

// Prepositions/conjunctions/articles a complete bullet doesn't end on
const TRAILING_STOPWORDS = new Set([
  "a", "an", "the", "in", "on", "of", "to", "for", "by", "with", "and",
  "or", "via", "through", "from", "as", "at", "into", "using",
]);

function endsOnStopword(text: string): boolean {
  const words = text.trim().split(/\s+/);
  const last = words[words.length - 1]?.toLowerCase().replace(/[.,;:]$/, "");
  return !!last && TRAILING_STOPWORDS.has(last);
}

function reviewAchievement(achievement: string): AtsIssue[] {
  const issues: AtsIssue[] = [];
  const trimmed = achievement.trim();
  if (!trimmed) return issues;

  if (endsOnStopword(trimmed)) {
    issues.push({
      code: "TRUNCATED",
      severity: "info",
      message: "Achievement is cut off mid-sentence",
      fix: "Keep achievement bullets on a single line where possible. Parser may have cut off on a capital letter or symbol (oh well).",
      evidence: snippet(trimmed, "end"),
    });
  }

  if (/^[a-z]/.test(trimmed)) {
    issues.push({
      code: "WRONG_SPLIT",
      severity: "info",
      message: "Achievement starts with a lowercase",
      fix: "Keep achievement bullets on a single line where possible. Parser may have cut off on a capital letter or symbol (oh well).",
      evidence: snippet(trimmed),
    });
  }

  return issues;
}

export function reviewAchievements(achievements: string[]): AchievementsReview {
  if (achievements.length === 0) {
    return {
      section: [
        {
          code: "MISSING",
          severity: "info",
          message: "No achievements parsed",
          fix: "Add a dedicated Achievements/Awards section, or make sure quantified accomplishments stand out as their own bullets.",
        },
      ],
      entries: [],
    };
  }

  return {
    section: [],
    entries: achievements.map((a) => reviewAchievement(a)),
  };
}

// -----------  Raw text  -----------

// Typographic ligatures a PDF's text layer sometimes uses in place of the
// component letters. They render as ordinary letters on the page but extract
// as one glued character, silently breaking keyword matching
// ("finance" -> "ﬁnance").
const LIGATURES: Record<string, string> = {
  "ﬀ": "ff",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
};

const LIGATURE_RE = new RegExp(`[${Object.keys(LIGATURES).join("")}]`, "g");

// Icon fonts with no real Unicode name at all land in the Private Use Area
// instead of producing a readable glyph name like the ones in ICON_WORDS.
const PRIVATE_USE_RE = /[-]/;

// Whole-document checks, as opposed to the header-only icon-word scan in
// reviewContact. Not tied to any one field, so this returns a flat list.
export function reviewRawText(rawText: string): AtsIssue[] {
  const issues: AtsIssue[] = [];
  if (!rawText) return issues;

  // Icon words in the header line are already reported by reviewContact;
  // only scan the rest of the document here to avoid a duplicate finding.
  const bodyText = rawText.split("\n").slice(HEADER_LINE_COUNT).join("\n");

  const ligatureMatches = rawText.match(LIGATURE_RE);
  if (ligatureMatches) {
    const examples = [...new Set(ligatureMatches)].map((c) => `${c} (${LIGATURES[c]})`);
    issues.push({
      code: "ICON_LIGATURE",
      severity: "critical",
      message: `Typographic ligature character(s) found in the extracted text: ${examples.join(", ")}`,
      fix: 'These render as normal letters but extract as one glued character, breaking keyword matching (e.g. "finance" extracts as "ﬁnance"). Turn off ligatures in your PDF export.',
    });
  }

  const iconWords = findIconWordsInText(bodyText);
  if (iconWords.length > 0) {
    issues.push({
      code: "ICON_LIGATURE",
      severity: "minor",
      message: `Icon-font glyph name(s) found later in the extracted text (past the header): ${iconWords.join(", ")}`,
      fix: "An icon without a real Unicode glyph extracted as its font-internal name. Replace icons with plain text labels or standard Unicode symbols.",
    });
  }

  if (PRIVATE_USE_RE.test(rawText)) {
    issues.push({
      code: "UNEXPECTED_SYMBOL",
      severity: "minor",
      message: "Unrecognized icon-font character(s) found in the extracted text (no text equivalent)",
      fix: "Replace decorative icons with plain text or standard Unicode symbols so they don't extract as garbage characters.",
    });
  }

  if (/[a-z]-\n[a-z]/i.test(rawText)) {
    issues.push({
      code: "WRONG_SPLIT",
      severity: "info",
      message: "Word(s) appear to be hyphenated across a line break in the extracted text",
      fix: 'A hyphenated line-wrap (e.g. "opti-\\nmization") can prevent keyword matching. Usually harmless, but worth checking near important keywords.',
    });
  }

  return issues;
}

// -----------  Parse metadata  -----------

const CLASSIFICATION_CONFIDENCE = { low: 0.5, moderate: 0.7 };
const EXTRACTION_QUALITY = { critical: 0.7, minor: 0.8 };

export function reviewMeta(meta: AtsMeta | undefined): AtsIssue[] {
  const issues: AtsIssue[] = [];
  const document = meta?.document;

  if (!document) {
    issues.push({
      code: "MISSING",
      severity: "info",
      message: "No parse-quality metadata was returned",
    });
    return issues;
  }

  const classification = document.classification;
  if (classification) {
    if (classification.label && classification.label !== "resume") {
      issues.push({
        code: "LOW_CONFIDENCE",
        severity: "critical",
        message: `Document was not classified as a resume (classified as "${classification.label}")`,
        fix: "Use standard section headers (Experience, Education, Projects, Skills), a plain font, and a single-column layout.",
      });
    }

    if (typeof classification.confidence === "number") {
      const { confidence } = classification;
      if (confidence < CLASSIFICATION_CONFIDENCE.low) {
        issues.push({
          code: "LOW_CONFIDENCE",
          severity: "minor",
          message: `Low confidence that this is a resume (${confidence.toFixed(2)})`,
          fix: "Use standard section headers (Experience, Education, Projects, Skills), a plain font, and a single-column layout.",
        });
      } else if (confidence < CLASSIFICATION_CONFIDENCE.moderate) {
        issues.push({
          code: "LOW_CONFIDENCE",
          severity: "info",
          message: `Moderate confidence that this is a resume (${confidence.toFixed(2)})`,
          fix: "Use standard section headers (Experience, Education, Projects, Skills), a plain font, and a single-column layout.",
        });
      }
    }
  }

  const extractionQuality = document.extractionQuality;
  if (extractionQuality) {
    let scoreIssueAdded = false;

    if (typeof extractionQuality.score === "number") {
      const { score } = extractionQuality;
      if (score < EXTRACTION_QUALITY.critical) {
        issues.push({
          code: "LOW_CONFIDENCE",
          severity: "critical",
          message: `Low text-extraction quality (${score.toFixed(2)})`,
          fix: "Avoid icon fonts, tables, multi-column layouts, and text rendered as images.",
        });
        scoreIssueAdded = true;
      } else if (score < EXTRACTION_QUALITY.minor) {
        issues.push({
          code: "LOW_CONFIDENCE",
          severity: "minor",
          message: `Moderate text-extraction quality (${score.toFixed(2)})`,
          fix: "Avoid icon fonts, tables, multi-column layouts, and text rendered as images.",
        });
        scoreIssueAdded = true;
      }
    }

    // `band` is a coarser view of the same signal as `score`; only fall
    // back to it when the score didn't already produce an issue, so a bad
    // extraction isn't reported twice.
    if (!scoreIssueAdded && extractionQuality.band && extractionQuality.band !== "high") {
      issues.push({
        code: "LOW_CONFIDENCE",
        severity: "info",
        message: `Extraction quality band reported as "${extractionQuality.band}"`,
      });
    }
  }

  return issues;
}
