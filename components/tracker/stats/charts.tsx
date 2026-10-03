"use client";

import { useRef, useState } from "react";
import { addDays, plural, weekStart } from "@/lib/tracker/stats";
import { formatDate, todayISO } from "@/lib/tracker/format";

// Small hand-rolled charts: one blue series on the surface, thin marks with
// 4px rounded data ends, hover/focus tooltips on every mark, values and
// labels in text ink (never the series color). Colors come from the --viz-*
// tokens in globals.css so light and dark are each stepped, not flipped.

type Tip = { text: string; x: number; y: number };

// Tooltip anchored to the top-center of the hovered mark, inside the chart
// box (so it never causes page overflow).
function useTip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (e: React.SyntheticEvent<HTMLElement>, text: string) => {
    const wrap = box.current?.getBoundingClientRect();
    if (!wrap) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ text, x: r.left - wrap.left + r.width / 2, y: r.top - wrap.top });
  };
  const hide = () => setTip(null);
  const node = tip && (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-neutral-200 bg-surface px-2 py-1 text-xs shadow-sm dark:border-neutral-700"
      style={{ left: tip.x, top: tip.y - 6 }}
    >
      {tip.text}
    </div>
  );
  return { box, show, hide, node };
}

export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface px-3 py-2.5 dark:border-neutral-800">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

export function ChartCard({
  title,
  note,
  children,
  className = "",
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-lg border border-neutral-200 bg-surface p-3 dark:border-neutral-800 ${className}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      {note && <p className="mt-0.5 text-xs text-neutral-500">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function FactGrid({ facts }: { facts: { label: string; value: string; detail?: string }[] }) {
  if (facts.length === 0) {
    return <p className="text-sm text-neutral-500">Not enough dated data yet.</p>;
  }
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {facts.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-xs text-neutral-500">{f.label}</dt>
          <dd className="text-lg font-semibold leading-snug">{f.value}</dd>
          {f.detail && <dd className="text-xs text-neutral-500">{f.detail}</dd>}
        </div>
      ))}
    </dl>
  );
}

// ---------- horizontal bars ----------

export interface BarItem {
  label: string;
  value: number;
  // Text after the value, e.g. a rate. Shown, never a second axis.
  note?: string;
  tip?: string;
}

export function BarList({ items, max }: { items: BarItem[]; max?: number }) {
  const { box, show, hide, node } = useTip();
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="text-sm text-neutral-500">Nothing yet.</p>;
  return (
    // gap, not space-y: space-y would give the last row a margin whenever the
    // tooltip is appended after it, growing the box on hover.
    <div ref={box} className="relative flex flex-col gap-1.5">
      {items.map((item) => (
        <div
          key={item.label}
          tabIndex={0}
          onPointerEnter={(e) => show(e, item.tip ?? `${item.label}: ${item.value}`)}
          onPointerLeave={hide}
          onFocus={(e) => show(e, item.tip ?? `${item.label}: ${item.value}`)}
          onBlur={hide}
          className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-2 rounded text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        >
          <span className="truncate text-neutral-700 dark:text-neutral-300">{item.label}</span>
          <span className="h-2 rounded-full bg-(--viz-grid)">
            <span
              className="block h-2 rounded-full bg-(--viz-1)"
              style={{ width: `${Math.max(item.value > 0 ? 2 : 0, (item.value / top) * 100)}%` }}
            />
          </span>
          <span className="whitespace-nowrap text-xs tabular-nums">
            {item.value}
            {item.note && <span className="ml-1.5 text-neutral-500">{item.note}</span>}
          </span>
        </div>
      ))}
      {node}
    </div>
  );
}

// ---------- weekly columns ----------

