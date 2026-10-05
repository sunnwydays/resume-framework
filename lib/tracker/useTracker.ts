"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Json, TablesInsert, TablesUpdate } from "@/lib/tracker/database.types";
import type { EmailJobPayload } from "@/lib/tracker/email/payload";
import { planSave } from "@/lib/tracker/email/rows";
import type {
  Application,
  Assessment,
  EmailAccept,
  EmailMessage,
  EmailMute,
  GmailScan,
  MuteKind,
  Question,
  StatusChange,
} from "@/lib/tracker/format";

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
      gmail: GmailData;
    };

// Gmail review state: pending emails (the review tab), accepted ones (each
// application's email trail) and dismissed ones (the restore list), mutes,
// accepts (for undo), last scan.
export interface GmailData {
  emails: EmailMessage[];
  mutes: EmailMute[];
  accepts: EmailAccept[];
  lastScan: GmailScan | null;
}

async function fetchAll(): Promise<FetchResult> {
  const sb = supabase();
  const [apps, asmts, questions, changes, emails, mutes, accepts, scans] = await Promise.all([
    sb
      .from("applications")
      .select("*")
      .order("applied_on", { ascending: false })
      .order("created_at", { ascending: false }),
    sb.from("assessments").select("*").order("due_at", { ascending: true }),
    sb.from("assessment_questions").select("*").order("created_at", { ascending: true }),
    sb.from("status_changes").select("*").order("changed_at", { ascending: true }),
    sb.from("email_messages").select("*").order("received_at", { ascending: true }),
    sb.from("email_mutes").select("*").order("created_at", { ascending: true }),
    sb.from("email_accepts").select("*"),
    sb.from("gmail_scans").select("*").order("scanned_at", { ascending: false }).limit(1),
  ]);
  const err =
    apps.error ?? asmts.error ?? questions.error ?? changes.error ?? emails.error ?? mutes.error ?? accepts.error ?? scans.error;
  if (err) return { error: err.message };
  return {
    applications: apps.data ?? [],
    assessments: asmts.data ?? [],
    questions: questions.data ?? [],
    statusChanges: changes.data ?? [],
    gmail: {
      emails: emails.data ?? [],
      mutes: mutes.data ?? [],
      accepts: accepts.data ?? [],
      lastScan: scans.data?.[0] ?? null,
    },
  };
}

const NO_GMAIL: GmailData = { emails: [], mutes: [], accepts: [], lastScan: null };

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
  const [gmail, setGmail] = useState<GmailData>(NO_GMAIL);
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
      setGmail(result.gmail);
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

  // ---- Gmail -------------------------------------------------------------

  // Stores classified emails from a scan. One already stored is never revived;
  // a still-pending one gets the current rules' reading (`planSave`). Returns
  // how many were new and how many were re-read.
  const saveEmails = useCallback(
    async (rows: TablesInsert<"email_messages">[]): Promise<{ saved: number; updated: number } | { error: string }> => {
      const { insert, refresh } = planSave(rows, gmail.emails);
      let inserted: EmailMessage[] = [];
      if (insert.length > 0) {
        const { data, error } = await supabase()
          .from("email_messages")
          .upsert(insert, { onConflict: "user_id,gmail_id", ignoreDuplicates: true })
          .select();
        if (error) return { error: error.message };
        inserted = data ?? [];
      }
      // Only while still pending: one accepted in another tab keeps its reading.
      const results = await Promise.all(
        refresh.map(({ id, changes }) =>
          supabase().from("email_messages").update(changes).eq("id", id).eq("state", "pending").select().maybeSingle()
        )
      );
      const failed = results.find((r) => r.error);
      const updated = results.flatMap((r) => (r.data ? [r.data] : []));
      const byId = new Map(updated.map((e) => [e.id, e]));
      setGmail((g) => ({ ...g, emails: [...g.emails.map((e) => byId.get(e.id) ?? e), ...inserted] }));
      if (failed?.error) return { error: failed.error.message };
      return { saved: inserted.length, updated: updated.length };
    },
    [gmail.emails]
  );

  const recordScan = useCallback(async (row: TablesInsert<"gmail_scans">) => {
    const { data, error } = await supabase().from("gmail_scans").insert(row).select().single();
    if (error) return setError(error.message);
    setGmail((g) => ({ ...g, lastScan: data }));
  }, []);

  // Applies one reviewed card in a single transaction, then reloads: the
  // card can touch the application, its assessments, history and emails.
  const applyEmailJob = useCallback(
    async (payload: EmailJobPayload): Promise<{ applicationId: string } | { error: string }> => {
      const { data, error } = await supabase().rpc("apply_email_job", { payload: payload as unknown as Json });
      await reload();
      return error ? { error: error.message } : { applicationId: data };
    },
    [reload]
  );

  // Reverts one accepted card (the database refuses if the row was edited
  // since, or a newer accept on it isn't undone). Returns an error message.
  const undoEmailJob = useCallback(
    async (acceptId: string): Promise<string | null> => {
      const { error } = await supabase().rpc("undo_email_job", { p_accept: acceptId });
      await reload();
      return error?.message ?? null;
    },
    [reload]
  );

  // Moves pending emails to dismissed, or dismissed ones back to pending. The
  // write only matches rows still in the other state, so a stale page can't
  // touch an email accepted in another tab.
  const setEmailState = useCallback(
    async (ids: string[], from: "pending" | "dismissed", to: "pending" | "dismissed") => {
      const moved = new Set(ids);
      setGmail((g) => ({ ...g, emails: g.emails.map((e) => (moved.has(e.id) && e.state === from ? { ...e, state: to } : e)) }));
      const { error } = await supabase().from("email_messages").update({ state: to }).in("id", ids).eq("state", from);
      if (error) fail(error.message);
    },
    [fail]
  );

  const dismissEmails = useCallback((ids: string[]) => setEmailState(ids, "pending", "dismissed"), [setEmailState]);
  const restoreEmails = useCallback((ids: string[]) => setEmailState(ids, "dismissed", "pending"), [setEmailState]);

  const addMute = useCallback(async (kind: MuteKind, value: string) => {
    const { data, error } = await supabase()
      .from("email_mutes")
      .upsert({ kind, value }, { onConflict: "user_id,kind,value", ignoreDuplicates: true })
      .select();
    if (error) return setError(error.message);
    setGmail((g) => ({ ...g, mutes: [...g.mutes, ...(data ?? [])] }));
  }, []);

  const removeMute = useCallback(
    async (id: string) => {
      setGmail((g) => ({ ...g, mutes: g.mutes.filter((m) => m.id !== id) }));
      const { error } = await supabase().from("email_mutes").delete().eq("id", id);
      if (error) fail(error.message);
    },
    [fail]
  );

  return {
    applications,
    assessments,
    questions,
    statusChanges,
    gmail,
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
    saveEmails,
    recordScan,
    applyEmailJob,
    undoEmailJob,
    dismissEmails,
    restoreEmails,
    addMute,
    removeMute,
  };
}

export type Tracker = ReturnType<typeof useTracker>;
