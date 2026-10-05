// Turning parsed alerts into rows to store, when to scan from, and what a
// scan found. Nothing runs on its own: scans only happen on a button press.

import type { TablesInsert } from "@/lib/tracker/database.types";
import { todayISO, type JobPosting } from "@/lib/tracker/format";
import type { ParsedPosting } from "@/lib/tracker/postings/parse";

const DAY = 86_400_000;
// Alerts arrive daily and the page only needs recent ones.
export const FIRST_POSTING_SCAN_DAYS = 14;
// Start a day before the newest posting seen, in case an alert was late.
export const POSTING_SCAN_OVERLAP_DAYS = 1;

const FILLABLE = ["location", "pay", "referrals", "categories", "matchPct", "postedAt"] as const;

// One posting per job: the earliest sighting (its age text is the most exact,
// and its email is the one recorded), with any field it lacked filled in from
// later alerts.
export function dedupePostings(parsed: ParsedPosting[]): ParsedPosting[] {
  const sorted = [...parsed].sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt));
  const byJob = new Map<string, ParsedPosting>();
  for (const p of sorted) {
    const key = `${p.source}:${p.sourceId}`;
    const have = byJob.get(key);
    if (!have) {
      byJob.set(key, { ...p });
      continue;
    }
    const fill: Partial<ParsedPosting> = {};
    for (const field of FILLABLE) {
      if (have[field] === null && p[field] !== null) Object.assign(fill, { [field]: p[field] });
    }
    byJob.set(key, { ...have, ...fill });
  }
  return [...byJob.values()];
}

// "Scan from" as YYYY-MM-DD (local): just before the newest posting seen, or
// two weeks back on the first scan.
export function defaultPostingScanFrom(postings: Pick<JobPosting, "first_seen_at">[], now: number = Date.now()): string {
  const latest = postings.reduce((max, p) => Math.max(max, new Date(p.first_seen_at).getTime()), -Infinity);
  if (!Number.isFinite(latest)) return todayISO(now - FIRST_POSTING_SCAN_DAYS * DAY);
  return todayISO(latest - POSTING_SCAN_OVERLAP_DAYS * DAY);
}

export function toPostingRow(p: ParsedPosting): TablesInsert<"job_postings"> {
  return {
    source: p.source,
    source_id: p.sourceId,
    url: p.url,
    company: p.company,
    role: p.role,
    location: p.location,
    pay: p.pay,
    referrals: p.referrals,
    categories: p.categories,
    match_pct: p.matchPct,
    posted_at: p.postedAt,
    first_seen_at: p.firstSeenAt,
    gmail_id: p.gmailId,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "12 alerts → 31 postings, 9 new".
export function summarizePostingScan(r: { alerts: number; postings: number; saved: number }): string {
  if (r.alerts === 0) return "No Jobright alerts in that range";
  return `${plural(r.alerts, "alert")} → ${plural(r.postings, "posting")}, ${r.saved} new`;
}
