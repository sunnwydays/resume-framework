// Fuzzy name matching, shared so other features can reuse what the
// spreadsheet import uses to attach assessments to applications.

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
