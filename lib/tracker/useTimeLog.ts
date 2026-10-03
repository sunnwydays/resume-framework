"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { todayISO } from "@/lib/tracker/format";
import { supabase } from "@/lib/tracker/useTracker";

// When the running stopwatch started (epoch ms). Kept in localStorage so a
// reload or closed tab doesn't stop it; only finished stretches are written
// to the database (time_log, one row per local day). Falls back to memory
// if storage is blocked.
const STARTED_KEY = "tracker.timerStartedAt";
const CHANGE_EVENT = "tracker-timer-change";
let startedFallback: number | null = null;

function readStarted(): number | null {
  try {
    return Number(localStorage.getItem(STARTED_KEY)) || null;
  } catch {
    return startedFallback;
  }
}

function writeStarted(value: number | null) {
  startedFallback = value;
  try {
    if (value === null) localStorage.removeItem(STARTED_KEY);
    else localStorage.setItem(STARTED_KEY, String(value));
  } catch {
    // Storage blocked: the fallback above covers this tab.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// "storage" fires for other tabs, CHANGE_EVENT for this one.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

type FetchResult = { error: string } | { days: Record<string, number> };

async function fetchDays(): Promise<FetchResult> {
  const { data, error } = await supabase().from("time_log").select("day, seconds");
  if (error) return { error: error.message };
  return { days: Object.fromEntries(data.map((r) => [r.day, r.seconds])) };
}

// Time spent job hunting: a stopwatch plus per-day totals. Writes go through
// the add_time / set_time RPCs (atomic, floored at 0) and apply
// optimistically, then take the server's number.
export function useTimeLog() {
  const startedAt = useSyncExternalStore(subscribe, readStarted, () => null);
  const [days, setDays] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((result: FetchResult) => {
    if ("error" in result) setError(result.error);
    else setDays(result.days);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchDays().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const write = useCallback(
    async (fn: "add_time" | "set_time", day: string, seconds: number) => {
      const { data, error } = await supabase().rpc(fn, { p_day: day, p_seconds: seconds });
      if (error) {
        setError(error.message);
        apply(await fetchDays());
        return;
      }
      setDays((d) => ({ ...d, [day]: data }));
    },
    [apply]
  );

  const add = useCallback(
    (seconds: number) => {
      const day = todayISO();
      setDays((d) => ({ ...d, [day]: Math.max(0, (d[day] ?? 0) + seconds) }));
      return write("add_time", day, seconds);
    },
    [write]
  );

  // Overwrite today's total. A running stopwatch restarts from now, so the
  // shown time continues from the value that was set.
  const setToday = useCallback(
    (seconds: number) => {
      const day = todayISO();
      if (readStarted() !== null) writeStarted(Date.now());
      setDays((d) => ({ ...d, [day]: Math.max(0, seconds) }));
      return write("set_time", day, seconds);
    },
    [write]
  );

  const start = useCallback(() => writeStarted(Date.now()), []);

  // The whole stretch goes to the day it's stopped on.
  const stop = useCallback(() => {
    const started = readStarted();
    writeStarted(null);
    if (started === null) return;
    const seconds = Math.round((Date.now() - started) / 1000);
    if (seconds > 0) add(seconds);
  }, [add]);

  return {
    days,
    startedAt,
    error,
    clearError: () => setError(null),
    start,
    stop,
    add,
    setToday,
  };
}
