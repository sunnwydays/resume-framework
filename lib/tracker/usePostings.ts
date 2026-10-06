"use client";

import { useCallback, useEffect, useState } from "react";
import type { TablesInsert, TablesUpdate } from "@/lib/tracker/database.types";
import { todayISO, type Application, type JobPosting, type PostingState } from "@/lib/tracker/format";
import { DEFAULT_TRIMS, trimRole, type RoleTrimOptions } from "@/lib/tracker/trimRole";
import { alertQuery, fetchMessages, type ScanProgress } from "@/lib/tracker/email/gmail";
import { messageHtml, parseGmailMessage } from "@/lib/tracker/email/parse";
import type { PostingDetails } from "@/lib/tracker/postings/details";
import { isJobrightAlert, parseJobrightAlert, type ParsedPosting } from "@/lib/tracker/postings/parse";
import { dedupePostings, summarizePostingScan, toPostingRow } from "@/lib/tracker/postings/scan";
import { supabase } from "@/lib/tracker/useTracker";

// Pages per request to the details route (its limit is 10).
const DETAILS_BATCH = 8;

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
  const savePostings = useCallback(async (rows: TablesInsert<"job_postings">[]): Promise<{ saved: number; rows: JobPosting[] } | { error: string }> => {
    if (rows.length === 0) return { saved: 0, rows: [] };
    const { data, error } = await supabase()
      .from("job_postings")
      .upsert(rows, { onConflict: "user_id,source,source_id", ignoreDuplicates: true })
      .select();
    if (error) return { error: error.message };
    setPostings((list) => [...(data ?? []), ...list]);
    return { saved: data?.length ?? 0, rows: data ?? [] };
  }, []);

  // Reads the start line and length off each posting's page (server-side) and
  // stores them, so the Term and Length chips know more than the title says.
  // Only postings not yet read are fetched; one whose page couldn't be read is
  // left for next time. Returns how many were read.
  const readDetails = useCallback(
    async (candidates: JobPosting[], onProgress?: (done: number, total: number) => void): Promise<{ read: number } | { error: string }> => {
      const todo = candidates.filter((p) => p.state === "new" && !p.details_read_at);
      let read = 0;
      for (let i = 0; i < todo.length; i += DETAILS_BATCH) {
        onProgress?.(i, todo.length);
        const batch = todo.slice(i, i + DETAILS_BATCH);
        let results: (PostingDetails | null)[];
        try {
          const res = await fetch("/api/tracker/postings-details", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ urls: batch.map((p) => p.url) }),
          });
          const body = (await res.json()) as { results?: (PostingDetails | null)[]; error?: string };
          if (!res.ok || !body.results) return { error: body.error ?? `Couldn't read posting pages (${res.status})` };
          results = body.results;
        } catch (e) {
          return { error: (e as Error).message };
        }
        const stamp = new Date().toISOString();
        const updates = batch.flatMap((p, j) => {
          const d = results[j];
          return d ? [{ id: p.id, changes: { start_text: d.startText, length_text: d.lengthText, details_read_at: stamp } }] : [];
        });
        const writes = await Promise.all(updates.map((u) => supabase().from("job_postings").update(u.changes).eq("id", u.id)));
        const failed = writes.find((w) => w.error);
        if (failed?.error) return { error: failed.error.message };
        setPostings((list) =>
          list.map((p) => {
            const u = updates.find((x) => x.id === p.id);
            return u ? { ...p, ...u.changes } : p;
          })
        );
        read += updates.length;
      }
      return { read };
    },
    []
  );

  // The whole alert scan, shared by the Postings page's "Scan alerts" and the
  // tracker's "Scan Gmail": fetch the alerts, parse and dedupe, store the new
  // postings, then read their pages for term and length. Throws what Gmail
  // throws (sign-in, cancel); a save failure comes back as `error`. A failure
  // reading posting pages is only noted in the summary.
  const scanAlerts = useCallback(
    async (
      since: Date,
      { onProgress, onReading, signal }: { onProgress?: (p: ScanProgress) => void; onReading?: (done: number, total: number) => void; signal?: AbortSignal }
    ): Promise<{ summary: string } | { error: string }> => {
      const result = await fetchMessages(alertQuery(since), { onProgress, signal });
      const parsed: ParsedPosting[] = [];
      let alerts = 0;
      let unreadable = result.failed;
      for (const message of result.messages) {
        try {
          const facts = parseGmailMessage(message);
          if (!isJobrightAlert(facts.fromAddress, facts.subject)) continue;
          alerts++;
          parsed.push(...parseJobrightAlert(messageHtml(message), facts.receivedAt, facts.gmailId));
        } catch {
          unreadable++;
        }
      }
      const unique = dedupePostings(parsed);
      const saved = await savePostings(unique.map(toPostingRow));
      if ("error" in saved) return { error: `Couldn't save the postings: ${saved.error}` };
      // The title seldom names the term or length; the posting page does.
      // Covers older postings that were never read, too.
      const details = await readDetails([...postings, ...saved.rows], onReading);
      const detailsNote = "error" in details ? ` · couldn't read posting pages: ${details.error}` : details.read ? ` · read ${details.read} posting pages for term and length` : "";
      const capped = result.capped ? ` · stopped at ${result.listed}; scan again from a later date for the rest` : "";
      const failed = unreadable ? ` · ${unreadable} couldn't be read` : "";
      return { summary: `${summarizePostingScan({ alerts, postings: unique.length, saved: saved.saved })}${failed}${detailsNote}${capped}` };
    },
    [postings, savePostings, readDetails]
  );

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
    readDetails,
    scanAlerts,
    setState,
    markApplied,
    deleteAllPostings,
  };
}

export type PostingsStore = ReturnType<typeof usePostings>;
