"use client";

import { createContext, useContext } from "react";
import * as feedback from "@/lib/tracker/feedback/client";
import { useMoves } from "@/lib/tracker/useMoves";
import { usePostings } from "@/lib/tracker/usePostings";
import { useTracker } from "@/lib/tracker/useTracker";

// The one seam between the tracker pages and where their data comes from. The
// pages call useTrackerStore() / usePostingsStore() / useMovesStore() instead
// of the hooks directly; the default value is the real Supabase-backed hooks,
// and the demo layout (app/demo/tracker/layout.tsx) provides fixture-backed
// ones with the same types, so they can't drift.
export interface TrackerEnv {
  useTracker: typeof useTracker;
  usePostings: typeof usePostings;
  useMoves: typeof useMoves;
  // Feedback capture writes to Supabase on its own, so it goes through the seam too.
  feedback: typeof feedback;
  // Demo mode: fake data, nothing saved, nothing that calls out.
  demo: boolean;
  // Where the tracker lives, for links between its pages.
  base: string;
}

export const REAL_ENV: TrackerEnv = { useTracker, usePostings, useMoves, feedback, demo: false, base: "/tracker" };

export const TrackerEnvCtx = createContext<TrackerEnv>(REAL_ENV);

export const useTrackerEnv = () => useContext(TrackerEnvCtx);
export const useTrackerStore = () => useTrackerEnv().useTracker();
export const usePostingsStore = () => useTrackerEnv().usePostings();
export const useMovesStore = () => useTrackerEnv().useMoves();
