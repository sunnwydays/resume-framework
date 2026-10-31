"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import TrackerNav from "@/components/tracker/TrackerNav";
import { DEMO_BASE } from "@/lib/tracker/demo/mode";
import { demoFeedback } from "@/lib/tracker/demo/feedback";
import { DEMO_NOTICE, onDemoNotice } from "@/lib/tracker/demo/notice";
import { useDemoMoves, useDemoPostings, useDemoTracker } from "@/lib/tracker/demo/stores";
import { TrackerEnvCtx, type TrackerEnv } from "@/lib/tracker/env";

const DEMO_ENV: TrackerEnv = {
  useTracker: useDemoTracker,
  usePostings: useDemoPostings,
  useMoves: useDemoMoves,
  feedback: demoFeedback,
  demo: true,
  base: DEMO_BASE,
};

const REPO = "https://github.com/sunnwydays/resume-framework";

// False while rendering on the server, true in the browser. The fixtures are
// built from the current time, so they render on the client only (a server
// render would disagree with it and fail hydration).
const subscribeNever = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );

function DemoBanner() {
  const [flash, setFlash] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const off = onDemoNotice(() => {
      setFlash(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setFlash(false), 2500);
    });
    return () => {
      off();
      clearTimeout(timer.current);
    };
  }, []);

  return (
    <div
      role="status"
      className={`sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm transition-colors ${
        flash
          ? "bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-50"
          : "bg-today-bg text-today-ink"
      }`}
    >
      <span className="font-medium">{flash ? DEMO_NOTICE : "Demo with fake data, read-only"}</span>
      {!flash && (
        <>
          <span className="text-today-ink-soft">Filter, sort and open anything. Nothing is saved.</span>
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            View the code
          </a>
        </>
      )}
    </div>
  );
}

export default function DemoShell({ children }: { children: React.ReactNode }) {
  const client = useIsClient();
  return (
    <TrackerEnvCtx.Provider value={DEMO_ENV}>
      <DemoBanner />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
        <TrackerNav />
        {client ? children : <p className="py-8 text-center text-sm text-neutral-500">Loading the demo…</p>}
      </main>
    </TrackerEnvCtx.Provider>
  );
}
