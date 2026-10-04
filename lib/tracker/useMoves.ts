"use client";

import { useCallback, useEffect, useState } from "react";
import type { TablesInsert, TablesUpdate } from "@/lib/tracker/database.types";
import type { MessageTemplate, Move } from "@/lib/tracker/format";
import { supabase } from "@/lib/tracker/useTracker";

type FetchResult = { error: string } | { moves: Move[]; templates: MessageTemplate[] };

async function fetchAll(): Promise<FetchResult> {
  const sb = supabase();
  const [moves, templates] = await Promise.all([
    sb.from("moves").select("*").order("created_at", { ascending: false }),
    sb.from("message_templates").select("*").order("created_at", { ascending: true }),
  ]);
  const err = moves.error ?? templates.error;
  if (err) return { error: err.message };
  return { moves: moves.data ?? [], templates: templates.data ?? [] };
}

// Moves and saved templates for the Arbitrage page. Same approach as
// useTracker: edits apply optimistically, and a failed write surfaces the
// error and reloads from the database.
export function useMoves() {
  const [moves, setMoves] = useState<Move[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((result: FetchResult) => {
    if ("error" in result) {
      setError(result.error);
    } else {
      setMoves(result.moves);
      setTemplates(result.templates);
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

  const replaceMove = (row: Move) => setMoves((list) => list.map((m) => (m.id === row.id ? row : m)));

  const addMove = useCallback(async (row: TablesInsert<"moves">): Promise<Move | null> => {
    const { data, error } = await supabase().from("moves").insert(row).select().single();
    if (error) {
      setError(error.message);
      return null;
    }
    setMoves((list) => [data, ...list]);
    return data;
  }, []);

  const updateMove = useCallback(
    async (id: string, patch: TablesUpdate<"moves">) => {
      setMoves((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
      const { data, error } = await supabase().from("moves").update(patch).eq("id", id).select().single();
      if (error) return fail(error.message);
      // The trigger sets last_touch_at / replied_at / updated_at.
      replaceMove(data);
    },
    [fail]
  );

  const deleteMove = useCallback(
    async (id: string) => {
      setMoves((list) => list.filter((m) => m.id !== id));
      const { error } = await supabase().from("moves").delete().eq("id", id);
      if (error) fail(error.message);
    },
    [fail]
  );

  // Atomic, so quick repeated clicks on +15m all count.
  const addMinutes = useCallback(
    async (id: string, minutes: number) => {
      setMoves((list) => list.map((m) => (m.id === id ? { ...m, minutes: Math.max(0, m.minutes + minutes) } : m)));
      const { data, error } = await supabase().rpc("add_move_minutes", { p_id: id, p_minutes: minutes });
      if (error) return fail(error.message);
      if (typeof data === "number") setMoves((list) => list.map((m) => (m.id === id ? { ...m, minutes: data } : m)));
    },
    [fail]
  );

  // "Followed up" / "I replied": the ball is back in their court.
  const followUp = useCallback(
    (move: Move) =>
      updateMove(move.id, {
        follow_ups: move.waiting_on === "them" ? move.follow_ups + 1 : move.follow_ups,
        waiting_on: "them",
      }),
    [updateMove]
  );

  const addTemplate = useCallback(async (row: TablesInsert<"message_templates">) => {
    const { data, error } = await supabase().from("message_templates").insert(row).select().single();
    if (error) {
      setError(error.message);
      return null;
    }
    setTemplates((list) => [...list, data]);
    return data;
  }, []);

  const updateTemplate = useCallback(
    async (id: string, patch: TablesUpdate<"message_templates">) => {
      setTemplates((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      const { error } = await supabase().from("message_templates").update(patch).eq("id", id);
      if (error) fail(error.message);
    },
    [fail]
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      setTemplates((list) => list.filter((t) => t.id !== id));
      const { error } = await supabase().from("message_templates").delete().eq("id", id);
      if (error) fail(error.message);
    },
    [fail]
  );

  return {
    moves,
    templates,
    loading,
    error,
    clearError: () => setError(null),
    reload,
    addMove,
    updateMove,
    deleteMove,
    addMinutes,
    followUp,
    addTemplate,
    updateTemplate,
    deleteTemplate,
  };
}

export type MovesStore = ReturnType<typeof useMoves>;
