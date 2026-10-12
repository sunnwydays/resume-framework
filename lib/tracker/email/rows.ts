// Classified emails <-> email_messages rows. Only facts are stored, never the
// body: a short snippet for context, plus what the rules read from it. Reading
// a row back gives an Analyzed that groupIntoJobs treats like a fresh one.

import type { Json, TablesInsert } from "@/lib/tracker/database.types";
import type { EmailFields, FieldName } from "@/lib/tracker/email/fields";
import type { Analyzed } from "@/lib/tracker/email/group";
import type { EmailKind, EmailMessage } from "@/lib/tracker/format";
import { sectionsOf } from "@/lib/tracker/sections";

export const SNIPPET_MAX = 200;

// Counted in code points, like Postgres char_length, so a cut never splits
// an emoji into a lone surrogate.
export function snippetOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  return chars.length <= SNIPPET_MAX ? flat : `${chars.slice(0, SNIPPET_MAX - 1).join("").trimEnd()}…`;
}

// Null for an email the rules ignored: those are never stored.
export function toRow(a: Analyzed): TablesInsert<"email_messages"> | null {
  if (!a.kind) return null;
  const { facts, fields } = a;
  return {
    gmail_id: facts.gmailId,
    thread_id: facts.threadId,
    received_at: facts.receivedAt,
    from_name: facts.fromName,
    from_address: facts.fromAddress,
    subject: facts.subject,
    snippet: snippetOf(facts.text),
    kind: a.kind,
    matched_phrase: a.phrase,
    company: fields.company,
    role: fields.role,
    job_id: fields.jobId,
    link: fields.link,
    due_at: fields.dueAt,
    duration_min: fields.durationMin,
    sections: fields.sections as unknown as Json,
    completed_at: fields.completedAt,
    assessment_title: fields.assessmentTitle,
    field_origins: fields.origins as Json,
  };
}

// Postgres hands timestamps back as "…+00:00"; the rules compare ISO strings.
const iso = (value: string) => new Date(value).toISOString();
const isoOrNull = (value: string | null) => (value ? iso(value) : null);

export function fromRow(row: EmailMessage): Analyzed {
  const fields: EmailFields = {
    company: row.company,
    role: row.role,
    jobId: row.job_id,
    link: row.link,
    dueAt: isoOrNull(row.due_at),
    durationMin: row.duration_min,
    sections: sectionsOf(row.sections),
    completedAt: isoOrNull(row.completed_at),
    assessmentTitle: row.assessment_title,
    origins: (row.field_origins ?? {}) as Partial<Record<FieldName, string>>,
  };
  return {
    facts: {
      gmailId: row.gmail_id,
      threadId: row.thread_id,
      receivedAt: iso(row.received_at),
      fromName: row.from_name,
      fromAddress: row.from_address,
      subject: row.subject,
      text: row.snippet,
      links: [],
    },
    kind: row.kind as EmailKind,
    phrase: row.matched_phrase,
    reason: null,
    fields,
  };
}

// The columns the rules write. A re-scan rewrites them on a still-pending row,
// so a rule fix reaches emails saved before it. Accepted rows are history and
// dismissed ones stay dismissed: neither is touched.
const RULE_COLUMNS = [
  "kind", "matched_phrase", "company", "role", "job_id", "link", "due_at", "duration_min", "sections", "completed_at",
  "assessment_title", "field_origins",
] as const;
type RuleColumn = (typeof RULE_COLUMNS)[number];
export type RuleChanges = Pick<TablesInsert<"email_messages">, RuleColumn>;

// jsonb hands keys back in its own order (at every level); timestamps come
// back as "+00:00".
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

function same(column: RuleColumn, stored: unknown, fresh: unknown): boolean {
  if (column === "due_at" || column === "completed_at") return isoOrNull(stored as string | null) === isoOrNull(fresh as string | null);
  if (column === "field_origins") return canonical(stored ?? {}) === canonical(fresh ?? {});
  if (column === "sections") return canonical(stored ?? []) === canonical(fresh ?? []);
  return (stored ?? null) === (fresh ?? null);
}

// Splits a scan's rows into new ones to insert and stored pending ones whose
// rules' reading changed. `stored` is what the page has loaded (every state);
// accepted and dismissed rows are skipped, and the insert skips duplicates as
// a backstop.
export function planSave(
  rows: TablesInsert<"email_messages">[],
  stored: EmailMessage[]
): { insert: TablesInsert<"email_messages">[]; refresh: { id: string; changes: RuleChanges }[] } {
  const byGmailId = new Map(stored.map((s) => [s.gmail_id, s]));
  const insert: TablesInsert<"email_messages">[] = [];
  const refresh: { id: string; changes: RuleChanges }[] = [];
  for (const row of rows) {
    const old = byGmailId.get(row.gmail_id);
    if (!old) insert.push(row);
    else if (old.state === "pending" && RULE_COLUMNS.some((c) => !same(c, old[c], row[c]))) {
      refresh.push({ id: old.id, changes: Object.fromEntries(RULE_COLUMNS.map((c) => [c, row[c] ?? null])) as RuleChanges });
    }
  }
  return { insert, refresh };
}

// A digest's parts are stored as "<id>#1", "<id>#2"; Gmail knows the message.
export const gmailLink = (gmailId: string) => `https://mail.google.com/mail/u/0/#all/${gmailId.split("#")[0]}`;
