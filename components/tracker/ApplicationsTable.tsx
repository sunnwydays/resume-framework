"use client";

import { Fragment } from "react";
import ApplicationDetail from "@/components/tracker/ApplicationDetail";
import type { Tracker } from "@/lib/tracker/useTracker";
import {
  STATUSES,
  STATUS_META,
  formatDate,
  kindLabel,
  relativeDue,
  statusLabel,
  type AppStatus,
  type Application,
  type Assessment,
  type StatusChange,
} from "@/lib/tracker/format";

interface Props {
  applications: Application[];
  assessmentsByApp: Map<string, Assessment[]>;
  changesByApp: Map<string, StatusChange[]>;
  expandedId: string | null;
  onToggle: (id: string) => void;
  tracker: Tracker;
  now: number;
}

const thCls = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500";
const tdCls = "px-3 py-2 align-middle";

export default function ApplicationsTable({
  applications,
  assessmentsByApp,
  changesByApp,
  expandedId,
  onToggle,
  tracker,
  now,
}: Props) {
  if (applications.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-500">No applications match.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800 bg-surface">
      <table className="w-full min-w-3xl text-sm">
        <thead className="border-b border-neutral-200 dark:border-neutral-800">
          <tr>
            <th className={thCls}>Company</th>
            <th className={thCls}>Role</th>
            <th className={thCls}>Applied</th>
            <th className={thCls}>Status</th>
            <th className={thCls}>Next step</th>
            <th className={thCls}>Last change</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((app) => {
            const assessments = assessmentsByApp.get(app.id) ?? [];
            const next = nextStep(assessments, now);
            const expanded = expandedId === app.id;
            const meta = STATUS_META[app.status as AppStatus];
            return (
              <Fragment key={app.id}>
                <tr
                  id={`app-${app.id}`}
                  onClick={() => onToggle(app.id)}
                  className={`cursor-pointer border-b border-neutral-100 dark:border-neutral-900 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900 ${
                    expanded ? "bg-neutral-50 dark:bg-neutral-900" : ""
                  }`}
                >
                  <td className={`${tdCls} font-medium`}>
                    <span className="mr-1.5 inline-block w-3 text-neutral-400">{expanded ? "▾" : "▸"}</span>
                    {app.company}
                  </td>
                  <td className={tdCls}>
                    {app.url ? (
                      <a
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-500 dark:decoration-neutral-700"
                      >
                        {app.role}
                      </a>
                    ) : (
                      app.role
                    )}
                    {app.location && (
                      <div className="text-xs text-neutral-500">{app.location}</div>
                    )}
                  </td>
                  <td className={`${tdCls} tabular-nums`}>{formatDate(app.applied_on)}</td>
                  <td className={tdCls} onClick={(e) => e.stopPropagation()}>
                    <select
                      value={app.status}
                      onChange={(e) => tracker.updateApplication(app.id, { status: e.target.value })}
                      className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-neutral-400 ${meta?.cls ?? ""}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_META[s].label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={tdCls}>
                    {next ? (
                      <span className={next.overdue ? "text-red-600 dark:text-red-400" : ""}>
                        {next.important && <span className="text-amber-500">★ </span>}
                        {next.text}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className={`${tdCls} tabular-nums text-neutral-500`}>
                    {app.status !== "applied" ? (
                      <>
                        {statusLabel(app.status)} · {formatDate(app.status_changed_at)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-b border-neutral-200 dark:border-neutral-800">
                    <td colSpan={6} className="bg-background/50">
                      <ApplicationDetail
                        key={app.id}
                        app={app}
                        assessments={assessments}
                        changes={changesByApp.get(app.id) ?? []}
                        tracker={tracker}
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

// Soonest pending assessment: dated ones first, then undated.
function nextStep(assessments: Assessment[], now: number) {
  const pending = assessments
    .filter((a) => a.status === "pending")
    .sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));
  const a = pending[0];
  if (!a) return null;
  const overdue = Boolean(a.due_at && new Date(a.due_at).getTime() < now);
  return {
    text: `${kindLabel(a.kind)}${a.due_at ? ` · ${relativeDue(a.due_at, now)}` : ""}`,
    overdue,
    important: a.important,
  };
}
