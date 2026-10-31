"use client";

import { useState } from "react";
import { buildDemoData, type DemoData } from "@/lib/tracker/demo/data";
import { demoNotice } from "@/lib/tracker/demo/notice";
import type { useMoves } from "@/lib/tracker/useMoves";
import type { usePostings } from "@/lib/tracker/usePostings";
import type { useTracker } from "@/lib/tracker/useTracker";

// Stand-ins for useTracker / usePostings / useMoves, typed as their return
// types so they can't drift. They read the fixtures and nothing else: no
// Supabase client, no fetch. Every mutation is a no-op that shows the notice.

// One build shared by the three hooks (so ids and times agree), rebuilt if the
// tab has been open for an hour so "due in 2 days" doesn't drift.
let cache: { data: DemoData; at: number } | null = null;
function demoData(): DemoData {
  const now = Date.now();
  if (!cache || now - cache.at > 3_600_000) cache = { data: buildDemoData(now), at: now };
  return cache.data;
}

const noop = async () => {
  demoNotice();
};

export const useDemoTracker: typeof useTracker = () => {
  const [{ applications, assessments, questions, statusChanges, gmail }] = useState(demoData);
  return {
    applications,
    assessments,
    questions,
    statusChanges,
    gmail,
    loading: false,
    error: null,
    clearError: () => {},
    reload: noop,
    addApplication: async () => (demoNotice(), null),
    updateApplication: noop,
    deleteApplication: noop,
    deleteAllApplications: async () => demoNotice(),
    addAssessment: async () => (demoNotice(), null),
    updateAssessment: noop,
    deleteAssessment: noop,
    addQuestion: async () => (demoNotice(), false),
    updateQuestion: noop,
    deleteQuestion: noop,
    saveEmails: async () => ({ error: demoNotice() }),
    recordScan: noop,
    applyEmailJob: async () => ({ error: demoNotice() }),
    undoEmailJob: async () => demoNotice(),
    dismissEmails: noop,
    restoreEmails: noop,
    addMute: noop,
    removeMute: noop,
  };
};

export const useDemoPostings: typeof usePostings = () => {
  const [{ postings }] = useState(demoData);
  return {
    postings,
    loading: false,
    error: null,
    clearError: () => {},
    reload: noop,
    savePostings: async () => ({ error: demoNotice() }),
    readDetails: async () => ({ error: demoNotice() }),
    scanAlerts: async () => ({ error: demoNotice() }),
    setState: noop,
    setEdits: noop,
    markApplied: async () => (demoNotice(), null),
    markTrackedApplied: noop,
    undo: noop,
    deleteAllPostings: async () => demoNotice(),
  };
};

export const useDemoMoves: typeof useMoves = () => {
  const [{ moves, templates }] = useState(demoData);
  return {
    moves,
    templates,
    loading: false,
    error: null,
    clearError: () => {},
    reload: noop,
    addMove: async () => (demoNotice(), null),
    updateMove: noop,
    deleteMove: noop,
    addMinutes: noop,
    followUp: noop,
    addTemplate: async () => (demoNotice(), null),
    updateTemplate: noop,
    deleteTemplate: noop,
  };
};
