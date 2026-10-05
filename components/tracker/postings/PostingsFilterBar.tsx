"use client";

import Chip from "@/components/tracker/Chip";
import { RoleTypeChips } from "@/components/tracker/FilterBar";
import { POSTING_STATES, type PostingState } from "@/lib/tracker/format";
import { isDefaultPostingFilters, type PostingFilters } from "@/lib/tracker/postings/filters";
import { REGION_LABEL, type Region } from "@/lib/tracker/postings/region";
import { LENGTH_BUCKETS, type LengthBucket } from "@/lib/tracker/postings/term";
import type { RoleType } from "@/lib/tracker/roles";

export interface PostingCounts {
  state: Record<PostingState | "all", number>;
  region: Record<Region, number>;
  terms: { key: string; label: string; count: number }[]; // chronological, "not stated" last
  lengths: Map<LengthBucket, number>;
  ineligible: number; // hidden unless "Show not eligible" is on
  roleTypes: Map<RoleType, number>;
}

const STATE_LABEL: Record<PostingState | "all", string> = {
  all: "All",
  new: "New",
  saved: "Saved",
  applied: "Applied",
  dismissed: "Dismissed",
};
const REGIONS: Region[] = ["us", "canada", "other", "unknown"];

interface Props {
  filters: PostingFilters;
  onChange: (next: PostingFilters) => void;
  counts: PostingCounts;
  onClear: () => void;
}

// Search and state chips on the first row, then region, role type and the
// toggles. Counts are what each chip would show if you clicked it, with every
// other filter held.
export default function PostingsFilterBar({ filters, onChange, counts, onClear }: Props) {
  const set = <K extends keyof PostingFilters>(key: K, value: PostingFilters[K]) => onChange({ ...filters, [key]: value });

  const toggleIn = <T,>(selected: Set<T>, value: T): Set<T> => {
    const next = new Set(selected);
    if (!next.delete(value)) next.add(value);
    return next;
  };
  // A selected chip stays visible even when nothing matches it any more.
  const lengthChips = LENGTH_BUCKETS.filter((b) => counts.lengths.has(b.key) || filters.lengths.has(b.key));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filters.query}
          onChange={(e) => set("query", e.target.value)}
          placeholder="Search company, role, location, industry…"
          aria-label="Search postings"
          className="w-full rounded-md border border-neutral-300 bg-surface px-2.5 py-1 text-sm focus:border-neutral-500 focus:outline-none sm:w-72 dark:border-neutral-700"
        />
        {(["all", ...POSTING_STATES] as const).map((state) => (
          <Chip
            key={state}
            active={filters.state === state}
            onClick={() => set("state", state)}
            label={STATE_LABEL[state]}
            count={counts.state[state]}
          />
        ))}
      </div>

      <RoleTypeChips counts={counts.roleTypes} selected={filters.roleTypes} onChange={(next) => set("roleTypes", next)} />

      {counts.terms.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">Term</span>
          {counts.terms.map((t) => (
            <Chip
              key={t.key}
              active={filters.terms.has(t.key)}
              onClick={() => set("terms", toggleIn(filters.terms, t.key))}
              label={t.label}
              count={t.count}
            />
          ))}
          {lengthChips.length > 0 && <span className="mx-1 h-4 w-px bg-neutral-200 dark:bg-neutral-800" />}
          {lengthChips.map((b) => (
            <Chip
              key={b.key}
              active={filters.lengths.has(b.key)}
              onClick={() => set("lengths", toggleIn(filters.lengths, b.key))}
              label={b.label}
              count={counts.lengths.get(b.key) ?? 0}
              title={b.hint}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-500">Region</span>
        {REGIONS.map((region) => (
          <Chip
            key={region}
            active={filters.regions.has(region)}
            onClick={() => set("regions", toggleIn(filters.regions, region))}
            label={region === "unknown" ? "Unclear" : REGION_LABEL[region]}
            count={counts.region[region]}
          />
        ))}
        <span className="mx-1 h-4 w-px bg-neutral-200 dark:bg-neutral-800" />
        <Chip
          active={filters.showIneligible}
          onClick={() => set("showIneligible", !filters.showIneligible)}
          label="Show not eligible"
          count={counts.ineligible}
          title="Defense employers and clearance or citizenship-only roles, in the US"
        />
        <Chip
          active={filters.hideTracked}
          onClick={() => set("hideTracked", !filters.hideTracked)}
          label="Hide already tracked"
          title="Hide postings that match an application you already have"
        />
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          Min match
          <input
            type="number"
            min={0}
            max={100}
            value={filters.minMatch || ""}
            placeholder="0"
            onChange={(e) => set("minMatch", Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            className="w-16 rounded-md border border-neutral-300 bg-surface px-2 py-1 text-xs focus:border-neutral-500 focus:outline-none dark:border-neutral-700"
          />
          %
        </label>
        {!isDefaultPostingFilters(filters) && (
          <button type="button" onClick={onClear} className="text-xs text-neutral-500 underline">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
