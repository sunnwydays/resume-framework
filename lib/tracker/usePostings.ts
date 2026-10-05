"use client";

import { useCallback, useEffect, useState } from "react";
import type { TablesInsert, TablesUpdate } from "@/lib/tracker/database.types";
import { todayISO, type Application, type JobPosting, type PostingState } from "@/lib/tracker/format";
import { DEFAULT_TRIMS, trimRole, type RoleTrimOptions } from "@/lib/tracker/trimRole";
import { supabase } from "@/lib/tracker/useTracker";

type FetchResult = { error: string } | { postings: JobPosting[] };

async function fetchAll(): Promise<FetchResult> {
  const { data, error } = await supabase().from("job_postings").select("*").order("first_seen_at", { ascending: false });
  return error ? { error: error.message } : { postings: data ?? [] };
}

// Job postings found in alert emails, for the Postings page. Same approach as
// useMoves: edits apply optimistically, and a failed write surfaces the error
// and reloads from the database.
export function usePostings() {
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((result: FetchResult) => {
    if ("error" in result) setError(result.error);
    else setPostings(result.postings);
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

  // Stores postings from a scan. One already stored (new, saved, applied or
  // dismissed) is skipped, never revived. Returns how many were new.
  const savePostings = useCallback(async (rows: TablesInsert<"job_postings">[]): Promise<{ saved: number } | { error: string }> => {
    if (rows.length === 0) return { saved: 0 };
    const { data, error } = await supabase()
      .from("job_postings")
      .upsert(rows, { onConflict: "user_id,source,source_id", ignoreDuplicates: true })
      .select();
    if (error) return { error: error.message };
    setPostings((list) => [...(data ?? []), ...list]);
    return { saved: data?.length ?? 0 };
  }, []);

  const patch = useCallback(
    async (id: string, changes: TablesUpdate<"job_postings">) => {
      const withStamp = { ...changes, updated_at: new Date().toISOString() };
      setPostings((list) => list.map((p) => (p.id === id ? { ...p, ...withStamp } : p)));
      const { error } = await supabase().from("job_postings").update(withStamp).eq("id", id);
      if (error) fail(error.message);
    },
    [fail]
  );

  const setState = useCallback((id: string, state: PostingState) => patch(id, { state }), [patch]);

  // "Applied": adds the application (or links the one it already matches),
  // then marks the posting applied. `trims` tidies the role on a new application.
  const markApplied = useCallback(
    async (
      posting: JobPosting,
      addApplication: (row: TablesInsert<"applications">) => Promise<Application | null>,
      existing?: Application | null,
      trims: RoleTrimOptions = DEFAULT_TRIMS
    ) => {
      const app =
        existing ??
        (await addApplication({
          company: posting.company,
          role: trimRole(posting.role, trims),
          location: posting.location,
          url: posting.url,
          applied_on: todayISO(),
          status: "applied",
          source: "alert",
        }));
      if (app) await patch(posting.id, { state: "applied", application_id: app.id });
    },
    [patch]
  );

  // Every posting of the signed-in user (RLS scopes the delete). Applications
  // linked to them are untouched. Returns an error message.
  const deleteAllPostings = useCallback(async (): Promise<string | null> => {
    const { error } = await supabase().from("job_postings").delete().not("id", "is", null);
    await reload();
    return error?.message ?? null;
  }, [reload]);

  return {
    postings,
    loading,
    error,
    clearError: () => setError(null),
    reload,
    savePostings,
    setState,
    markApplied,
    deleteAllPostings,
  };
}

export type PostingsStore = ReturnType<typeof usePostings>;
