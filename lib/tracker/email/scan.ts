// When to scan from, how long ago the last scan was, and what a scan found.
// Nothing here runs on its own: scans only happen when the button is pressed.

import type { Analyzed } from "@/lib/tracker/email/group";
import { isMuted } from "@/lib/tracker/email/mute";
import { EMAIL_KINDS, todayISO, type Application, type EmailKind, type EmailMute, type GmailScan } from "@/lib/tracker/format";

const DAY = 86_400_000;
// Re-read a little before the last scan: mail that arrived during it, or was
// delivered late, still gets seen. Already-stored emails are skipped.
export const SCAN_OVERLAP_DAYS = 2;
export const FIRST_SCAN_DAYS = 30;
export const STALE_DAYS = 7;

// "Scan from" as YYYY-MM-DD (local): just before the last scan, or the first
// tracked application on the first scan, or a month back with nothing tracked.
export function defaultScanFrom(
  lastScan: Pick<GmailScan, "scanned_at"> | null,
  applications: Pick<Application, "applied_on">[],
  now: number = Date.now()
): string {
  if (lastScan) return todayISO(new Date(lastScan.scanned_at).getTime() - SCAN_OVERLAP_DAYS * DAY);
  const earliest = applications.reduce<string | null>((min, a) => (min === null || a.applied_on < min ? a.applied_on : min), null);
  return earliest ?? todayISO(now - FIRST_SCAN_DAYS * DAY);
}

// Local midnight at the start of a YYYY-MM-DD day.
export function scanStart(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function ago(ms: number): string {
  if (ms < 60 * 60_000) return "just now";
  if (ms < DAY) return `${Math.floor(ms / (60 * 60_000))}h ago`;
  const days = Math.floor(ms / DAY);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function scanNudge(lastScanAt: string | null, pending: number, now: number = Date.now()): { text: string; stale: boolean } {
  const review = pending > 0 ? ` · ${pending} to review` : "";
  if (!lastScanAt) return { text: `Gmail not scanned yet${review}`, stale: false };
  const elapsed = Math.max(0, now - new Date(lastScanAt).getTime());
  return { text: `Last scanned ${ago(elapsed)}${review}`, stale: elapsed >= STALE_DAYS * DAY };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const KIND_NOUN: Record<EmailKind, [string, string]> = {
  confirmation: ["confirmation", "confirmations"],
  rejection: ["rejection", "rejections"],
  oa_invite: ["OA invite", "OA invites"],
  video_invite: ["video invite", "video invites"],
  interview_invite: ["interview invite", "interview invites"],
  assessment_done: ["completed assessment", "completed assessments"],
  reminder: ["reminder", "reminders"],
};

// "12 confirmations, 4 rejections · 31 ignored · 3 muted · 2 re-read · 9 seen
// before". Re-read: still waiting for review, and the current rules read it
// differently from the scan that saved it.
export function summarizeScan(r: { analyzed: Analyzed[]; muted: number; saved: number; updated?: number }): string {
  const counts = new Map<EmailKind, number>();
  let ignored = 0;
  for (const a of r.analyzed) {
    if (a.kind) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
    else ignored++;
  }
  const kinds = (Object.keys(EMAIL_KINDS) as EmailKind[])
    .filter((k) => counts.has(k))
    .map((k) => plural(counts.get(k)!, ...KIND_NOUN[k]));
  const classified = r.analyzed.length - ignored;
  const updated = r.updated ?? 0;
  const seen = classified - r.muted - r.saved - updated;
  const parts = [kinds.length ? kinds.join(", ") : "No job emails"];
  if (ignored) parts.push(`${ignored} ignored`);
  if (r.muted) parts.push(`${r.muted} muted`);
  if (updated) parts.push(`${updated} re-read`);
  if (seen > 0) parts.push(`${seen} seen before`);
  return parts.join(" · ");
}

// localStorage key for the scan dialogs' "Mark them read in Gmail" box ("1"/"0").
export const MARK_READ_KEY = "tracker.gmail.markRead";

// localStorage key for the scan dialogs' "Move the Jobright alerts to Gmail's trash" box ("1"/"0").
export const TRASH_ALERTS_KEY = "tracker.gmail.trashAlerts";

// The Gmail messages a scan should mark as read: job mail the tracker now
// holds (classified, not muted) that is still unread. A digest's parts share
// one message, so its "#n" suffixes collapse to the message id.
export function idsToMarkRead(analyzed: Analyzed[], mutes: Pick<EmailMute, "kind" | "value">[]): string[] {
  const ids = new Set<string>();
  for (const a of analyzed) {
    if (a.kind && a.facts.unread && !isMuted(a, mutes)) ids.add(a.facts.gmailId.split("#")[0]);
  }
  return [...ids];
}

// The summary's " · marked 3 emails read in Gmail" piece; nothing when none were unread.
export function summarizeMarkRead(count: number, noun = "email"): string {
  return count === 0 ? "" : ` · marked ${plural(count, noun)} read in Gmail`;
}

// The alert scan's " · moved 3 alerts to Gmail's trash" piece; nothing when none.
export function summarizeTrash(count: number, noun = "alert"): string {
  return count === 0 ? "" : ` · moved ${plural(count, noun)} to Gmail's trash`;
}
