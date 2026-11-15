// "You already dismissed this": Jobright relists the same job under a new
// source id (or once per city), so a new posting is a relist when a dismissed
// one has the same company and the same role. Role-level only. Derived every
// render from the edited values, never stored.

import { companyCloseness, roleCloseness } from "@/lib/tracker/email/match";
import type { JobPosting } from "@/lib/tracker/format";
import { COMPANY_MATCH, normalizedPostingRole } from "@/lib/tracker/postings/match";

// Stricter than the application match (50): hiding a posting by mistake costs
// more than showing a relist, so one differing word in a short title is not the same role.
export const RELIST_ROLE_MATCH = 90;

export interface Relist {
  of: JobPosting; // the dismissed posting it repeats
  why: string; // "You dismissed this on Nov 11"
}

export interface DismissedIndex {
  entries: { posting: JobPosting; role: string; roleText: string; at: number }[];
}

const compact = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// Pre-normalizes the dismissed postings once. `postings` should carry the text
// edits already (withTextEdits). There is no dismissed-at column, so `updated_at`
// stands in: it is stamped when the state changes, and a dismissed row is not
// otherwise rewritten by scans (details are only read for new ones).
export function buildDismissedIndex(postings: JobPosting[]): DismissedIndex {
  return {
    entries: postings
      .filter((p) => p.state === "dismissed")
      .map((p) => {
        const role = normalizedPostingRole(p);
        return { posting: p, role, roleText: compact(role), at: Date.parse(p.updated_at) || 0 };
      }),
  };
}

const dayLabel = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// The most recently dismissed match, or null. Only `new` postings can be relists.
export function postingRelist(posting: JobPosting, index: DismissedIndex): Relist | null {
  if (posting.state !== "new" || index.entries.length === 0) return null;
  const role = normalizedPostingRole(posting);
  const roleText = compact(role);
  let best: DismissedIndex["entries"][number] | null = null;
  for (const e of index.entries) {
    if (e.posting.id === posting.id) continue;
    if (best && e.at <= best.at) continue;
    if (companyCloseness(posting.company, e.posting.company) < COMPANY_MATCH) continue;
    if (!(roleText && roleText === e.roleText) && roleCloseness(role, e.role) < RELIST_ROLE_MATCH) continue;
    best = e;
  }
  return best ? { of: best.posting, why: `You dismissed this on ${dayLabel(best.at)}` } : null;
}
