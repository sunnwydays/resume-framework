"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { suggestApplications, type ApplicationOption } from "@/lib/tracker/io";

interface Props {
  value: string; // an ApplicationOption.value, or "" for none
  options: ApplicationOption[];
  // The imported assessment's own company/role, used to rank suggestions.
  company: string;
  role: string;
  emptyLabel: string;
  onChange: (value: string) => void;
  // Leaving it empty is normal (no warning border); and what "none" reads as.
  optional?: boolean;
  clearLabel?: string;
}

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 340;

type Position = { left: number; top?: number; bottom?: number };

// Chooses which application an imported assessment attaches to: likely ones
// first (same company), then a searchable list of everything.
export default function ApplicationPicker({
  value,
  options,
  company,
  role,
  emptyLabel,
  onChange,
  optional = false,
  clearLabel = "Don’t attach (skip this one)",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<Position>({ left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const suggested = useMemo(
    () => suggestApplications(options, company, role),
    [options, company, role]
  );

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const sections: { label: string; items: ApplicationOption[] }[] = terms.length
    ? [
        {
          label: "Matches",
          items: options.filter((o) => terms.every((t) => `${o.company} ${o.role}`.toLowerCase().includes(t))),
        },
      ]
    : [
        { label: `Suggested for ${company}`, items: suggested },
        { label: "All applications", items: options.filter((o) => !suggested.includes(o)) },
      ];
  const visible = sections.filter((s) => s.items.length > 0);
  const flat = visible.flatMap((s) => s.items);

  function toggle() {
    if (open) return setOpen(false);
    const rect = buttonRef.current!.getBoundingClientRect();
    const flip = window.innerHeight - rect.bottom < PANEL_HEIGHT && rect.top > window.innerHeight - rect.bottom;
    setPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8)),
      ...(flip ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  }

  // Close on outside click, Escape, resize, or any scroll outside the panel.
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    const scroll = (e: Event) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const close = () => setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  // Keep the keyboard-highlighted row in view without moving the page.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!list || !el) return;
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
    }
  }, [active, open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[active]) pick(flat[active].value);
    }
  }

  return (
    <div className="space-y-1">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-56 items-center justify-between gap-1 rounded border bg-surface px-1.5 py-1 text-left text-xs ${
          selected || optional ? "border-neutral-300 dark:border-neutral-700" : "border-amber-400"
        }`}
      >
        <span className="truncate">{selected ? `${selected.company} · ${selected.role}` : emptyLabel}</span>
        <span aria-hidden className="text-neutral-400">
          ▾
        </span>
      </button>

      {!selected && suggested.length > 0 && !open && (
        <div className="flex w-56 flex-wrap gap-1">
          {suggested.slice(0, 3).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              title={`Attach to ${o.company} · ${o.role}`}
              className="max-w-full truncate rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-800 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-300 dark:hover:bg-sky-900"
            >
              {o.company} · {o.role}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div
          ref={panelRef}
          style={{ ...pos, width: PANEL_WIDTH }}
          className="fixed z-60 flex max-w-[calc(100vw-1rem)] flex-col rounded-lg border border-neutral-200 bg-surface shadow-lg dark:border-neutral-800"
        >
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search company or role…"
            className="m-2 rounded border border-neutral-300 bg-surface px-2 py-1 text-sm dark:border-neutral-700"
          />
          <div ref={listRef} className="relative max-h-64 overflow-y-auto pb-1" role="listbox">
            {flat.length === 0 && (
              <p className="px-3 py-2 text-sm text-neutral-500">
                {options.length === 0 ? "No applications to attach to." : "Nothing matches."}
              </p>
            )}
            {visible.map((section) => (
              <div key={section.label}>
                <div className="px-3 pt-2 pb-1 text-xs font-semibold text-neutral-500">{section.label}</div>
                {section.items.map((o) => {
                  const i = flat.indexOf(o);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={o.value === value}
                      data-index={i}
                      onClick={() => pick(o.value)}
                      onMouseMove={() => setActive(i)}
                      className={`flex w-full items-baseline gap-2 px-3 py-1 text-left text-sm ${
                        i === active ? "bg-neutral-100 dark:bg-neutral-900" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{o.company}</span>{" "}
                        <span className="text-neutral-500">{o.role}</span>
                      </span>
                      {o.isNew && <span className="shrink-0 text-xs text-emerald-700 dark:text-emerald-400">new</span>}
                      {o.value === value && <span aria-hidden>✓</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => pick("")}
            className="border-t border-neutral-200 px-3 py-1.5 text-left text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-900"
          >
            {clearLabel}
          </button>
        </div>
      )}
    </div>
  );
}
