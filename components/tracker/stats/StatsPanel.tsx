"use client";

import { useSyncExternalStore } from "react";

// Collapsible stats section. Open/closed is a per-viewer convenience, so it
// lives in localStorage (same-tab changes via CHANGE_EVENT, other tabs via
// "storage") and falls back to memory when storage is blocked.
const CHANGE_EVENT = "tracker-stats-panel-change";
const memory = new Map<string, boolean>();

function read(key: string): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored === "1";
  } catch {
    // Storage blocked: fall through to memory.
  }
  return memory.get(key) ?? true;
}

function write(key: string, open: boolean) {
  memory.set(key, open);
  try {
    localStorage.setItem(key, open ? "1" : "0");
  } catch {
    // Memory covers this tab.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export default function StatsPanel({
  id,
  title,
  summary,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  children: React.ReactNode;
}) {
  const key = `tracker.stats.${id}`;
  const open = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => true
  );
  return (
    <section className="rounded-lg border border-neutral-200 bg-background/50 dark:border-neutral-800">
      <button
        type="button"
        onClick={() => write(key, !open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
      >
        <span className="inline-block w-3 text-neutral-400">{open ? "▾" : "▸"}</span>
        {title}
        {!open && summary && <span className="font-normal text-neutral-500">· {summary}</span>}
      </button>
      {open && <div className="space-y-3 px-3 pb-3">{children}</div>}
    </section>
  );
}
