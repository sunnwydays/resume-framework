"use client";

import { useEffect, useMemo, useState } from "react";
import AddApplication from "@/components/tracker/AddApplication";
import ApplicationsTable from "@/components/tracker/ApplicationsTable";
import ImportExport from "@/components/tracker/ImportExport";
import UpcomingStrip from "@/components/tracker/UpcomingStrip";
import { supabase, useNow, useTracker } from "@/lib/tracker/useTracker";
import {
  STATUSES,
  STATUS_META,
  type AppStatus,
  type Assessment,
  type StatusChange,
} from "@/lib/tracker/format";

type Filter = "all" | "active" | AppStatus;
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
  const { applications, assessments, statusChanges } = tracker;
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  function openApplication(id: string) {
    setFilter("all");
    setQuery("");
    setExpandedId(id);
    requestAnimationFrame(() =>
      document.getElementById(`app-${id}`)?.scrollIntoView({ block: "center" })
    );
  }

  async function signOut() {
    await supabase().auth.signOut();
    window.location.href = "/tracker/login";
  }

  const chip = (value: Filter, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setFilter(value)}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        filter === value
          ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800"
      }`}
    >
      {label} <span className="tabular-nums opacity-70">{counts[value] ?? 0}</span>
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
          onImported={tracker.reload}
        />
      </header>

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
        onOpen={openApplication}
        onComplete={(id) => tracker.updateAssessment(id, { status: "completed" })}
        now={now}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {chip("active", "Active")}
          {chip("all", "All")}
          <span className="mx-1 h-4 w-px bg-neutral-200 dark:bg-neutral-800" />
          {STATUSES.map((s) => chip(s, STATUS_META[s].label))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="ml-auto w-full rounded-md border border-neutral-300 bg-surface px-2.5 py-1 text-sm focus:border-neutral-500 focus:outline-none sm:w-56 dark:border-neutral-700"
          />
        </div>

        {tracker.loading ? (
          <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>
        ) : applications.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">
            No applications yet. Paste a job link above, or import your spreadsheet.
          </p>
        ) : (
          <ApplicationsTable
            applications={visible}
            assessmentsByApp={assessmentsByApp}
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
