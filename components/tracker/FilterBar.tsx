"use client";

import Chip from "@/components/tracker/Chip";
import {
  DEFAULT_APP_FILTERS,
  NO_REPLY_LABEL,
  isDefault,
  type AppFilters,
  type AppliedWithin,
  type AssessmentFilters,
  type OutcomeFilter,
} from "@/lib/tracker/filters";
import { ROLE_TYPES, roleTypeLabel, type RoleType } from "@/lib/tracker/roles";

// The second row of filters under the status/kind chips: role type (shared
// by both tabs) plus each tab's own toggles.

const selectCls =
  "rounded-md border border-neutral-300 bg-surface px-2 py-1 text-xs focus:border-neutral-500 focus:outline-none dark:border-neutral-700";

export function RoleTypeChips({
  counts,
  selected,
  onChange,
}: {
  counts: Map<RoleType, number>;
  selected: Set<RoleType>;
  onChange: (next: Set<RoleType>) => void;
}) {
  function toggle(key: RoleType) {
    const next = new Set(selected);
    if (!next.delete(key)) next.add(key);
    onChange(next);
  }
  // A selected type stays visible even if this tab has none of it.
  const present = ROLE_TYPES.filter((t) => counts.has(t.key) || selected.has(t.key));
  if (present.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-neutral-500">Role type</span>
      {present.map((t) => (
        <Chip
          key={t.key}
          active={selected.has(t.key)}
          onClick={() => toggle(t.key)}
          label={roleTypeLabel(t.key)}
          count={counts.get(t.key) ?? 0}
        />
      ))}
    </div>
  );
}

interface CommonProps {
  typeCounts: Map<RoleType, number>;
  roleTypes: Set<RoleType>;
  onRoleTypes: (next: Set<RoleType>) => void;
  onClear: () => void;
}

export function ApplicationFilterBar({
  filters,
  onChange,
  typeCounts,
  roleTypes,
  onRoleTypes,
  onClear,
}: CommonProps & { filters: AppFilters; onChange: (next: AppFilters) => void }) {
  const set = <K extends keyof AppFilters>(key: K, value: AppFilters[K]) => onChange({ ...filters, [key]: value });
  const dirty = !isDefault(filters, DEFAULT_APP_FILTERS) || roleTypes.size > 0;
  return (
    <div className="space-y-2">
      <RoleTypeChips counts={typeCounts} selected={roleTypes} onChange={onRoleTypes} />
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={filters.hideRejected} onClick={() => set("hideRejected", !filters.hideRejected)} label="Hide rejected" />
        <Chip
          active={filters.hasSteps}
          onClick={() => set("hasSteps", !filters.hasSteps)}
          label="Has OA / interview"
          title="Has an assessment or interview, or reached that stage"
        />
        <Chip
          active={filters.noReply}
          onClick={() => set("noReply", !filters.noReply)}
          label={NO_REPLY_LABEL}
          title="Still just applied, no steps, and applied a month or more ago"
        />
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          Applied
          <select
            value={filters.appliedWithin}
            onChange={(e) => set("appliedWithin", Number(e.target.value) as AppliedWithin)}
            className={selectCls}
          >
            <option value={0}>any time</option>
            <option value={7}>last 7 days</option>
            <option value={30}>last 30 days</option>
            <option value={90}>last 90 days</option>
          </select>
        </label>
        {dirty && (
          <button type="button" onClick={onClear} className="text-xs text-neutral-500 underline">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

const OUTCOME_OPTIONS: [OutcomeFilter, string][] = [
  ["any", "any result"],
  ["waiting", "waiting"],
  ["passed", "passed"],
  ["failed", "failed"],
  ["bombed", "bombed"],
  ["expired", "expired"],
  ["unset", "not set"],
];

export function AssessmentFilterBar({
  filters,
  onChange,
  typeCounts,
  roleTypes,
  onRoleTypes,
  onClear,
}: CommonProps & { filters: AssessmentFilters; onChange: (next: AssessmentFilters) => void }) {
  const set = <K extends keyof AssessmentFilters>(key: K, value: AssessmentFilters[K]) =>
    onChange({ ...filters, [key]: value });
  // Status and kind have their own chips; only the extras count as "dirty".
  const dirty =
    filters.outcome !== "any" ||
    filters.hideRejected ||
    filters.importantOnly ||
    filters.overdueOnly ||
    roleTypes.size > 0;
  return (
    <div className="space-y-2">
      <RoleTypeChips counts={typeCounts} selected={roleTypes} onChange={onRoleTypes} />
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={filters.importantOnly} onClick={() => set("importantOnly", !filters.importantOnly)} label="★ Important only" />
        <Chip active={filters.overdueOnly} onClick={() => set("overdueOnly", !filters.overdueOnly)} label="Overdue only" />
        <Chip
          active={filters.hideRejected}
          onClick={() => set("hideRejected", !filters.hideRejected)}
          label="Hide rejected apps"
        />
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          Result
          <select
            value={filters.outcome}
            onChange={(e) => set("outcome", e.target.value as OutcomeFilter)}
            className={selectCls}
          >
            {OUTCOME_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {dirty && (
          <button type="button" onClick={onClear} className="text-xs text-neutral-500 underline">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
