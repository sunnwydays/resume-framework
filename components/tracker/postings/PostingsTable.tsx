"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import ReasonChips from "@/components/tracker/feedback/ReasonChips";
import PostingEditRow from "@/components/tracker/postings/PostingEditRow";
import { SortHeader, useSortedRows } from "@/components/tracker/sorting";
import { POSTING_DISMISS_REASONS, dismissLabelText, type DismissLabel } from "@/lib/tracker/feedback/posting";
import { buttonCls, formatAgo, formatDate, type Application } from "@/lib/tracker/format";
import { EDIT_LABEL, type PostingDraft } from "@/lib/tracker/postings/edits";
import { industryLabel } from "@/lib/tracker/postings/industry";
import { keyAction, moveIndex } from "@/lib/tracker/postings/keys";
import { levelLabel, type Level } from "@/lib/tracker/postings/level";
import { formatLength } from "@/lib/tracker/postings/term";
import { REGION_LABEL, type Region } from "@/lib/tracker/postings/region";
import { postingSortValue, type PostingSortKey as SortKey } from "@/lib/tracker/postings/sorting";
import { postingUndo, type PostingUndo } from "@/lib/tracker/postings/undo";
import { useTrackerEnv } from "@/lib/tracker/env";
import { splitTracked, trackedToMark, type PostingView } from "@/lib/tracker/postings/view";
import { roleTypeLabel } from "@/lib/tracker/roles";
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
  // Save, Dismiss and Applied report here, for the page's undo banner and the
  // feedback record (the view is what the rules said at the time).
  onAction: (undo: PostingUndo, view: PostingView) => void;
  // Unsave and Restore (not undoable, but Restore says a dismiss was wrong).
  onReopen: (view: PostingView) => void;
  // Hand edits from the row's pencil; each returns an error message or null.
  onEdit: (view: PostingView, initial: PostingDraft, draft: PostingDraft) => Promise<string | null>;
  onResetEdits: (view: PostingView) => Promise<string | null>;
  // Why each dismissed posting was dismissed, by posting id; a dismissed row
  // shows it and opens the reason chips to change it. null until loaded.
  dismissals: Map<string, DismissLabel> | null;
  onLabelDismissal: (postingId: string, feedbackId: string, label: Omit<DismissLabel, "id">) => void;
  // For a dismissed row with no dismiss event to label.
  onRecordLateDismissal: (view: PostingView) => Promise<void>;
  // "Hide every posting from this company": offered on a dismissed row whose reason is Company.
  canMute: (company: string) => boolean;
  onMuteCompany: (view: PostingView) => void;
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
  const { base } = useTrackerEnv();
  return (
    <Link
      href={`${base}?app=${app.id}`}
      title={`Already in the tracker as ${app.company} - ${app.role} (${app.status})`}
      className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:underline dark:bg-emerald-950 dark:text-emerald-300"
    >
      In tracker · {formatDate(app.applied_on)}
    </Link>
  );
}