export function WeeklyColumns({ weeks, unit }: { weeks: { start: string; count: number }[]; unit: string }) {
  const { box, show, hide, node } = useTip();
  const max = Math.max(1, ...weeks.map((w) => w.count));
  if (weeks.length === 0) return <p className="text-sm text-neutral-500">Nothing yet.</p>;
  return (
    <div ref={box} className="relative">
      <div className="flex h-28 items-end gap-0.5 border-b border-neutral-300 dark:border-neutral-700">
        {weeks.map((w) => (
          <div
            key={w.start}
            tabIndex={0}
            onPointerEnter={(e) => show(e, `Week of ${formatDate(w.start)} · ${plural(w.count, unit)}`)}
            onPointerLeave={hide}
            onFocus={(e) => show(e, `Week of ${formatDate(w.start)} · ${plural(w.count, unit)}`)}
            onBlur={hide}
            className="flex h-full min-w-0 flex-1 items-end rounded-t focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
          >
            <span
              className="block w-full rounded-t-[4px] bg-(--viz-1)"
              style={{ height: w.count ? `${Math.max(4, (w.count / max) * 100)}%` : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-neutral-500">
        <span>{formatDate(weeks[0].start)}</span>
        <span>most in a week: {max}</span>
        <span>now</span>
      </div>
      {node}
    </div>
  );
}

// ---------- calendar heatmap ----------

const MIN_WEEKS = 12;
const MAX_WEEKS = 26;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// 0 = none, then four steps of the sequential ramp scaled to the busiest day.
function heatLevel(count: number, max: number): number {
  if (count <= 0) return 0;
  return Math.min(4, Math.ceil((count / Math.max(max, 4)) * 4));
}

export function CalendarHeatmap({
  daily,
  now,
  unit,
}: {
  daily: Map<string, number>;
  now: number;
  unit: string;
}) {
  const { box, show, hide, node } = useTip();
  const today = todayISO(now);
  const thisMonday = weekStart(today);
  const first = [...daily.keys()].sort()[0];
  const weeksBack = first ? Math.round((Date.parse(thisMonday) - Date.parse(weekStart(first))) / (7 * 86_400_000)) : 0;
  const weekCount = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, weeksBack + 1));
  const start = addDays(thisMonday, -7 * (weekCount - 1));
  const max = Math.max(0, ...daily.values());

  const columns = Array.from({ length: weekCount }, (_, w) => addDays(start, w * 7));
  const rows = ["Mon", "", "Wed", "", "Fri", "", ""];

  return (
    <div ref={box} className="relative">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="mt-[18px] grid shrink-0 grid-rows-7 gap-[3px] text-[10px] leading-3 text-neutral-500">
          {rows.map((r, i) => (
            <span key={i} className="h-3">
              {r}
            </span>
          ))}
        </div>
        <div className="grid shrink-0 grid-flow-col gap-[3px]">
          {columns.map((monday, w) => {
            const month = Number(monday.slice(5, 7)) - 1;
            const newMonth = w === 0 || month !== Number(columns[w - 1].slice(5, 7)) - 1;
            return (
              <div key={monday} className="grid grid-rows-[15px_repeat(7,0.75rem)] gap-[3px]">
                <span className="overflow-visible whitespace-nowrap text-[10px] leading-3 text-neutral-500">
                  {newMonth ? MONTHS[month] : ""}
                </span>
                {Array.from({ length: 7 }, (_, d) => {
                  const day = addDays(monday, d);
                  if (day > today) return <span key={day} className="h-3 w-3" />;
                  const count = daily.get(day) ?? 0;
                  const text = `${formatDate(day)} · ${count === 0 ? `no ${unit}s` : plural(count, unit)}`;
                  return (
                    <span
                      key={day}
                      tabIndex={-1}
                      role="img"
                      aria-label={text}
                      onPointerEnter={(e) => show(e, text)}
                      onPointerLeave={hide}
                      className="h-3 w-3 rounded-[3px]"
                      style={{ background: `var(--viz-heat-${heatLevel(count, max)})` }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-neutral-500">
        less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="h-3 w-3 rounded-[3px]" style={{ background: `var(--viz-heat-${l})` }} />
        ))}
        more
      </div>
      {node}
    </div>
  );
}
