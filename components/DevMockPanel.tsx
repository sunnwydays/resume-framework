"use client";

import { AtsParseResponse } from "@/lib/types";
import { useEffect, useState } from "react";

interface Props {
  setAtsResult: (v: AtsParseResponse | null) => void;
  disabled: boolean;
}

// Dev-only panel: lists whatever JSON files currently sit in lib/mocks and
// loads the clicked one straight into the app, no API call. Not wired into
// anything else — see CLAUDE.md, this is expected to be removed later.
export default function DevMockPanel({ setAtsResult, disabled }: Props) {
  const [names, setNames] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    fetch("/api/dev-mocks")
      .then((res) => res.json())
      .then((data) => setNames(data.names ?? []))
      .catch(() => setNames([]));
  }, []);

  if (process.env.NODE_ENV === "production") return null;

  async function loadMock(name: string) {
    setPending(name);
    try {
      const res = await fetch(`/api/dev-mocks/${encodeURIComponent(name)}`);
      const json: AtsParseResponse = await res.json();
      setAtsResult(json);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-3 space-y-2.5">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        Dev mocks
      </p>

      {names.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {names.map((name) => (
            <button
              key={name}
              type="button"
              disabled={disabled || pending !== null}
              onClick={() => loadMock(name)}
              className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-surface px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 disabled:opacity-50"
            >
              {pending === name ? "Loading…" : name}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-neutral-400 dark:text-neutral-600">
          No mock files found in lib/mocks.
        </p>
      )}

      <p className="text-xs leading-relaxed text-neutral-400 dark:text-neutral-600">
        Drop raw Affinda JSON output into <code>lib/mocks</code>. You can also put tex
        resumes in <code>resume_revision</code> for editing. Both are gitignored.
      </p>
    </div>
  );
}
