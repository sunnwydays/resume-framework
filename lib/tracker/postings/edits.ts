// Hand corrections to a posting. The parsed columns stay as the parser wrote
// them; `job_postings.edits` holds Sunny's values on top, so the original parse
// is always there to diff against (the feedback record) or to reset to.
//
// Two kinds of field: the parsed text (company, role, location, pay) replaces
// the column, and everything else re-derives from it; the derived values
// (region, level, term, length, role type) override the rule outright.

import type { JobPosting } from "@/lib/tracker/format";
import { LEVELS, type Level } from "@/lib/tracker/postings/level";
import { REGION_LABEL, type Region } from "@/lib/tracker/postings/region";
import { formatLength, postingLength, postingTerm, type Length, type Term } from "@/lib/tracker/postings/term";
import { ROLE_TYPES, type RoleType } from "@/lib/tracker/roles";

export interface PostingEdits {
  company?: string;
  role?: string;
  location?: string | null;
  pay?: string | null;
  region?: Region;
  level?: Level;
  term?: string | null; // "Summer 2027"; null = not stated
  length?: string | null; // "4 months"; null = not stated
  role_type?: RoleType;
}

export const TEXT_FIELDS = ["company", "role", "location", "pay"] as const;
export const DERIVED_FIELDS = ["region", "level", "term", "length", "role_type"] as const;
type TextField = (typeof TEXT_FIELDS)[number];
type DerivedField = (typeof DERIVED_FIELDS)[number];
export type EditField = TextField | DerivedField;

const REGIONS = Object.keys(REGION_LABEL) as Region[];
const LEVEL_KEYS = LEVELS.map((l) => l.key);
const ROLE_TYPE_KEYS = ROLE_TYPES.map((t) => t.key) as RoleType[];

const isStr = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown): v is string | null => v === null || isStr(v);

// The column is `Json`; keep only well-formed fields so a bad value can't
// break the page.
export function editsOf(posting: Pick<JobPosting, "edits">): PostingEdits {
  const e = posting.edits;
  if (!e || typeof e !== "object" || Array.isArray(e)) return {};
  const out: PostingEdits = {};
  if (isStr(e.company) && e.company.trim()) out.company = e.company;
  if (isStr(e.role) && e.role.trim()) out.role = e.role;
  if ("location" in e && strOrNull(e.location)) out.location = e.location;
  if ("pay" in e && strOrNull(e.pay)) out.pay = e.pay;
  if (REGIONS.includes(e.region as Region)) out.region = e.region as Region;
  if (LEVEL_KEYS.includes(e.level as Level)) out.level = e.level as Level;
  if ("term" in e && strOrNull(e.term)) out.term = e.term;
  if ("length" in e && strOrNull(e.length)) out.length = e.length;
  if (ROLE_TYPE_KEYS.includes(e.role_type as RoleType)) out.role_type = e.role_type as RoleType;
  return out;
}

// The posting with its text edits in place: what every rule reads.
export function withTextEdits(posting: JobPosting, edits: PostingEdits = editsOf(posting)): JobPosting {
  const out = { ...posting };
  for (const f of TEXT_FIELDS) if (f in edits) Object.assign(out, { [f]: edits[f] });
  return out;
}

// A typed term: "Summer 2027", "summer '27", or a bare "Summer" (year from
// when the alert arrived). Empty means not stated; undefined means unreadable.
export function readTermInput(text: string, seenAt?: string | null): Term | null | undefined {
  const t = text.trim();
  if (!t) return null;
  // The title rule only reads a lone season in brackets, "(Fall)".
  return postingTerm(/^(spring|summer|fall|autumn|winter)$/i.test(t) ? `(${t})` : t, { seenAt }) ?? undefined;
}

// A typed length: "4", "4-8", "4 months", "16 weeks". Same rules as titles.
export function readLengthInput(text: string): Length | null | undefined {
  const t = text.trim();
  if (!t) return null;
  return postingLength(/^\d{1,2}(\s*(-|–|to)\s*\d{1,2})?$/.test(t) ? `${t} months` : t) ?? undefined;
}

