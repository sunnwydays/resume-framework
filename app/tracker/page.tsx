"use client";

import { useMemo, useState } from "react";
import AddApplication from "@/components/tracker/AddApplication";
import ApplicationsTable from "@/components/tracker/ApplicationsTable";
import AssessmentsTable from "@/components/tracker/AssessmentsTable";
import Chip from "@/components/tracker/Chip";
import EmailReview from "@/components/tracker/email/EmailReview";
import GmailScan from "@/components/tracker/email/GmailScan";
import { ApplicationFilterBar, AssessmentFilterBar } from "@/components/tracker/FilterBar";
import ImportExport from "@/components/tracker/ImportExport";
import ApplicationStats from "@/components/tracker/stats/ApplicationStats";
import AssessmentStats from "@/components/tracker/stats/AssessmentStats";
import TimeTracker from "@/components/tracker/TimeTracker";
import UpcomingStrip from "@/components/tracker/UpcomingStrip";
import { buildReview } from "@/lib/tracker/email/review";
import { useNow, useTracker } from "@/lib/tracker/useTracker";
import {
  CLOSED,
  DEFAULT_APP_FILTERS,
  DEFAULT_ASSESSMENT_FILTERS,
  matchesApplicationFilters,
  matchesApplicationSearch,
  matchesAssessmentFilters,
  matchesAssessmentSearch,
  matchesRoleTypes,
  type AppFilters,
  type AssessmentFilters,
  type StatusFilter,
} from "@/lib/tracker/filters";
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
import { prioritize } from "@/lib/tracker/priority";
import { groupBy } from "@/lib/tracker/stats";
import { ROLE_TYPES, roleType, roleTypeLabel, type RoleType } from "@/lib/tracker/roles";

type Tab = "applications" | "assessments" | "gmail";

