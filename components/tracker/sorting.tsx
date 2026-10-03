"use client";

import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir };

// Null means "nothing to sort on" and always goes last, in either
// direction. The sort is stable, so ties keep the input order.
export function useSortedRows<T, K extends string>(
  rows: T[],
  value: (row: T, key: K) => string | number | null,
  initial: SortState<K>
) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const sign = sort.dir === "asc" ? 1 : -1;
    const keyed = rows.map((row) => ({ row, v: value(row, sort.key) }));
    keyed.sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? 0 : a.v === null ? 1 : -1;
      const cmp =
        typeof a.v === "number" && typeof b.v === "number"
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v), undefined, { sensitivity: "base", numeric: true });
      return cmp * sign;
    });
    return keyed.map((k) => k.row);
  }, [rows, value, sort]);
  return { sort, setSort, sorted };
}

interface HeaderProps<K extends string> {
  sortKey: K;
  label: string;
  sort: SortState<K>;
  setSort: (s: SortState<K>) => void;
  // Direction on first click: A–Z / soonest first, or newest first for
  // dates you look back on.
  firstDir: SortDir;
  className: string;
}

export function SortHeader<K extends string>({ sortKey, label, sort, setSort, firstDir, className }: HeaderProps<K>) {
  const active = sort.key === sortKey;
  return (
    <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        onClick={() =>
          setSort(active ? { key: sortKey, dir: sort.dir === "asc" ? "desc" : "asc" } : { key: sortKey, dir: firstDir })
        }
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-neutral-800 dark:hover:text-neutral-200 ${
          active ? "text-neutral-800 dark:text-neutral-200" : ""
        }`}
      >
        {label}
        <span className={active ? "" : "invisible"}>{sort.dir === "asc" ? "↑" : "↓"}</span>
      </button>
    </th>
  );
}