export default function PostingsTable({
  views,
  store,
  addApplication,
  trims,
  now,
  onAction,
  onReopen,
  onEdit,
  onResetEdits,
  dismissals,
  onLabelDismissal,
  onRecordLateDismissal,
  canMute,
  onMuteCompany,
}: Props) {
  // One row at a time is a form.
  const [editing, setEditing] = useState<string | null>(null);
  // The dismissed row whose reason chips are open.
  const [labelling, setLabelling] = useState<string | null>(null);
  // Postings whose "Applied" is still saving (the button waits, so a double click adds one).
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const { sort, setSort, sorted } = useSortedRows<PostingView, SortKey>(views, postingSortValue, { key: "posted", dir: "desc" });

  const header = (key: SortKey, label: string) => (
    <SortHeader sortKey={key} label={label} sort={sort} setSort={setSort} firstDir={FIRST_DIR[key]} className={thCls} />
  );

  const { open, tracked: inTracker } = splitTracked(sorted);
  const toMark = trackedToMark(inTracker);
  const rows = [...open, ...inTracker];

  const markApplied = async (view: PostingView) => {
    const { posting, tracked } = view;
    if (posting.state === "applied" || adding.has(posting.id)) return;
    setAdding((s) => new Set(s).add(posting.id));
    try {
      const done = await store.markApplied(posting, addApplication, tracked, trims);
      if (done) onAction(postingUndo(posting, "applied", done.created), view);
    } finally {
      setAdding((s) => {
        const next = new Set(s);
        next.delete(posting.id);
        return next;
      });
    }
  };
  const save = (view: PostingView) => {
    if (view.posting.state !== "new") return;
    onAction(postingUndo(view.posting, "saved"), view);
    store.setState(view.posting.id, "saved");
  };
  const dismiss = (view: PostingView) => {
    if (view.posting.state !== "new" && view.posting.state !== "saved") return;
    onAction(postingUndo(view.posting, "dismissed"), view);
    store.setState(view.posting.id, "dismissed");
  };

  // Keyboard triage. The listener is bound once and reads the latest render through a ref.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const keyState = useRef({ rows, focusedId, editing, markApplied, save, dismiss });
  useEffect(() => {
    keyState.current = { rows, focusedId, editing, markApplied, save, dismiss };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      const typing =
        t instanceof HTMLElement && (t.isContentEditable || t.closest("input, textarea, select") !== null);
      const action = keyAction({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        typing,
        modalOpen: document.querySelector("[data-modal]") !== null,
      });
      if (!action) return;
      const s = keyState.current;
      if (s.editing) return;
      const index = s.rows.findIndex((v) => v.posting.id === s.focusedId);
      if (action === "next" || action === "prev") {
        const to = moveIndex(index < 0 ? null : index, action === "next" ? 1 : -1, s.rows.length);
        if (to === null) return;
        e.preventDefault();
        setFocusedId(s.rows[to].posting.id);
        return;
      }
      const view = s.rows[index];
      if (!view) return;
      e.preventDefault();
      if (action === "open") window.open(view.posting.url, "_blank", "noopener,noreferrer");
      else if (action === "applied") void s.markApplied(view);
      else if (action === "save") s.save(view);
      else s.dismiss(view);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Keep the focused row on screen, moving the page only when it's out of view.
  useEffect(() => {
    if (focusedId) document.querySelector(`[data-posting-row="${CSS.escape(focusedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focusedId]);

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
          {rows.map((view, i) => {
            const { posting, region, eligibility, tracked, term, length, level } = view;
            const blocked = eligibility.level === "no" || view.noSponsorship !== null || view.gradDegree !== null;
            // Grey the tracked rows only when they sit under a separator; the
            // Applied chip is all tracked rows and shouldn't look disabled.
            const dimmed = blocked || (tracked !== null && open.length > 0);
            const dismissal = posting.state === "dismissed" ? dismissals?.get(posting.id) : undefined;
            const why = dismissLabelText(dismissal);
            const labelOpen = labelling === posting.id && posting.state === "dismissed";
            return (
              <Fragment key={posting.id}>
                {i === open.length && (i > 0 || toMark.length > 0) && (
                  <tr>
                    <td colSpan={8} className="px-3 pb-1 pt-4 text-xs font-medium text-neutral-500">
                      <div className="flex items-center gap-3">
                        <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                        {inTracker.length} already in the tracker
                        {toMark.length > 0 && (
                          <button
                            type="button"
                            onClick={() => store.markTrackedApplied(toMark)}
                            className="underline hover:text-neutral-800 dark:hover:text-neutral-200"
                            title="Link each to the application it matches and move it to Applied"
                          >
                            Mark {toMark.length === 1 ? "it" : `all ${toMark.length}`} applied
                          </button>
                        )}
                        <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                      </div>
                    </td>
                  </tr>
                )}
                {editing === posting.id ? (
                  <PostingEditRow
                    view={view}
                    now={now}
                    onCancel={() => setEditing(null)}
                    onSave={async (initial, draft) => {
                      const err = await onEdit(view, initial, draft);
                      if (!err) setEditing(null);
                      return err;
                    }}
                    onReset={async () => {
                      const err = await onResetEdits(view);
                      if (!err) setEditing(null);
                      return err;
                    }}
                  />
                ) : (
                  <tr
                    data-posting-row={posting.id}
                    onClick={(e) => {
                      if (!(e.target instanceof HTMLElement) || !e.target.closest("a, button")) setFocusedId(posting.id);
                    }}
                    className={`border-b border-neutral-100 transition-colors hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900 ${
                      dimmed ? "opacity-60" : ""
                    } ${focusedId === posting.id ? "bg-sky-50 outline outline-2 -outline-offset-2 outline-sky-500 dark:bg-sky-950/40" : ""}`}
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
                        {[roleTypeLabel(view.roleType), term?.label, length && formatLength(length)].filter(Boolean).join(" · ")}
                        {view.edited.length > 0 && (
                          <span title={`You set the ${view.edited.map((f) => EDIT_LABEL[f]).join(", ")}`} className="italic">
                            {" "}
                            · edited
                          </span>
                        )}
                      </div>
                      {eligibility.level === "no" && (
                        <div className="mt-1 text-xs text-red-700 dark:text-red-400">Not eligible: {eligibility.why}</div>
                      )}
                      {view.noSponsorship && (
                        <div className="mt-1 text-xs text-red-700 dark:text-red-400">No sponsorship: {view.noSponsorship}</div>
                      )}
                      {view.gradDegree && (
                        <div className="mt-1 text-xs text-red-700 dark:text-red-400">Masters/PhD: {view.gradDegree}</div>
                      )}
                      {eligibility.level === "check" && (
                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">Check: {eligibility.why}</div>
                      )}
                      {tracked && (
                        <div className="mt-1">
                          <TrackedPill app={tracked} />
                        </div>
                      )}
                      {view.relist && (
                        <div className="mt-1 text-xs text-neutral-500" title={view.relist.why}>
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium dark:bg-neutral-800">Relisted</span>
                        </div>
                      )}
                      {view.mutedCompany && (
                        <div className="mt-1 text-xs text-neutral-500">
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium dark:bg-neutral-800">Company hidden</span>{" "}
                          <button
                            type="button"
                            onClick={() => store.removeMute(view.mutedCompany!.id)}
                            className="underline hover:text-neutral-800 dark:hover:text-neutral-200"
                          >
                            Unhide
                          </button>
                        </div>
                      )}
                      {posting.state === "dismissed" && dismissals && (
                        <div className="mt-1 text-xs text-neutral-500">
                          {why ? <>Dismissed: {why}</> : "Dismissed, no reason given"}{" "}
                          <button
                            type="button"
                            aria-expanded={labelOpen}
                            onClick={() => {
                              if (labelOpen) return setLabelling(null);
                              setLabelling(posting.id);
                              if (!dismissal) onRecordLateDismissal(view);
                            }}
                            className="underline hover:text-neutral-800 dark:hover:text-neutral-200"
                          >
                            {labelOpen ? "done" : why ? "change" : "add one"}
                          </button>
                          {dismissal?.reason === "company" && canMute(posting.company) && (
                            <>
                              {" · "}
                              <button
                                type="button"
                                onClick={() => onMuteCompany(view)}
                                className="underline hover:text-neutral-800 dark:hover:text-neutral-200"
                              >
                                Hide every posting from {posting.company}
                              </button>
                            </>
                          )}
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
                    <td className={`${tdCls} whitespace-nowrap`}>{posting.pay ?? <span className="text-neutral-400">—</span>}</td>
                    <td className={`${tdCls} w-56 min-w-56`}>
                      <div className="flex items-start gap-2">
                        <div className="grid flex-1 grid-cols-2 gap-2">
                          <a href={posting.url} target="_blank" rel="noopener noreferrer" className={smallButtonCls}>
                            Open
                          </a>
                          {posting.state !== "applied" && (
                            <button
                              type="button"
                              disabled={adding.has(posting.id)}
                              onClick={() => markApplied(view)}
                              className={`${smallButtonCls} disabled:opacity-60`}
                              title={tracked ? "Link it to the application you already have" : "Add it to the tracker as applied today"}
                            >
                              {adding.has(posting.id) ? "Adding…" : "Applied"}
                            </button>
                          )}
                          {posting.state === "new" && (
                            <button
                              type="button"
                              onClick={() => save(view)}
                              className={smallButtonCls}
                              title="Keep it on the Saved list to apply to later"
                            >
                              Save
                            </button>
                          )}
                          {posting.state === "saved" && (
                            <button type="button" onClick={() => store.setState(posting.id, "new")} className={smallButtonCls}>
                              Unsave
                            </button>
                          )}
                          {(posting.state === "new" || posting.state === "saved") && (
                            <button
                              type="button"
                              onClick={() => dismiss(view)}
                              className={smallButtonCls}
                            >
                              Dismiss
                            </button>
                          )}
                          {posting.state === "dismissed" && (
                            <button
                              type="button"
                              onClick={() => {
                                onReopen(view);
                                store.setState(posting.id, "new");
                              }}
                              className={smallButtonCls}
                            >
                              Restore
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditing(posting.id)}
                          aria-label={`Edit ${posting.company} - ${posting.role}`}
                          title="Fix anything on this row"
                          className="px-1 py-1 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
                        >
                          ✎
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {labelOpen && editing !== posting.id && (
                  <tr className="border-b border-neutral-100 bg-emerald-50 text-emerald-900 dark:border-neutral-900 dark:bg-emerald-950 dark:text-emerald-200">
                    <td colSpan={8} className="px-3 py-2">
                      {/* Keyed on the event so the chips start from its label once it's loaded. */}
                      <ReasonChips
                        key={dismissal?.id ?? "pending"}
                        reasons={POSTING_DISMISS_REASONS}
                        feedbackId={dismissal?.id}
                        initial={dismissal}
                        onSaved={(label) => dismissal && onLabelDismissal(posting.id, dismissal.id, label)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
