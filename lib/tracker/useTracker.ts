"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/lib/tracker/database.types";
import type { Application, Assessment, Question, StatusChange } from "@/lib/tracker/format";

// Created lazily (first use in the browser) so prerendering the page at
// build time doesn't need the Supabase env vars, which the deployed site
// doesn't have while the tracker is local-only.
let client: ReturnType<typeof createClient> | null = null;
export function supabase() {
  return (client ??= createClient());
}

type FetchResult =
  | { error: string }
  | {
      applications: Application[];
      assessments: Assessment[];
      questions: Question[];
      statusChanges: StatusChange[];
    };

async function fetchAll(): Promise<FetchResult> {
  const sb = supabase();
  const [apps, asmts, questions, changes] = await Promise.all([
    sb
      .from("applications")
      .select("*")
      .order("applied_on", { ascending: false })
      .order("created_at", { ascending: false }),
    sb.from("assessments").select("*").order("due_at", { ascending: true }),
    sb.from("assessment_questions").select("*").order("created_at", { ascending: true }),
    sb.from("status_changes").select("*").order("changed_at", { ascending: true }),
  ]);
  const err = apps.error ?? asmts.error ?? questions.error ?? changes.error;
  if (err) return { error: err.message };
  return {
    applications: apps.data ?? [],
    assessments: asmts.data ?? [],
    questions: questions.data ?? [],
    statusChanges: changes.data ?? [],
  };
}

// A clock for "due in 3h" labels, ticking once a minute (render must not
// read Date.now() directly).
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// All tracker data for the signed-in user, plus mutations. Edits apply
// optimistically; on a failed write the error is surfaced and everything is
// reloaded from the database rather than hand-rolled back.
export function useTracker() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [statusChanges, setStatusChanges] = useState<StatusChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((result: FetchResult) => {
    if ("error" in result) {
      setError(result.error);
    } else {
      setApplications(result.applications);
      setAssessments(result.assessments);
      setQuestions(result.questions);
      setStatusChanges(result.statusChanges);
    }
    setLoading(false);
  }, []);

  const reload = useCallback(async () => apply(await fetchAll()), [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchAll().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const fail = useCallback(
    (message: string) => {
      setError(message);
      reload();
    },
    [reload]
  );

  // The status trigger writes history server-side; pull it back after any
  // write that can change status.
  const refreshChanges = useCallback(async (applicationId: string) => {
    const { data } = await supabase()
      .from("status_changes")
      .select("*")
      .eq("application_id", applicationId)
      .order("changed_at", { ascending: true });
    if (data) {
      setStatusChanges((list) => [
        ...list.filter((c) => c.application_id !== applicationId),
        ...data,
      ]);
    }
  }, []);

  const addApplication = useCallback(
    async (row: TablesInsert<"applications">): Promise<Application | null> => {
      const { data, error } = await supabase()
        .from("applications")
        .insert(row)
        .select()
        .single();
      if (error) {
        setError(error.message);
        return null;
      }
      setApplications((list) => [data, ...list]);
      refreshChanges(data.id);
      return data;
    },
    [refreshChanges]
  );

  const updateApplication = useCallback(
    async (id: string, patch: TablesUpdate<"applications">) => {
      setApplications((list) =>
        list.map((a) => (a.id === id ? { ...a, ...patch } : a))
      );
      const { data, error } = await supabase()
        .from("applications")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) return fail(error.message);
      // Replace with the server row so trigger-set fields (status_changed_at,
      // updated_at) show up.
      setApplications((list) => list.map((a) => (a.id === id ? data : a)));
      if ("status" in patch) refreshChanges(id);
    },
    [fail, refreshChanges]
  );

  const deleteApplication = useCallback(
    async (id: string) => {
      setApplications((list) => list.filter((a) => a.id !== id));
      const gone = new Set(assessments.filter((a) => a.application_id === id).map((a) => a.id));
      setAssessments((list) => list.filter((a) => a.application_id !== id));
      setQuestions((list) => list.filter((q) => !gone.has(q.assessment_id)));
      setStatusChanges((list) => list.filter((c) => c.application_id !== id));
      const { error } = await supabase().from("applications").delete().eq("id", id);
      if (error) fail(error.message);
    },
    [assessments, fail]
  );

  // Every application of the signed-in user (RLS scopes the delete), and with
  // them their assessments, questions and history. Returns an error message.
  const deleteAllApplications = useCallback(async (): Promise<string | null> => {
    const { error } = await supabase().from("applications").delete().not("id", "is", null);
    await reload();
    return error?.message ?? null;
  }, [reload]);

  const addAssessment = useCallback(
    async (row: TablesInsert<"assessments">): Promise<Assessment | null> => {
      const { data, error } = await supabase()
        .from("assessments")
        .insert(row)
        .select()
        .single();
      if (error) {
        setError(error.message);
        return null;
      }
      setAssessments((list) => [...list, data]);
      return data;
    },
    []
  );

  const updateAssessment = useCallback(
    async (id: string, patch: TablesUpdate<"assessments">) => {
      setAssessments((list) =>
        list.map((a) => (a.id === id ? { ...a, ...patch } : a))
      );
      const { data, error } = await supabase()
        .from("assessments")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) return fail(error.message);
      setAssessments((list) => list.map((a) => (a.id === id ? data : a)));
    },
    [fail]
  );

  const deleteAssessment = useCallback(
    async (id: string) => {
      setAssessments((list) => list.filter((a) => a.id !== id));
      setQuestions((list) => list.filter((q) => q.assessment_id !== id));
      const { error } = await supabase().from("assessments").delete().eq("id", id);
      if (error) fail(error.message);
    },
    [fail]
  );

  const addQuestion = useCallback(
    async (row: TablesInsert<"assessment_questions">): Promise<boolean> => {
      const { data, error } = await supabase()
        .from("assessment_questions")
        .insert(row)
        .select()
        .single();
      if (error) {
        setError(error.message);
        return false;
      }
      setQuestions((list) => [...list, data]);
      return true;
    },
    []
  );

  const updateQuestion = useCallback(
    async (id: string, patch: TablesUpdate<"assessment_questions">) => {
      setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)));
      const { error } = await supabase().from("assessment_questions").update(patch).eq("id", id);
      if (error) fail(error.message);
    },
    [fail]
  );

  const deleteQuestion = useCallback(
    async (id: string) => {
      setQuestions((list) => list.filter((q) => q.id !== id));
      const { error } = await supabase().from("assessment_questions").delete().eq("id", id);
      if (error) fail(error.message);
    },
    [fail]
  );

  return {
    applications,
    assessments,
    questions,
    statusChanges,
    loading,
    error,
    clearError: () => setError(null),
    reload,
    addApplication,
    updateApplication,
    deleteApplication,
    deleteAllApplications,
    addAssessment,
    updateAssessment,
    deleteAssessment,
    addQuestion,
    updateQuestion,
    deleteQuestion,
  };
}

export type Tracker = ReturnType<typeof useTracker>;
