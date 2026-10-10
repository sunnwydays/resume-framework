"use client";

import Link from "next/link";
import { Fragment } from "react";
import { SortHeader, useSortedRows } from "@/components/tracker/sorting";
import { buttonCls, formatAgo, formatDate, type Application } from "@/lib/tracker/format";
import { industryLabel } from "@/lib/tracker/postings/industry";
import { levelLabel, type Level } from "@/lib/tracker/postings/level";
import { formatLength } from "@/lib/tracker/postings/term";
import { REGION_LABEL, type Region } from "@/lib/tracker/postings/region";
import { postingSortValue, type PostingSortKey as SortKey } from "@/lib/tracker/postings/sorting";
import { splitTracked, type PostingView } from "@/lib/tracker/postings/view";
import { roleType, roleTypeLabel } from "@/lib/tracker/roles";
import { trimRole, type RoleTrimOptions } from "@/lib/tracker/trimRole";
import type { SortDir } from "@/lib/tracker/sorting";
import type { PostingsStore } from "@/lib/tracker/usePostings";

interface Props {
  views: PostingView[];
  store: PostingsStore;
  addApplication: Parameters<PostingsStore["markApplied"]>[1];
  // Tidies the role shown here and the one "Applied" saves on a new application.
  trims: RoleTrimOptions;
  now: number;
}

const thCls = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500";
const tdCls = "px-3 py-2 align-top";
const smallButtonCls = `${buttonCls} px-3 py-1.5 text-center text-xs whitespace-nowrap`;

const FIRST_DIR: Record<SortKey, SortDir> = {
  posted: "desc",
  level: "asc",
  company: "asc",
  role: "asc",
  type: "asc",
  region: "asc",
};

const REGION_CLS: Record<Region, string> = {
  us: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  canada: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  other: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  unknown: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

const LEVEL_CLS: Record<Exclude<Level, "unstated">, string> = {
  intern: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  grad: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  experienced: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

function TrackedPill({ app }: { app: Application }) {
  return (
    <Link
      href="/tracker"
      title={`Already in the tracker as ${app.company} - ${app.role} (${app.status})`}
      className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:underline dark:bg-emerald-950 dark:text-emerald-300"
    >
      In tracker · {formatDate(app.applied_on)}
    </Link>
  );
}

export default function PostingsTable({ views, store, addApplication, trims, now }: Props) {
  const { sort, setSort, sorted } = useSortedRows<PostingView, SortKey>(views, postingSortValue, { key: "posted", dir: "desc" });

  const header = (key: SortKey, label: string) => (
    <SortHeader sortKey={key} label={label} sort={sort} setSort={setSort} firstDir={FIRST_DIR[key]} className={thCls} />
  );

  const { open, tracked: inTracker } = splitTracked(sorted);

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface dark:border-neutral-800">
      <table className="w-full min-w-5xl text-sm">
        <thead className="border-b border-neutral-200 dark:border-neutral-800">
          <tr>
            {header("posted", "Posted")}
            {header("company", "Company")}
            {header("role", "Role")}
            {header("level", "Level")}
            {header("region", "Region")}
            <th className={thCls}>Location</th>
            <th className={thCls}>Pay</th>
            <th className={thCls}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...open, ...inTracker].map((view, i) => {
            const { posting, region, eligibility, tracked, term, length, level } = view;
            const blocked = eligibility.level === "no";
            // Grey the tracked rows only when they sit under a separator; the
            // Applied chip is all tracked rows and shouldn't look disabled.
            const dimmed = blocked || (tracked !== null && open.length > 0);
            return (
              <Fragment key={posting.id}>
                {i === open.length && i > 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 pb-1 pt-4 text-xs font-medium text-neutral-500">
                      <div className="flex items-center gap-3">
                        <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                        {inTracker.length} already in the tracker
                        <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                      </div>
                    </td>
                  </tr>
                )}
                <tr
                  className={`border-b border-neutral-100 transition-colors hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900 ${
                    dimmed ? "opacity-60" : ""
                  }`}
                >
                  <td className={`${tdCls} whitespace-nowrap tabular-nums text-neutral-500`} title={posting.posted_at ?? undefined}>
                    {formatAgo(posting.posted_at ?? posting.first_seen_at, now)}
                  </td>
                  <td className={tdCls}>
                    <div className="font-medium">{posting.company}</div>
                    {posting.categories && <div className="text-xs text-neutral-500">{industryLabel(posting.categories)}</div>}
                  </td>
                  <td className={tdCls}>
                    <div title={posting.role}>{trimRole(posting.role, trims)}</div>
                    <div className="text-xs text-neutral-500">
                      {[roleTypeLabel(roleType(posting.role)), term?.label, length && formatLength(length)]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {blocked && <div className="mt-1 text-xs text-red-700 dark:text-red-400">Not eligible: {eligibility.why}</div>}
                    {eligibility.level === "check" && (
                      <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">Check: {eligibility.why}</div>
                    )}
                    {tracked && (
                      <div className="mt-1">
                        <TrackedPill app={tracked} />
                      </div>
                    )}
                  </td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {level.level === "unstated" ? (
                      <span title={level.why} className="text-neutral-400">
                        —
                      </span>
                    ) : (
                      <span
                        title={level.why}
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_CLS[level.level]}`}
                      >
                        {levelLabel(level.level)}
                      </span>
                    )}
                  </td>
                  <td className={tdCls}>
                    <span
                      title={region.why}
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${REGION_CLS[region.region]}`}
                    >
                      {REGION_LABEL[region.region]}
                    </span>
                  </td>
                  <td className={tdCls}>{posting.location ?? <span className="text-neutral-400">—</span>}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {posting.pay ?? <span className="text-neutral-400">—</span>}
                  </td>
                  <td className={`${tdCls} w-48 min-w-48`}>
                    <div className="grid grid-cols-2 gap-2">
                      <a href={posting.url} target="_blank" rel="noopener noreferrer" className={smallButtonCls}>
                        Open
                      </a>
                      {posting.state !== "applied" && (
                        <button
                          type="button"
                          onClick={() => store.markApplied(posting, addApplication, tracked, trims)}
                          className={smallButtonCls}
                          title={tracked ? "Link it to the application you already have" : "Add it to the tracker as applied today"}
                        >
                          Applied
                        </button>
                      )}
                      {posting.state === "new" && (
                        <button type="button" onClick={() => store.setState(posting.id, "saved")} className={smallButtonCls}>
                          Save
                        </button>
                      )}
                      {posting.state === "saved" && (
                        <button type="button" onClick={() => store.setState(posting.id, "new")} className={smallButtonCls}>
                          Unsave
                        </button>
                      )}
                      {(posting.state === "new" || posting.state === "saved") && (
                        <button type="button" onClick={() => store.setState(posting.id, "dismissed")} className={smallButtonCls}>
                          Dismiss
                        </button>
                      )}
                      {posting.state === "dismissed" && (
                        <button type="button" onClick={() => store.setState(posting.id, "new")} className={smallButtonCls}>
                          Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