// What the edit form shows and returns, all as strings or keys.
export interface PostingDraft {
  company: string;
  role: string;
  location: string;
  pay: string;
  region: Region;
  level: Level;
  term: string;
  length: string;
  role_type: RoleType;
}

// The values a view shows, as the edit form's starting point.
export function draftOf(v: {
  posting: JobPosting;
  region: { region: Region };
  level: { level: Level };
  term: Term | null;
  length: Length | null;
  roleType: RoleType;
}): PostingDraft {
  return {
    company: v.posting.company,
    role: v.posting.role,
    location: v.posting.location ?? "",
    pay: v.posting.pay ?? "",
    region: v.region.region,
    level: v.level.level,
    term: v.term?.label ?? "",
    length: v.length ? formatLength(v.length).replace(/ mo$/, " months") : "",
    role_type: v.roleType,
  };
}

const textValue = (f: TextField, s: string): string | null => (f === "location" || f === "pay" ? s.trim() || null : s.trim());
const sameLength = (a: Length | null, b: Length | null) => (a?.min ?? null) === (b?.min ?? null) && (a?.max ?? null) === (b?.max ?? null);

// What to store after the form is saved. Only fields Sunny actually changed
// (draft differs from `initial`) are touched: a text edit equal to the parsed
// column, or a derived value equal to what the rules now say, is dropped
// instead of stored, and fields left alone keep whatever edit they had.
// `auto` re-derives a posting's values with no derived overrides.
export function planPostingEdit(
  parsed: JobPosting,
  initial: PostingDraft,
  draft: PostingDraft,
  auto: (posting: JobPosting) => { region: Region; level: Level; term: Term | null; length: Length | null; roleType: RoleType }
): { edits: PostingEdits; touched: EditField[] } | { error: string } {
  const edits: PostingEdits = editsOf(parsed);
  const touched: EditField[] = [];

  for (const f of TEXT_FIELDS) {
    if (draft[f].trim() === initial[f].trim()) continue;
    const value = textValue(f, draft[f]);
    if ((f === "company" || f === "role") && !value) return { error: `${f === "company" ? "Company" : "Role"} can't be empty` };
    touched.push(f);
    if (value === parsed[f]) delete edits[f];
    else Object.assign(edits, { [f]: value });
  }

  // What the rules say once the new text is in, before any derived override.
  const textOnly: PostingEdits = {};
  for (const f of TEXT_FIELDS) if (f in edits) Object.assign(textOnly, { [f]: edits[f] });
  const rules = auto(withTextEdits(parsed, textOnly));

  if (draft.region !== initial.region) {
    touched.push("region");
    if (draft.region === rules.region) delete edits.region;
    else edits.region = draft.region;
  }
  if (draft.level !== initial.level) {
    touched.push("level");
    if (draft.level === rules.level) delete edits.level;
    else edits.level = draft.level;
  }
  if (draft.role_type !== initial.role_type) {
    touched.push("role_type");
    if (draft.role_type === rules.roleType) delete edits.role_type;
    else edits.role_type = draft.role_type;
  }
  if (draft.term.trim() !== initial.term.trim()) {
    const term = readTermInput(draft.term, parsed.first_seen_at);
    if (term === undefined) return { error: `Couldn't read "${draft.term.trim()}" as a term; try "Summer 2027"` };
    touched.push("term");
    if ((term?.key ?? null) === (rules.term?.key ?? null)) delete edits.term;
    else edits.term = term?.label ?? null;
  }
  if (draft.length.trim() !== initial.length.trim()) {
    const length = readLengthInput(draft.length);
    if (length === undefined) return { error: `Couldn't read "${draft.length.trim()}" as a length; try "4 months"` };
    touched.push("length");
    if (sameLength(length, rules.length)) delete edits.length;
    else edits.length = length ? formatLength(length).replace(/ mo$/, " months") : null;
  }

  return { edits, touched };
}

export const EDIT_LABEL: Record<EditField, string> = {
  company: "company",
  role: "role",
  location: "location",
  pay: "pay",
  region: "region",
  level: "level",
  term: "term",
  length: "length",
  role_type: "type",
};
