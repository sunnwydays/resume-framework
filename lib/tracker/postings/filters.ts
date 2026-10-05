import type { PostingState } from "@/lib/tracker/format";
import type { PostingView } from "@/lib/tracker/postings/view";
import type { Region } from "@/lib/tracker/postings/region";
import { NO_TERM, lengthBucket, type LengthBucket } from "@/lib/tracker/postings/term";
import { roleType, type RoleType } from "@/lib/tracker/roles";

// Empty `regions` / `terms` / `lengths` / `roleTypes` mean "all", like the
// role-type chips on the other tabs. `terms` holds term keys ("2027-summer")
// and NO_TERM for postings whose title names no term.
export interface PostingFilters {
  state: PostingState | "all";
  regions: Set<Region>;
  terms: Set<string>;
  lengths: Set<LengthBucket>;
  showIneligible: boolean;
  roleTypes: Set<RoleType>;
  hideTracked: boolean;
  minMatch: number;
  query: string;
}

export const DEFAULT_POSTING_FILTERS: PostingFilters = {
  state: "new",
  regions: new Set(),
  // What Sunny is looking for: a standard summer 2027 internship. The "not
  // stated" chips are on too, because most titles say neither and would
  // otherwise all disappear; only postings that state something else are hidden.
  terms: new Set(["2027-summer", NO_TERM]),
  lengths: new Set<LengthBucket>(["short", "unstated"]),
  showIneligible: false,
  roleTypes: new Set(),
  hideTracked: true,
  minMatch: 0,
  query: "",
};

export function matchesPostingFilters({ posting, region, eligibility, tracked, term, length }: PostingView, f: PostingFilters): boolean {
  if (f.state !== "all" && posting.state !== f.state) return false;
  if (f.regions.size > 0 && !f.regions.has(region.region)) return false;
  if (f.terms.size > 0 && !f.terms.has(term?.key ?? NO_TERM)) return false;
  if (f.lengths.size > 0 && !f.lengths.has(lengthBucket(length))) return false;
  if (!f.showIneligible && eligibility.level === "no") return false;
  if (f.roleTypes.size > 0 && !f.roleTypes.has(roleType(posting.role))) return false;
  // Applied postings are tracked by definition; hiding them would empty that chip.
  if (f.hideTracked && tracked && posting.state !== "applied") return false;
  if ((posting.match_pct ?? 0) < f.minMatch) return false;
  const q = f.query.trim().toLowerCase();
  if (q && ![posting.company, posting.role, posting.location, posting.categories, posting.pay].some((v) => v?.toLowerCase().includes(q))) {
    return false;
  }
  return true;
}

const sameSet = <T,>(a: Set<T>, b: Set<T>) => a.size === b.size && [...a].every((x) => b.has(x));

export function isDefaultPostingFilters(f: PostingFilters): boolean {
  const d = DEFAULT_POSTING_FILTERS;
  return (
    f.state === d.state &&
    f.regions.size === 0 &&
    sameSet(f.terms, d.terms) &&
    sameSet(f.lengths, d.lengths) &&
    f.showIneligible === d.showIneligible &&
    f.roleTypes.size === 0 &&
    f.hideTracked === d.hideTracked &&
    f.minMatch === d.minMatch &&
    f.query === d.query
  );
}
