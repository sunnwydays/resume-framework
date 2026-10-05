// When an internship runs and for how long, read from the title ("Software
// Engineer Intern, Backend (Summer 2027 - Toronto)", "Co-op, 8 months") and,
// when the posting page has been read, from what it says (`start_text`, the
// start line Jobright shows; `length_text`, the sentence naming the length).
// Both are nullable and the page treats "not stated" as its own choice rather
// than guessing. Derived every render.

export type Season = "winter" | "spring" | "summer" | "fall";
const SEASON_ORDER: Season[] = ["winter", "spring", "summer", "fall"];

export interface Term {
  key: string; // "2027-summer"
  label: string; // "Summer 2027"
  order: number; // sorts terms chronologically
}

export const NO_TERM = "none";

const SEASON_WORD = "(spring|summer|fall|autumn|winter)";
// "Summer 2027", "Summer '27", "2027 Summer". A bare two-digit year isn't
// read ("Summer 10 Interns" isn't a year).
const SEASON_THEN_YEAR = new RegExp(`\\b${SEASON_WORD}(?:\\s*[/&,-]\\s*${SEASON_WORD})*[\\s,'’-]*(20\\d\\d|['’]\\d\\d)\\b`, "i");
const YEAR_THEN_SEASON = new RegExp(`\\b(20\\d\\d)\\s+${SEASON_WORD}\\b`, "i");

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// "May - August 2027", "Jan-Apr 2027": the season is named by the start month
// (the Canadian co-op convention: Jan winter, May summer, Sep fall).
const MONTH_RANGE = new RegExp(
  `\\b(${MONTHS.join("|")})[a-z]*\\.?\\s*(?:-|–|—|to)\\s*(?:${MONTHS.join("|")})[a-z]*\\.?,?\\s*(20\\d\\d)\\b`,
  "i"
);

const normalizeSeason = (word: string): Season => (word.toLowerCase() === "autumn" ? "fall" : (word.toLowerCase() as Season));
const fullYear = (y: string) => (y.length === 4 ? Number(y) : 2000 + Number(y.slice(-2)));

function term(season: Season, year: number): Term {
  const name = season[0].toUpperCase() + season.slice(1);
  return { key: `${year}-${season}`, label: `${name} ${year}`, order: year * 10 + SEASON_ORDER.indexOf(season) };
}

// A season with no year: "Intern (Winter)", "Fall Co-op". Only read next to a
// bracket or a work-term word, so "Fall Protection Engineer" isn't a term.
const WORK_TERM = "(?:intern(?:ship)?|co-?op|student|placement|term)s?";
const BARE_SEASON = new RegExp(
  String.raw`[(\[]\s*${SEASON_WORD}\s*[)\]]|\b${SEASON_WORD}\s+${WORK_TERM}\b|\b${WORK_TERM}\s*[,:-]?\s*${SEASON_WORD}\b`,
  "i"
);
// The month each season starts in (the co-op convention above, plus spring).
const SEASON_START: Record<Season, number> = { winter: 0, spring: 2, summer: 4, fall: 8 };

// The soonest run of `season` that hasn't finished when the posting was first
// seen: Winter seen in October is next year's, seen in January it's this year's.
function inferYear(season: Season, seenAt: string): number | null {
  const seen = new Date(seenAt);
  if (Number.isNaN(seen.getTime())) return null;
  return seen.getMonth() <= SEASON_START[season] + 1 ? seen.getFullYear() : seen.getFullYear() + 1;
}

function titleTerm(role: string): Term | null {
  const a = SEASON_THEN_YEAR.exec(role);
  if (a) return term(normalizeSeason(a[1]), fullYear(a[a.length - 1]));
  const b = YEAR_THEN_SEASON.exec(role);
  if (b) return term(normalizeSeason(b[2]), Number(b[1]));
  const m = MONTH_RANGE.exec(role);
  if (m) {
    const start = MONTHS.indexOf(m[1].toLowerCase().slice(0, 3));
    return term(start >= 8 ? "fall" : start >= 4 ? "summer" : "winter", Number(m[2]));
  }
  return null;
}

export interface TermSources {
  startText?: string | null; // "Start in 2027 Winter", from the posting page
  seenAt?: string | null; // when the alert arrived: gives a year to a bare season
}

