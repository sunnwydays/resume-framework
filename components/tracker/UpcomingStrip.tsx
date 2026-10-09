"use client";

import {
  formatDateTime,
  isOpen,
  kindLabel,
  relativeDue,
  type Application,
  type Assessment,
} from "@/lib/tracker/format";
import { sectionsLabel } from "@/lib/tracker/sections";
import { useLocalSetting } from "@/lib/tracker/useLocalSetting";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface Props {
  assessments: Assessment[];
  applicationsById: Map<string, Application>;
  onOpen: (assessmentId: string) => void;
  onComplete: (assessmentId: string) => void;
  now: number;
}

// Pending assessments that are overdue or due within a week: the replacement
// for the old OA sheet's "what do I need to do next" view.
export default function UpcomingStrip({
  assessments,
  applicationsById,
  onOpen,
  onComplete,
  now,
}: Props) {
  const upcoming = assessments
    .filter(
      (a) => isOpen(a) && a.due_at && new Date(a.due_at).getTime() - now < WINDOW_MS
    )
    .sort((a, b) => a.due_at!.localeCompare(b.due_at!));
  const undated = assessments.filter((a) => isOpen(a) && !a.due_at).length;
  const [openSetting, setOpen] = useLocalSetting("tracker.upcoming.open", "1");
  const open = openSetting !== "0";

  if (upcoming.length === 0 && undated === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        <button
          type="button"
          onClick={() => setOpen(open ? "0" : "1")}
          aria-expanded={open}
          className="flex items-center gap-1 uppercase tracking-wide hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          <span className="inline-block w-3 text-neutral-400">{open ? "▾" : "▸"}</span>
          Due this week
          {!open && upcoming.length > 0 && (
            <span className="ml-1 font-normal normal-case tracking-normal tabular-nums">· {upcoming.length}</span>
          )}
          {undated > 0 && (
            <span className="ml-2 font-normal normal-case tracking-normal">
              (+{undated} pending without a due date)
            </span>
          )}
        </button>
      </h2>
      {open && upcoming.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((a) => {
            const app = applicationsById.get(a.application_id);
            const overdue = new Date(a.due_at!).getTime() < now;
            return (
              <li
                key={a.id}
                className={`flex items-start gap-2 rounded-lg border bg-surface px-3 py-2 text-sm ${
                  overdue
                    ? "border-red-300 dark:border-red-900"
                    : a.important
                      ? "border-amber-300 dark:border-amber-800"
                      : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  title="Mark completed"
                  onChange={() => onComplete(a.id)}
                />
                <button
                  type="button"
                  onClick={() => onOpen(a.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate font-medium">
                    {a.important && <span className="text-amber-500">★ </span>}
                    {app?.company ?? "?"} · {kindLabel(a.kind)}
                  </div>
                  <div className="truncate text-xs text-neutral-500">{a.title}</div>
                  <div
                    className={`text-xs tabular-nums ${
                      overdue ? "text-red-600 dark:text-red-400" : "text-neutral-500"
                    }`}
                  >
                    {relativeDue(a.due_at!, now)} · {formatDateTime(a.due_at)}
                    {a.duration_min != null && ` · ${a.duration_min} min`}
                    {sectionsLabel(a.sections) && ` · ${sectionsLabel(a.sections)}`}
                  </div>
                </button>
                {a.link && (
                  <a
                    href={a.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs underline text-neutral-500"
                  >
                    Open
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
