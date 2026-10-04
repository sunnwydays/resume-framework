"use client";

import { useCallback, useSyncExternalStore } from "react";

// A per-viewer setting kept in localStorage (same-tab changes via
// CHANGE_EVENT, other tabs via "storage"), falling back to memory when
// storage is blocked. Same approach as the stats panels' open state.
const CHANGE_EVENT = "tracker-local-setting-change";
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored;
  } catch {
    // Storage blocked: fall through to memory.
  }
  return memory.get(key) ?? null;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useLocalSetting(key: string, fallback: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key) ?? fallback,
    () => fallback
  );
  const set = useCallback(
    (next: string) => {
      memory.set(key, next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Memory covers this tab.
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key]
  );
  return [value, set];
}

// A whole number setting within [min, max]; anything else reads as fallback.
export function useLocalNumber(key: string, fallback: number, min = 0, max = 10_000): [number, (n: number) => void] {
  const [raw, setRaw] = useLocalSetting(key, String(fallback));
  const n = Number(raw);
  const value = Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  const set = useCallback((next: number) => setRaw(String(next)), [setRaw]);
  return [value, set];
}
