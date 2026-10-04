// Classified emails <-> email_messages rows. Only facts are stored, never the
// body: a short snippet for context, plus what the rules read from it. Reading
// a row back gives an Analyzed that groupIntoJobs treats like a fresh one.

import type { Json, TablesInsert } from "@/lib/tracker/database.types";
import type { EmailFields, FieldName } from "@/lib/tracker/email/fields";
import type { Analyzed } from "@/lib/tracker/email/group";
import type { EmailKind, EmailMessage } from "@/lib/tracker/format";

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

// A digest's parts are stored as "<id>#1", "<id>#2"; Gmail knows the message.
export const gmailLink = (gmailId: string) => `https://mail.google.com/mail/u/0/#all/${gmailId.split("#")[0]}`;
