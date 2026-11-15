"use client";

import { useEffect, useState } from "react";
import { settingKey } from "@/lib/tracker/useLocalSetting";
import { useTrackerEnv } from "@/lib/tracker/env";

// State kept in sessionStorage (this tab only). Starts as `initial` so the server and
// first client render match, then loads the stored value after mount. Storage errors
// just mean no persistence.
export function useSessionState<T>(
  rawKey: string,
  initial: T,
  parse: (raw: string | null) => T,
  serialize: (value: T) => string
): [T, (value: T) => void] {
  const key = settingKey(rawKey, useTrackerEnv().demo);
  const [value, setValue] = useState<T>(initial);
  // Saving waits for the load, so the initial value can't overwrite what's stored.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setValue(parse(sessionStorage.getItem(key)));
    } catch {
      // Keep the initial value.
    }
    setReady(true);
    // Load once per key; parse is a stable module function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(key, serialize(value));
    } catch {
      // Not persisted.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, value]);

  return [value, setValue];
}
