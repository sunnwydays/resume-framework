"use client";

import { useEffect, useMemo, useState } from "react";
import AddApplication from "@/components/tracker/AddApplication";
import ApplicationsTable from "@/components/tracker/ApplicationsTable";
import AssessmentsTable from "@/components/tracker/AssessmentsTable";
import ImportExport from "@/components/tracker/ImportExport";
import TimeTracker from "@/components/tracker/TimeTracker";
import UpcomingStrip from "@/components/tracker/UpcomingStrip";
import { supabase, useNow, useTracker } from "@/lib/tracker/useTracker";
import {
  ASSESSMENT_KINDS,
  STATUSES,
  STATUS_META,
  type AppStatus,
  type Assessment,
  type AssessmentKind,
  type Question,
  type StatusChange,
} from "@/lib/tracker/format";

type Tab = "applications" | "assessments";
type Filter = "all" | "active" | AppStatus;
type AssessmentFilter = "pending" | "completed" | "all";
const CLOSED: AppStatus[] = ["rejected", "withdrawn"];

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}

export default function TrackerPage() {
  const tracker = useTracker();
  const now = useNow();
  const { applications, assessments, questions, statusChanges } = tracker;
  const [tab, setTab] = useState<Tab>("applications");
  const [filter, setFilter] = useState<Filter>("active");
  const [asmtFilter, setAsmtFilter] = useState<AssessmentFilter>("pending");
  const [kindFilter, setKindFilter] = useState<AssessmentKind | null>(null);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedAsmtId, setExpandedAsmtId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const assessmentsByApp = useMemo(
    () => groupBy<Assessment>(assessments, (a) => a.application_id),
    [assessments]
  );
  const questionsByAssessment = useMemo(
    () => groupBy<Question>(questions, (q) => q.assessment_id),
    [questions]
  );
  const changesByApp = useMemo(
    () => groupBy<StatusChange>(statusChanges, (c) => c.application_id),
    [statusChanges]
  );
  const applicationsById = useMemo(
    () => new Map(applications.map((a) => [a.id, a])),
    [applications]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: applications.length, active: 0 };
    for (const a of applications) {
      c[a.status] = (c[a.status] ?? 0) + 1;
      if (!CLOSED.includes(a.status as AppStatus)) c.active++;
    }
    return c;
  }, [applications]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applications.filter((a) => {
      if (filter === "active" && CLOSED.includes(a.status as AppStatus)) return false;
      if (filter !== "all" && filter !== "active" && a.status !== filter) return false;
      if (!q) return true;
      return [a.company, a.role, a.location, a.notes].some((v) => v?.toLowerCase().includes(q));
    });
  }, [applications, filter, query]);

  const asmtCounts = useMemo(() => {
    const c: Record<string, number> = { all: 0, pending: 0, completed: 0 };
    for (const a of assessments) {
      if (kindFilter && a.kind !== kindFilter) continue;
      c.all++;
      c[a.status]++;
    }
    return c;
  }, [assessments, kindFilter]);

  // Search covers the assessment, its application, and its questions.
  const visibleAssessments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assessments.filter((a) => {
      if (asmtFilter !== "all" && a.status !== asmtFilter) return false;
      if (kindFilter && a.kind !== kindFilter) return false;
      if (!q) return true;
      const app = applicationsById.get(a.application_id);
      return [
        app?.company,
        app?.role,
        a.title,
        a.details,
        a.interviewer,
        a.score,
        a.notes,
        a.prep_notes,
        a.reflection,
        ...(questionsByAssessment.get(a.id) ?? []).flatMap((x) => [x.question, x.answer]),
      ].some((v) => v?.toLowerCase().includes(q));
    });
  }, [assessments, asmtFilter, kindFilter, query, applicationsById, questionsByAssessment]);

  function openApplication(id: string) {
    setTab("applications");
    setFilter("all");
    setQuery("");
    setExpandedId(id);
    requestAnimationFrame(() =>
      document.getElementById(`app-${id}`)?.scrollIntoView({ block: "center" })
    );
  }

  function openAssessment(id: string) {
    setTab("assessments");
    setAsmtFilter("all");
    setKindFilter(null);
    setQuery("");
    setExpandedAsmtId(id);
    requestAnimationFrame(() =>
      document.getElementById(`asmt-${id}`)?.scrollIntoView({ block: "center" })
    );
  }

  async function signOut() {
    await supabase().auth.signOut();
    window.location.href = "/tracker/login";
  }

  const pill = (key: string, active: boolean, onClick: () => void, label: string, count?: number) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800"
      }`}
    >
      {label}
      {count !== undefined && <span className="tabular-nums opacity-70"> {count}</span>}
    </button>
  );
  const chip = (value: Filter, label: string) =>
    pill(value, filter === value, () => setFilter(value), label, counts[value] ?? 0);
  const asmtChip = (value: AssessmentFilter, label: string) =>
    pill(value, asmtFilter === value, () => setAsmtFilter(value), label, asmtCounts[value] ?? 0);
  const tabButton = (value: Tab, label: string, count: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setTab(value)}
      className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
        tab === value
          ? "border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100"
          : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
      }`}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Job Tracker</h1>
          {email && (
            <p className="mt-1 text-xs text-neutral-500">
              {email} ·{" "}
              <button type="button" onClick={signOut} className="underline">
                Sign out
              </button>
            </p>
          )}
        </div>
        <ImportExport
          applications={applications}
          assessments={assessments}
          questions={questions}
          onImported={tracker.reload}
          onClearAll={tracker.deleteAllApplications}
        />
      </header>

      <TimeTracker />

      {tracker.error && (
        <div className="flex items-start justify-between gap-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <span>{tracker.error}</span>
          <button type="button" onClick={tracker.clearError} className="underline">
            Dismiss
          </button>
        </div>
      )}

      <AddApplication applications={applications} onAdd={tracker.addApplication} />

      <UpcomingStrip
        assessments={assessments}
        applicationsById={applicationsById}
        onOpen={openAssessment}
        onComplete={(id) => tracker.updateAssessment(id, { status: "completed" })}
        now={now}
      />

      <section className="space-y-3">
        <div role="tablist" className="flex gap-5 border-b border-neutral-200 dark:border-neutral-800">
          {tabButton("applications", "Applications", applications.length)}
          {tabButton("assessments", "Assessments & interviews", assessments.length)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === "applications" ? (
            <>
              {chip("active", "Active")}
              {chip("all", "All")}
              <span className="mx-1 h-4 w-px bg-neutral-200 dark:bg-neutral-800" />
              {STATUSES.map((s) => chip(s, STATUS_META[s].label))}
            </>
          ) : (
            <>
              {asmtChip("pending", "Pending")}
              {asmtChip("completed", "Completed")}
              {asmtChip("all", "All")}
              <span className="mx-1 h-4 w-px bg-neutral-200 dark:bg-neutral-800" />
              {(Object.keys(ASSESSMENT_KINDS) as AssessmentKind[]).map((k) =>
                pill(k, kindFilter === k, () => setKindFilter(kindFilter === k ? null : k), ASSESSMENT_KINDS[k])
              )}
            </>
          )}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === "applications"
                ? "Search company, role, location, notes…"
                : "Search titles, notes, questions, answers…"
            }
            aria-label={tab === "applications" ? "Search applications" : "Search assessments"}
            className="ml-auto w-full rounded-md border border-neutral-300 bg-surface px-2.5 py-1 text-sm focus:border-neutral-500 focus:outline-none sm:w-72 dark:border-neutral-700"
          />
        </div>

        {tracker.loading ? (
          <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>
        ) : tab === "assessments" ? (
          assessments.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              No assessments yet. Add one from an application&rsquo;s row, or import your OA sheet.
            </p>
          ) : (
            <AssessmentsTable
              assessments={visibleAssessments}
              applicationsById={applicationsById}
              questionsByAssessment={questionsByAssessment}
              expandedId={expandedAsmtId}
              onToggle={(id) => setExpandedAsmtId((cur) => (cur === id ? null : id))}
              onOpenApplication={openApplication}
              tracker={tracker}
              now={now}
            />
          )
        ) : applications.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">
            No applications yet. Paste a job link above, or import your spreadsheet.
          </p>
        ) : (
          <ApplicationsTable
            applications={visible}
            assessmentsByApp={assessmentsByApp}
            questionsByAssessment={questionsByAssessment}
            changesByApp={changesByApp}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
            tracker={tracker}
            now={now}
          />
        )}
      </section>
    </div>
  );
}