// Order of trust: a season and year in the title, then the posting page's start
// line, then a bare season in the title with the year worked out from `seenAt`.
export function postingTerm(role: string, { startText, seenAt }: TermSources = {}): Term | null {
  const fromTitle = titleTerm(role);
  if (fromTitle) return fromTitle;
  const fromPage = startText ? titleTerm(startText) : null;
  if (fromPage) return fromPage;
  const bare = BARE_SEASON.exec(role);
  if (!bare || !seenAt) return null;
  const season = normalizeSeason(bare.slice(1).find((g) => g && /^(?:spring|summer|fall|autumn|winter)$/i.test(g)) ?? "");
  const year = inferYear(season, seenAt);
  return year === null ? null : term(season, year);
}

// ---------------------------------------------------------------- length

export interface Length {
  min: number; // months
  max: number;
}

const MAX_MONTHS = 24;
const COUNT = "(\\d{1,2})";
const RANGE = "(?:\\s*(?:-|–|—|to)\\s*(\\d{1,2}))?";
const MONTHS_RE = new RegExp(`\\b${COUNT}${RANGE}[\\s-]*(?:months?|mos?)\\b`, "i");
const WEEKS_RE = new RegExp(`\\b${COUNT}${RANGE}[\\s-]*weeks?\\b`, "i");

function range(a: string, b: string | undefined, perUnit: number): Length | null {
  const lo = Math.round(Number(a) * perUnit);
  const hi = Math.round(Number(b ?? a) * perUnit);
  const [min, max] = lo <= hi ? [lo, hi] : [hi, lo];
  return min >= 1 && max <= MAX_MONTHS ? { min, max } : null;
}

// "8, or 12-month position", "16-week internship program", "duration: 4
// months". Needs a noun after the number or a word like "duration" before it,
// so "within 12 months of graduating" isn't a length.
const NUMS = String.raw`(\d{1,2}(?:\s*(?:,|/|-|–|—|to|or|and)\s*(?:or\s+|and\s+)?\d{1,2})*)`;
const LENGTH_NOUN = String.raw`(?:position|term|internship|intern|co-?op|placement|work\s+term|program|programme|contract|role|opportunity|commitment)`;
const TEXT_MONTHS = [
  new RegExp(String.raw`\b${NUMS}[\s-]*months?\s+${LENGTH_NOUN}\b`, "i"),
  new RegExp(String.raw`\b(?:duration|length|term|commitment)\b[^.\d]{0,30}?${NUMS}[\s-]*months?\b`, "i"),
];
const TEXT_WEEKS = [
  new RegExp(String.raw`\b${NUMS}[\s-]*weeks?\s+${LENGTH_NOUN}\b`, "i"),
  new RegExp(String.raw`\b(?:duration|length|term|commitment)\b[^.\d]{0,30}?${NUMS}[\s-]*weeks?\b`, "i"),
];

function textRange(nums: string, perUnit: number): Length | null {
  const all = nums.match(/\d+/g)!.map(Number);
  return range(String(Math.min(...all)), String(Math.max(...all)), perUnit);
}

// For sentences from the posting page, where the length sits in prose.
export function lengthFromText(text: string): Length | null {
  for (const re of TEXT_MONTHS) {
    const m = re.exec(text);
    if (m) return textRange(m[1], 1);
  }
  for (const re of TEXT_WEEKS) {
    const m = re.exec(text);
    if (m) return textRange(m[1], 1 / 4.345);
  }
  return null;
}

// The title first, then the sentence read from the posting page.
export function postingLength(role: string, lengthText?: string | null): Length | null {
  const months = MONTHS_RE.exec(role);
  if (months) return range(months[1], months[2], 1);
  const weeks = WEEKS_RE.exec(role);
  if (weeks) return range(weeks[1], weeks[2], 1 / 4.345);
  return lengthText ? lengthFromText(lengthText) : null;
}

export type LengthBucket = "short" | "medium" | "long" | "unstated";

export const LENGTH_BUCKETS: { key: LengthBucket; label: string; hint: string }[] = [
  { key: "short", label: "Up to 4 months", hint: "A standard summer internship" },
  { key: "medium", label: "5–8 months", hint: "A one- or two-term stretch" },
  { key: "long", label: "9+ months", hint: "A full co-op year" },
  { key: "unstated", label: "Length not stated", hint: "The title doesn't say" },
];

// By the shortest length the title allows ("4-8 months" is short: it could be 4).
export function lengthBucket(length: Length | null): LengthBucket {
  if (!length) return "unstated";
  return length.min <= 4 ? "short" : length.min <= 8 ? "medium" : "long";
}

export function formatLength(length: Length): string {
  return length.min === length.max ? `${length.min} mo` : `${length.min}–${length.max} mo`;
}
