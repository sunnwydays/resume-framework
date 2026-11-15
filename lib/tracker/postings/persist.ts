import { DEFAULT_POSTING_FILTERS, type PostingFilters } from "@/lib/tracker/postings/filters";
import type { SortState } from "@/lib/tracker/sorting";

// The Postings filters and sort survive leaving the page (sessionStorage, so one tab).
// Stored values are untrusted: anything malformed reads as the defaults.

const SET_FIELDS = ["regions", "terms", "lengths", "levels", "roleTypes"] as const;
const BOOL_FIELDS = [
  "showIneligible",
  "showNoSponsorship",
  "showHiddenRoleTypes",
  "showGradDegree",
  "showRelists",
  "showMutedCompanies",
  "hideTracked",
] as const;

export function serializeFilters(f: PostingFilters): string {
  const out: Record<string, unknown> = { state: f.state, query: f.query };
  for (const k of SET_FIELDS) out[k] = [...f[k]];
  for (const k of BOOL_FIELDS) out[k] = f[k];
  return JSON.stringify(out);
}

// Fields that are missing or the wrong type keep their default; unknown set
// members are kept as stored (chips for them simply don't exist).
export function parseFilters(raw: string | null): PostingFilters {
  const d = DEFAULT_POSTING_FILTERS;
  if (!raw) return d;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return d;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return d;
  const o = data as Record<string, unknown>;
  const next: Record<string, unknown> = { ...d };
  if (typeof o.state === "string") next.state = o.state;
  if (typeof o.query === "string") next.query = o.query;
  for (const k of SET_FIELDS) {
    const v = o[k];
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) next[k] = new Set(v);
  }
  for (const k of BOOL_FIELDS) {
    if (typeof o[k] === "boolean") next[k] = o[k];
  }
  return next as unknown as PostingFilters;
}

export function serializeSort<K extends string>(s: SortState<K>): string {
  return JSON.stringify(s);
}

export function parseSort<K extends string>(raw: string | null, validKeys: readonly K[], fallback: SortState<K>): SortState<K> {
  if (!raw) return fallback;
  try {
    const o = JSON.parse(raw) as { key?: unknown; dir?: unknown } | null;
    if (o && validKeys.includes(o.key as K) && (o.dir === "asc" || o.dir === "desc")) return { key: o.key as K, dir: o.dir };
  } catch {
    // Fall through.
  }
  return fallback;
}

export const FILTERS_KEY = "tracker.postings.filters";
export const SORT_KEY = "tracker.postings.sort";
