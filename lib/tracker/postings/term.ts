// When an internship runs and for how long, read from the title ("Software
// Engineer Intern, Backend (Summer 2027 - Toronto)", "Co-op, 8 months").
// Titles often say neither, so both are nullable and the page treats "not
// stated" as its own choice rather than guessing. Derived every render.

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

export function postingTerm(role: string): Term | null {
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

export function postingLength(role: string): Length | null {
  const months = MONTHS_RE.exec(role);
  if (months) return range(months[1], months[2], 1);
  const weeks = WEEKS_RE.exec(role);
  if (weeks) return range(weeks[1], weeks[2], 1 / 4.345);
  return null;
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
