"use client";

import { useMemo, useState } from "react";
import { sortRows, type SortDir, type SortState } from "@/lib/tracker/sorting";

export function useSortedRows<T, K extends string>(
  rows: T[],
  value: (row: T, key: K) => string | number | null,
  initial: SortState<K>
) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => sortRows(rows, value, sort), [rows, value, sort]);
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
