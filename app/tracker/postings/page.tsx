"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ClearAllDialog from "@/components/tracker/ClearAllDialog";
import OverflowMenu, { dangerMenuItemCls } from "@/components/tracker/OverflowMenu";
import ReasonChips from "@/components/tracker/feedback/ReasonChips";
import PostingsFilterBar, { type PostingCounts } from "@/components/tracker/postings/PostingsFilterBar";
import PostingsScan from "@/components/tracker/postings/PostingsScan";
import PostingsTable from "@/components/tracker/postings/PostingsTable";
import { loadPostingDismissals, markFeedbackUndone, recordFeedback } from "@/lib/tracker/feedback/client";
import { toJson } from "@/lib/tracker/feedback/events";
import {
  POSTING_DISMISS_REASONS,
  lateDismissFeedback,
  latestDismissals,
  postingEditFeedback,
  postingFeedback,
  type DismissLabel,
  type PostingFeedbackAction,
} from "@/lib/tracker/feedback/posting";
import { planPostingEdit, type EditField, type PostingDraft, type PostingEdits } from "@/lib/tracker/postings/edits";
import { POSTING_STATES } from "@/lib/tracker/format";
import { DEFAULT_POSTING_FILTERS, matchesPostingFilters, type PostingFilters } from "@/lib/tracker/postings/filters";
import type { Level } from "@/lib/tracker/postings/level";
import type { Region } from "@/lib/tracker/postings/region";
import { NO_TERM, lengthBucket, type LengthBucket } from "@/lib/tracker/postings/term";
import { removesCreatedApp, undoMessage, type PostingUndo } from "@/lib/tracker/postings/undo";
import { buildPostingViews, postingView, ruleValues, type PostingView } from "@/lib/tracker/postings/view";
import { ROLE_TYPES, type RoleType } from "@/lib/tracker/roles";
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
      const type = v.roleType;
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
      noSponsorship: views.filter((v) => v.noSponsorship && matchesPostingFilters(v, { ...filters, showNoSponsorship: true })).length,
      // Keep the chips in ROLE_TYPES order whatever order they were counted in.
      roleTypes: new Map(ROLE_TYPES.filter((t) => typeCounts.has(t.key)).map((t) => [t.key, typeCounts.get(t.key)!])),
    };
  }, [views, filters]);

  // The last Save / Dismiss / Applied, for the undo banner; a new one replaces it.
  const [last, setLast] = useState<PostingUndo | null>(null);
  // Every action is also recorded as feedback (what the rules said, and what
  // was done); the id comes back later so Undo and the reason chips can find it.
  const FEEDBACK_ACTION: Record<PostingUndo["action"], PostingFeedbackAction> = { saved: "save", dismissed: "dismiss", applied: "applied" };
  // Each dismissed posting's reason, shown on its row (and changeable there);
  // null until loaded.
  const [dismissals, setDismissals] = useState<Map<string, DismissLabel> | null>(null);
  useEffect(() => {
    loadPostingDismissals().then((rows) => rows && setDismissals(latestDismissals(rows)));
  }, []);
  const setDismissal = (postingId: string, label: DismissLabel | null) =>
    setDismissals((cur) => {
      if (!cur) return cur;
      const next = new Map(cur);
      if (label) next.set(postingId, label);
      else next.delete(postingId);
      return next;
    });
  const labelDismissal = (postingId: string, feedbackId: string, label: Omit<DismissLabel, "id">) =>
    setDismissal(postingId, { id: feedbackId, ...label });
  // A dismissed row with no event to label gets one now (once, however often
  // the chips are opened while it's being written).
  const lateRecording = useRef(new Set<string>());
  const recordLateDismissal = async (view: PostingView) => {
    if (lateRecording.current.has(view.posting.id)) return;
    lateRecording.current.add(view.posting.id);
    const id = await recordFeedback(lateDismissFeedback(view));
    lateRecording.current.delete(view.posting.id);
    if (id) setDismissal(view.posting.id, { id, reason: null, note: null, fix: "" });
  };

  const onAction = async (undo: PostingUndo, view: PostingView) => {
    setLast(undo);
    const feedbackId = await recordFeedback(postingFeedback(view, FEEDBACK_ACTION[undo.action]));
    setLast((cur) => (cur && cur.postingId === undo.postingId && cur.action === undo.action && !cur.feedbackId ? { ...cur, feedbackId } : cur));
    if (undo.action === "dismissed" && feedbackId) setDismissal(undo.postingId, { id: feedbackId, reason: null, note: null, fix: "" });
  };
  const onReopen = (view: PostingView) => {
    if (view.posting.state === "dismissed") recordFeedback(postingFeedback(view, "restore"));
  };
  // A hand edit: store it over the parsed values and record the before/after
  // (what the row showed against what Sunny made it show).
  const saveEdits = async (view: PostingView, edits: PostingEdits, touched: EditField[], reset = false) => {
    const after = postingView({ ...view.parsed, edits: toJson(edits) }, tracker.applications);
    await store.setEdits(view.posting.id, edits);
    const event = postingEditFeedback(view, after, touched, reset);
    if (event) recordFeedback(event);
  };
  const onEdit = async (view: PostingView, initial: PostingDraft, draft: PostingDraft) => {
    const plan = planPostingEdit(view.parsed, initial, draft, (p) => {
      const r = ruleValues(p);
      return { region: r.region.region, level: r.level.level, term: r.term, length: r.length, roleType: r.roleType };
    });
    if ("error" in plan) return plan.error;
    await saveEdits(view, plan.edits, plan.touched);
    return null;
  };
  const onResetEdits = async (view: PostingView) => {
    await saveEdits(view, {}, [], true);
    return null;
  };
  const undoLast = async () => {
    if (!last) return;
    setLast(null);
    markFeedbackUndone(last.feedbackId);
    if (last.action === "dismissed") setDismissal(last.postingId, null);
    const removeApp = removesCreatedApp(last, tracker.applications, tracker.assessments);
    await store.undo(last);
    if (removeApp) await tracker.deleteApplication(last.created!.id);
  };

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
            <PostingsTable
              views={shown}
              store={store}
              addApplication={tracker.addApplication}
              trims={trims}
              now={now}
              onAction={onAction}
              onReopen={onReopen}
              onEdit={onEdit}
              onResetEdits={onResetEdits}
              dismissals={dismissals}
              onLabelDismissal={labelDismissal}
              onRecordLateDismissal={recordLateDismissal}
            />
          )}
          {/* Last in the page and sticky to the bottom of the screen, so it's in
              reach wherever in a long list the row was dismissed. */}
          {last && (
            <p className="sticky bottom-4 z-30 mx-4 flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 shadow-lg ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800">
              {undoMessage(last)}
              <button type="button" className="underline" onClick={undoLast}>
                Undo
              </button>
              {last.action === "dismissed" && (
                <ReasonChips
                  key={last.feedbackId ?? last.postingId}
                  reasons={POSTING_DISMISS_REASONS}
                  feedbackId={last.feedbackId}
                  onSaved={(label) => last.feedbackId && labelDismissal(last.postingId, last.feedbackId, label)}
                />
              )}
              <button type="button" className="ml-auto text-xs underline opacity-70" onClick={() => setLast(null)}>
                Hide
              </button>
            </p>
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
