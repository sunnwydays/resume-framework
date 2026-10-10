"use client";

import { useMemo, useState } from "react";
import ClearAllDialog from "@/components/tracker/ClearAllDialog";
import OverflowMenu, { dangerMenuItemCls } from "@/components/tracker/OverflowMenu";
import PostingsFilterBar, { type PostingCounts } from "@/components/tracker/postings/PostingsFilterBar";
import PostingsScan from "@/components/tracker/postings/PostingsScan";
import PostingsTable from "@/components/tracker/postings/PostingsTable";
import { POSTING_STATES } from "@/lib/tracker/format";
import { DEFAULT_POSTING_FILTERS, matchesPostingFilters, type PostingFilters } from "@/lib/tracker/postings/filters";
import type { Level } from "@/lib/tracker/postings/level";
import type { Region } from "@/lib/tracker/postings/region";
import { NO_TERM, lengthBucket, type LengthBucket } from "@/lib/tracker/postings/term";
import { buildPostingViews } from "@/lib/tracker/postings/view";
import { ROLE_TYPES, roleType, type RoleType } from "@/lib/tracker/roles";
import { DEFAULT_TRIMS, TRIM_LABELS, trimsFromString, trimsToString, type RoleTrimOptions } from "@/lib/tracker/trimRole";
import { useLocalSetting } from "@/lib/tracker/useLocalSetting";
import { usePostings } from "@/lib/tracker/usePostings";
import { useNow, useTracker } from "@/lib/tracker/useTracker";

export default function PostingsPage() {
  const store = usePostings();
  const tracker = useTracker();
  const now = useNow();
  const [filters, setFilters] = useState<PostingFilters>(DEFAULT_POSTING_FILTERS);
  const [clearing, setClearing] = useState(false);
  // Role name tidying, shown in the table and used by "Applied" (same options as the add form).
  const [trimSetting, setTrimSetting] = useLocalSetting("tracker.postings.trims", trimsToString(DEFAULT_TRIMS));
  const trims = trimsFromString(trimSetting);
  const toggleTrim = (key: keyof RoleTrimOptions) => setTrimSetting(trimsToString({ ...trims, [key]: !trims[key] }));

  const views = useMemo(() => buildPostingViews(store.postings, tracker.applications), [store.postings, tracker.applications]);
  const shown = useMemo(() => views.filter((v) => matchesPostingFilters(v, filters)), [views, filters]);

  // Each chip's count is what clicking it would show, with the rest held.
  const counts = useMemo<PostingCounts>(() => {
    const count = (over: Partial<PostingFilters>) => views.filter((v) => matchesPostingFilters(v, { ...filters, ...over })).length;
    // Chips for a multi-select dimension: what each value would add, counted
    // over the postings that pass every *other* filter.
    const without = (over: Partial<PostingFilters>) => views.filter((v) => matchesPostingFilters(v, { ...filters, ...over }));

    const typeCounts = new Map<RoleType, number>();
    for (const v of without({ roleTypes: new Set() })) {
      const type = roleType(v.posting.role);
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    }

    const termCounts = new Map<string, { label: string; order: number; count: number }>();
    for (const v of without({ terms: new Set() })) {
      const key = v.term?.key ?? NO_TERM;
      const have = termCounts.get(key) ?? { label: v.term?.label ?? "Term not stated", order: v.term?.order ?? Infinity, count: 0 };
      termCounts.set(key, { ...have, count: have.count + 1 });
    }
    // A selected term stays visible even with nothing left under it.
    for (const key of filters.terms) {
      if (!termCounts.has(key)) {
        const known = views.find((v) => (v.term?.key ?? NO_TERM) === key)?.term;
        termCounts.set(key, { label: known?.label ?? "Term not stated", order: known?.order ?? Infinity, count: 0 });
      }
    }

    const lengthCounts = new Map<LengthBucket, number>();
    for (const v of without({ lengths: new Set() })) {
      const bucket = lengthBucket(v.length);
      lengthCounts.set(bucket, (lengthCounts.get(bucket) ?? 0) + 1);
    }

    const levelCounts = new Map<Level, number>();
    for (const v of without({ levels: new Set() })) levelCounts.set(v.level.level, (levelCounts.get(v.level.level) ?? 0) + 1);

    return {
      state: Object.fromEntries(["all", ...POSTING_STATES].map((s) => [s, count({ state: s as PostingFilters["state"] })])) as PostingCounts["state"],
      region: Object.fromEntries((["us", "canada", "other", "unknown"] as Region[]).map((r) => [r, count({ regions: new Set([r]) })])) as PostingCounts["region"],
      terms: [...termCounts.entries()].map(([key, t]) => ({ key, ...t })).sort((a, b) => a.order - b.order),
      lengths: lengthCounts,
      levels: levelCounts,
      ineligible: views.filter(
        (v) => v.eligibility.level === "no" && matchesPostingFilters(v, { ...filters, showIneligible: true })
      ).length,
      // Keep the chips in ROLE_TYPES order whatever order they were counted in.
      roleTypes: new Map(ROLE_TYPES.filter((t) => typeCounts.has(t.key)).map((t) => [t.key, typeCounts.get(t.key)!])),
    };
  }, [views, filters]);

  const loading = store.loading || tracker.loading;
  const error = store.error ?? tracker.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Postings</h1>
          <p className="max-w-prose text-sm text-neutral-600 dark:text-neutral-400">
            Jobs from your Jobright alerts, one row each. US roles you can&apos;t take (defense, clearance) are hidden by
            default, and so are new grad roles; region comes from the posting&apos;s location, term, length and level from its title
            or posting page, and nothing here checks sponsorship yet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PostingsScan store={store} postings={store.postings} now={now} />
          <OverflowMenu>
            {(close) => (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  setClearing(true);
                }}
                className={dangerMenuItemCls}
                disabled={store.postings.length === 0}
              >
                Clear all…
              </button>
            )}
          </OverflowMenu>
        </div>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              store.clearError();
              tracker.clearError();
            }}
            className="underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>
      ) : views.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">No postings yet. Scan alerts to pull Jobright alerts from Gmail.</p>
      ) : (
        <>
          <PostingsFilterBar filters={filters} onChange={setFilters} counts={counts} onClear={() => setFilters(DEFAULT_POSTING_FILTERS)} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
            <span>Role names:</span>
            {(Object.keys(TRIM_LABELS) as (keyof RoleTrimOptions)[]).map((key) => (
              <label key={key} className="flex items-center gap-1">
                <input type="checkbox" checked={trims[key]} onChange={() => toggleTrim(key)} />
                {TRIM_LABELS[key]}
              </label>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">No postings match these filters.</p>
          ) : (
            <PostingsTable views={shown} store={store} addApplication={tracker.addApplication} trims={trims} now={now} />
          )}
        </>
      )}

      {clearing && (
        <ClearAllDialog
          title="Clear all postings"
          summary={
            <>
              This deletes <strong>{store.postings.length}</strong> posting{store.postings.length === 1 ? "" : "s"}, including
              the ones you saved, applied to or dismissed. Applications already in the tracker are kept.
            </>
          }
          advice="Scanning alerts again will bring back every posting still in your inbox as new, with its saved, applied and dismissed marks gone."
          onConfirm={store.deleteAllPostings}
          onClose={() => setClearing(false)}
        />
      )}
    </div>
  );
}
