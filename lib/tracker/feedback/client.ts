"use client";

import { appVersion, labelUpdate, type FeedbackInsert } from "@/lib/tracker/feedback/events";
import type { DismissEventRow } from "@/lib/tracker/feedback/posting";
import { supabase } from "@/lib/tracker/useTracker";

// Writes to feedback_events. Logging must never get in the way of the action it
// describes, so none of these throw or surface an error: a failure goes to the
// console and the caller carries on.

// Returns the new row's id, or null when the write failed.
export async function recordFeedback(event: FeedbackInsert): Promise<string | null> {
  try {
    const { data, error } = await supabase()
      .from("feedback_events")
      .insert({ ...event, app_version: appVersion() })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  } catch (e) {
    console.warn("feedback not recorded:", e);
    return null;
  }
}

export async function recordFeedbackBatch(events: FeedbackInsert[]): Promise<void> {
  if (events.length === 0) return;
  try {
    const version = appVersion();
    const { error } = await supabase()
      .from("feedback_events")
      .insert(events.map((e) => ({ ...e, app_version: version })));
    if (error) throw error;
  } catch (e) {
    console.warn("feedback not recorded:", e);
  }
}

// The action was undone: the event is a correction signal, not a label.
export async function markFeedbackUndone(id: string | null | undefined): Promise<void> {
  if (!id) return;
  try {
    const { error } = await supabase().from("feedback_events").update({ undone_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  } catch (e) {
    console.warn("feedback not updated:", e);
  }
}

// Every posting dismiss, so dismissed rows can show (and change) their reason.
// null when the read failed (not "none yet", which would invite duplicate events).
export async function loadPostingDismissals(): Promise<DismissEventRow[] | null> {
  try {
    const { data, error } = await supabase()
      .from("feedback_events")
      .select("id, subject_id, reason, note, final, created_at, undone_at")
      .eq("surface", "posting")
      .eq("action", "dismiss");
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn("dismiss reasons not loaded:", e);
    return null;
  }
}

export async function setFeedbackLabel(id: string | null | undefined, label: Parameters<typeof labelUpdate>[0]): Promise<void> {
  if (!id) return;
  try {
    const { error } = await supabase().from("feedback_events").update(labelUpdate(label)).eq("id", id);
    if (error) throw error;
  } catch (e) {
    console.warn("feedback not updated:", e);
  }
}