export default function TrackerPage() {
  const tracker = useTracker();
  const now = useNow();
  const { applications, assessments, questions, statusChanges, gmail } = tracker;
  const [tab, setTab] = useState<Tab>("applications");
  const [appFilters, setAppFilters] = useState<AppFilters>(DEFAULT_APP_FILTERS);
  const [asmtFilters, setAsmtFilters] = useState<AssessmentFilters>(DEFAULT_ASSESSMENT_FILTERS);
  const [roleTypes, setRoleTypes] = useState<Set<RoleType>>(new Set());
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedAsmtId, setExpandedAsmtId] = useState<string | null>(null);

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
  // Pending Gmail suggestions, re-matched whenever the tracker changes.
  const review = useMemo(
    () => buildReview(gmail.emails, gmail.mutes, applications, assessments, statusChanges),
    [gmail.emails, gmail.mutes, applications, assessments, statusChanges]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: applications.length, active: 0 };
    for (const a of applications) {
      c[a.status] = (c[a.status] ?? 0) + 1;
      if (!CLOSED.includes(a.status as AppStatus)) c.active++;
    }
    return c;
  }, [applications]);

  // Search and role type decide what the stats describe; the remaining
  // filters only narrow the table (hiding rejected would inflate rates).
  const statsApps = useMemo(
    () =>
      applications.filter(
        (a) => matchesRoleTypes(roleTypes, a.role) && matchesApplicationSearch(a, query)
      ),
    [applications, roleTypes, query]
  );
  const visible = useMemo(
    () =>
      statsApps.filter((a) =>
        matchesApplicationFilters(a, appFilters, assessmentsByApp.get(a.id) ?? [], now)
      ),
    [statsApps, appFilters, assessmentsByApp, now]
  );

  const asmtCounts = useMemo(() => {
    const c: Record<string, number> = { all: 0, pending: 0, completed: 0 };
    for (const a of assessments) {
      if (asmtFilters.kind && a.kind !== asmtFilters.kind) continue;
      c.all++;
      c[a.status]++;
    }
    return c;
  }, [assessments, asmtFilters.kind]);

  const statsAssessments = useMemo(
    () =>
      assessments.filter((a) => {
        const app = applicationsById.get(a.application_id);
        return (
          matchesRoleTypes(roleTypes, app?.role) &&
          matchesAssessmentSearch(a, app, questionsByAssessment.get(a.id) ?? [], query)
        );
      }),
    [assessments, applicationsById, questionsByAssessment, roleTypes, query]
  );
  const visibleAssessments = useMemo(
    () =>
      statsAssessments.filter((a) =>
        matchesAssessmentFilters(a, applicationsById.get(a.application_id), asmtFilters, now)
      ),
    [statsAssessments, applicationsById, asmtFilters, now]
  );
  // Ranked among what's on screen, so #1 is the best next pick in this view.
  const priority = useMemo(
    () => prioritize(visibleAssessments, applicationsById, now),
    [visibleAssessments, applicationsById, now]
  );

  // Role-type chips list the types present in each tab's own data.
  const typeCounts = useMemo(() => {
    const c = new Map<RoleType, number>();
    for (const a of applications) c.set(roleType(a.role), (c.get(roleType(a.role)) ?? 0) + 1);
    return c;
  }, [applications]);
  const asmtTypeCounts = useMemo(() => {
    const c = new Map<RoleType, number>();
    for (const a of assessments) {
      const app = applicationsById.get(a.application_id);
      if (app) c.set(roleType(app.role), (c.get(roleType(app.role)) ?? 0) + 1);
    }
    return c;
  }, [assessments, applicationsById]);

  const scope = useMemo(() => {
    const parts = ROLE_TYPES.filter((t) => roleTypes.has(t.key)).map((t) => roleTypeLabel(t.key));
    if (query.trim()) parts.push(`“${query.trim()}”`);
    return parts.length ? parts.join(" + ") : null;
  }, [roleTypes, query]);

  function openApplication(id: string) {
    setTab("applications");
    setAppFilters({ ...DEFAULT_APP_FILTERS, status: "all" });
    setRoleTypes(new Set());
    setQuery("");
    setExpandedId(id);
    requestAnimationFrame(() =>
      document.getElementById(`app-${id}`)?.scrollIntoView({ block: "center" })
    );
  }

  function openAssessment(id: string) {
    setTab("assessments");
    setAsmtFilters({ ...DEFAULT_ASSESSMENT_FILTERS, status: "all" });
    setRoleTypes(new Set());
    setQuery("");
    setExpandedAsmtId(id);
    requestAnimationFrame(() =>
      document.getElementById(`asmt-${id}`)?.scrollIntoView({ block: "center" })
    );
  }

  const chip = (value: StatusFilter, label: string) => (
    <Chip
      key={value}
      active={appFilters.status === value}
      onClick={() => setAppFilters({ ...appFilters, status: value })}
      label={label}
      count={counts[value] ?? 0}
    />
  );
  const asmtChip = (value: AssessmentFilters["status"], label: string) => (
    <Chip
      key={value}
      active={asmtFilters.status === value}
      onClick={() => setAsmtFilters({ ...asmtFilters, status: value })}
      label={label}
      count={asmtCounts[value] ?? 0}
    />
  );
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
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <GmailScan tracker={tracker} pending={review.groups.length} now={now} onScanned={() => setTab("gmail")} />
          <ImportExport
            applications={applications}
            assessments={assessments}
            questions={questions}
            onImported={tracker.reload}
            onClearAll={tracker.deleteAllApplications}
          />
        </div>
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
          {(review.groups.length > 0 || tab === "gmail") && tabButton("gmail", "From Gmail", review.groups.length)}
        </div>

        {tab === "gmail" &&
          (tracker.loading ? (
            <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>
          ) : (
            <EmailReview tracker={tracker} review={review} />
          ))}

        {!tracker.loading && tab === "applications" && statsApps.length > 0 && (
          <ApplicationStats
            applications={statsApps}
            assessmentsByApp={assessmentsByApp}
            changesByApp={changesByApp}
            now={now}
            scope={scope}
          />
        )}
        {!tracker.loading && tab === "assessments" && statsAssessments.length > 0 && (
          <AssessmentStats
            assessments={statsAssessments}
            applicationsById={applicationsById}
            assessmentsByApp={assessmentsByApp}
            changesByApp={changesByApp}
            questionsByAssessment={questionsByAssessment}
            now={now}
            scope={scope}
          />
        )}

        {tab !== "gmail" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
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
                className="w-full rounded-md border border-neutral-300 bg-surface px-2.5 py-1 text-sm focus:border-neutral-500 focus:outline-none sm:w-72 dark:border-neutral-700"
              />
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
                  {(Object.keys(ASSESSMENT_KINDS) as AssessmentKind[]).map((k) => (
                    <Chip
                      key={k}
                      active={asmtFilters.kind === k}
                      onClick={() => setAsmtFilters({ ...asmtFilters, kind: asmtFilters.kind === k ? null : k })}
                      label={ASSESSMENT_KINDS[k]}
                    />
                  ))}
                </>
              )}
            </div>

            {tab === "applications" ? (
              <ApplicationFilterBar
                filters={appFilters}
                onChange={setAppFilters}
                typeCounts={typeCounts}
                roleTypes={roleTypes}
                onRoleTypes={setRoleTypes}
                onClear={() => {
                  setAppFilters(DEFAULT_APP_FILTERS);
                  setRoleTypes(new Set());
                }}
              />
            ) : (
              <AssessmentFilterBar
                filters={asmtFilters}
                onChange={setAsmtFilters}
                typeCounts={asmtTypeCounts}
                roleTypes={roleTypes}
                onRoleTypes={setRoleTypes}
                onClear={() => {
                  setAsmtFilters({ ...DEFAULT_ASSESSMENT_FILTERS, status: asmtFilters.status, kind: asmtFilters.kind });
                  setRoleTypes(new Set());
                }}
              />
            )}

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
                  priority={priority}
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
          </>
        )}
      </section>
    </div>
  );
}
