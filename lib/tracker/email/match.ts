// Fuzzy name matching shared by the spreadsheet import and the Gmail scan:
// "is this email's company/role the same one as that application's?".

// Optimal string alignment distance: edits plus adjacent swaps.
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// Lowercased, whitespace-collapsed: the cheap "same text" comparison key.
export const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const COMPANY_NOISE = new Set(["inc", "llc", "ltd", "limited", "corp", "corporation", "co", "company", "the", "group", "plc"]);
const companyCompact = (s: string) =>
  key(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !COMPANY_NOISE.has(w))
    .join("");

// 0 = unrelated. "Snowflake" vs "Snowflake Computing Inc." is close; vs "Microsoft" isn't.
export function companyCloseness(a: string, b: string): number {
  const x = companyCompact(a);
  const y = companyCompact(b);
  if (!x || !y) return 0;
  if (x === y) return 100;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 3 && long.startsWith(short)) return 85;
  if (short.length >= 4 && long.includes(short)) return 70;
  if (short.length >= 4 && editDistance(x, y) <= (short.length >= 7 ? 2 : 1)) return 60;
  return 0;
}

// Words that say nothing about *which* internship it is: every role here is
// a software internship in some term.
const ROLE_NOISE = new Set([
  "intern", "interns", "internship", "internships", "coop", "co", "op", "summer", "spring", "fall", "winter",
  "software", "engineer", "engineering", "developer", "development", "swe", "sde", "swd", "test", "coding", "the",
  "a", "an", "and", "of", "for", "in", "at", "new", "grad", "student", "students", "university", "program",
  "role", "position", "opportunity", "opportunities", "clone", "toronto", "canada", "remote", "us", "usa", "2025", "2026", "2027", "2028",
]);

// Spelled-out and shorthand forms of the same thing, so a posting's "Machine
// Learning" meets a tracked "swe ml" and "Database Engineering" meets "swe - db".
const ROLE_SYNONYMS: [RegExp, string][] = [
  [/\bmachine[\s-]+learning\b/g, "ml"],
  [/\bartificial[\s-]+intelligence\b/g, "ai"],
  [/\bfull[\s-]*stack\b/g, "fullstack"],
  [/\bfront[\s-]*end\b/g, "frontend"],
  [/\bback[\s-]*end\b/g, "backend"],
  [/\bdatabases?\b|\bdb\b/g, "db"],
  [/\binfrastructure\b/g, "infra"],
  [/\btest[\s-]+automation\b/g, "testautomation"],
  [/\bco-op\b/g, "coop"],
];

function roleTokens(role: string): string[] {
  let text = key(role);
  for (const [pattern, word] of ROLE_SYNONYMS) text = text.replace(pattern, word);
  return text.split(/[^a-z0-9]+/).filter((t) => t && !ROLE_NOISE.has(t));
}

// Does this title say *which* job it is ("SWE, ML"), or only that it's a job ("swe")?
export const hasDistinctRole = (role: string) => roleTokens(role).length > 0;

// 0 = unrelated, 100 = same distinguishing words. "[Spring 2027] AI/ML SWE
// Intern Coding Test" vs "Software Engineer Intern (AI / ML) - Spring 2027"
// both reduce to [ai, ml]. Titles with nothing distinguishing (plain
// "Software Engineer Intern") match each other at 50: weak, but not a clash.
export function roleCloseness(a: string, b: string): number {
  const x = roleTokens(a);
  const y = roleTokens(b);
  if (x.length === 0 && y.length === 0) return key(a) && key(b) ? 50 : 0;
  if (x.length === 0 || y.length === 0) return 0;
  const setY = new Set(y);
  const shared = x.filter((t) => setY.has(t)).length;
  // Dice coefficient over distinguishing words.
  return Math.round((2 * shared * 100) / (x.length + new Set(y).size));
}

// Does this posting URL / notes text mention the job id?
export function mentionsJobId(haystack: string | null | undefined, jobId: string | null | undefined): boolean {
  if (!haystack || !jobId) return false;
  const digits = jobId.replace(/\D/g, "");
  // Short ids ("R-1") would match everything; real requisition numbers are 5+ digits.
  return digits.length >= 5 && haystack.replace(/[\s-]/g, "").includes(digits);
}
