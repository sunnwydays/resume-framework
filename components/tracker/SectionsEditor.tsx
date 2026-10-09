"use client";

import { useState } from "react";
import { buttonCls, inputCls } from "@/lib/tracker/format";
import { moveItem, newSection, parseSections, totalMinutes, type Section } from "@/lib/tracker/sections";

const labelCls = "text-xs font-medium text-neutral-600 dark:text-neutral-400";
const smallButtonCls =
  "rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";
const iconCls =
  "rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800";

function Row({
  item,
  index,
  count,
  sub,
  onChange,
  onMove,
  onRemove,
}: {
  item: Section;
  index: number;
  count: number;
  sub?: boolean;
  onChange: (patch: Partial<Section>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  // Widths live on wrappers: inputCls is w-full, and a width class added
  // next to it doesn't reliably win.
  return (
    <div className="flex items-center gap-1.5">
      <label className="relative w-20 shrink-0">
        <input
          inputMode="numeric"
          value={item.minutes ?? ""}
          onChange={(e) => {
            const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
            onChange({ minutes: Number.isFinite(n) ? n : null });
          }}
          aria-label="Minutes"
          className={`${inputCls} pr-9 text-right tabular-nums`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-neutral-400">
          min
        </span>
      </label>
      <div className="min-w-0 flex-1">
        <input
          value={item.title}
          onChange={(e) => onChange({ title: e.target.value })}
          // A just-added row is ready to type in.
          autoFocus={!item.title}
          placeholder={sub ? "Sub-part, e.g. Code writing" : "Section, e.g. Coding Challenge"}
          aria-label={sub ? "Sub-part title" : "Section title"}
          className={inputCls}
        />
      </div>
      <button type="button" title="Move up" disabled={index === 0} onClick={() => onMove(-1)} className={iconCls}>
        ↑
      </button>
      <button type="button" title="Move down" disabled={index === count - 1} onClick={() => onMove(1)} className={iconCls}>
        ↓
      </button>
      <button type="button" title="Remove" onClick={onRemove} className={`${iconCls} hover:text-red-600`}>
        ×
      </button>
    </div>
  );
}

// The parts of one OA / interview, two levels deep. Notes aren't edited here
// (the detail panel owns them); "Paste breakdown" fills it from an invite.
export default function SectionsEditor({
  value,
  onChange,
  startPasting = false,
}: {
  value: Section[];
  onChange: (s: Section[]) => void;
  startPasting?: boolean;
}) {
  const [pasting, setPasting] = useState(startPasting);
  const [pasted, setPasted] = useState("");
  const total = totalMinutes(value);

  const set = (i: number, patch: Partial<Section>) => onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setParts = (i: number, parts: Section[]) => set(i, { parts });

  const fill = () => {
    const parsed = parseSections(pasted);
    if (!parsed.length) return;
    onChange([...value, ...parsed]);
    setPasted("");
    setPasting(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className={labelCls}>
          Sections
          {total != null && <span className="font-normal text-neutral-500"> · {total} min total</span>}
        </span>
        <span className="text-xs text-neutral-500">For an OA with several parts; leave empty if it&apos;s one thing</span>
      </div>

      {value.length > 0 && (
        <ol className="space-y-3">
          {value.map((s, i) => (
            <li key={s.id} className="space-y-1.5 rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
              <Row
                item={s}
                index={i}
                count={value.length}
                onChange={(patch) => set(i, patch)}
                onMove={(d) => onChange(moveItem(value, i, d))}
                onRemove={() => onChange(value.filter((_, j) => j !== i))}
              />
              <textarea
                value={s.details ?? ""}
                onChange={(e) => set(i, { details: e.target.value || null })}
                placeholder="What it is (optional)"
                aria-label="Section details"
                rows={s.details && s.details.length > 80 ? 3 : 1}
                className={inputCls}
              />
              {s.parts.length > 0 && (
                <ol className="space-y-1.5 border-l-2 border-neutral-200 pl-3 dark:border-neutral-800">
                  {s.parts.map((p, k) => (
                    <li key={p.id}>
                      <Row
                        item={p}
                        index={k}
                        count={s.parts.length}
                        sub
                        onChange={(patch) => setParts(i, s.parts.map((x, j) => (j === k ? { ...x, ...patch } : x)))}
                        onMove={(d) => setParts(i, moveItem(s.parts, k, d))}
                        onRemove={() => setParts(i, s.parts.filter((_, j) => j !== k))}
                      />
                    </li>
                  ))}
                </ol>
              )}
              <button
                type="button"
                onClick={() => setParts(i, [...s.parts, newSection()])}
                className="text-xs text-neutral-500 underline"
              >
                + Sub-part
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* Typing them in is always on offer: the paste only reads some layouts. */}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange([...value, newSection()])} className={smallButtonCls}>
          + Add section
        </button>
        <button
          type="button"
          aria-pressed={pasting}
          onClick={() => setPasting(!pasting)}
          className={`${smallButtonCls} ${pasting ? "bg-neutral-100 dark:bg-neutral-800" : ""}`}
        >
          Paste breakdown
        </button>
      </div>

      {pasting && (
        <div className="space-y-2 rounded-md border border-dashed border-neutral-300 p-2 dark:border-neutral-700">
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={5}
            autoFocus
            placeholder={
              "Paste the breakdown from the invite, e.g.\nCoding Challenge – this timed section takes 100 minutes…\nWork Simulation – typically takes 45 minutes…\n\nOne part per line. Check what it fills in; anything it misreads, fix by hand."
            }
            className={inputCls}
          />
          <div className="flex gap-2">
            <button type="button" disabled={!pasted.trim()} onClick={fill} className={buttonCls}>
              Fill in sections
            </button>
            <button type="button" onClick={() => setPasting(false)} className={buttonCls}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
