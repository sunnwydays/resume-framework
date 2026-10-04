// The emails behind an application, for its expanded row, and whether the
// last Gmail accept on it can still be undone. Mirrors the checks in the
// undo_email_job RPC, which has the final say.

import type { Application, EmailAccept, EmailMessage } from "@/lib/tracker/format";

export interface Trail {
  emails: EmailMessage[]; // newest first
  // The newest accept on this row that hasn't been undone. Undo goes newest
  // first, and only while the row hasn't been edited by hand since.
  accept: EmailAccept | null;
  undoable: boolean;
}

const time = (value: string) => new Date(value).getTime();

export function emailTrail(app: Pick<Application, "id" | "updated_at">, messages: EmailMessage[], accepts: EmailAccept[]): Trail {
  const emails = messages
    .filter((m) => m.state === "accepted" && m.application_id === app.id)
    .sort((a, b) => time(b.received_at) - time(a.received_at));
  const mine = accepts.filter((a) => a.application_id === app.id);
  const accept = mine.filter((a) => !a.undone_at).sort((a, b) => time(b.created_at) - time(a.created_at))[0] ?? null;
  if (!accept) return { emails, accept, undoable: false };
  // Undoing a newer accept touches the row too; that isn't a hand edit.
  const since = Math.max(
    time(accept.created_at),
    ...mine.filter((a) => a.undone_at && time(a.created_at) > time(accept.created_at)).map((a) => time(a.undone_at!))
  );
  return { emails, accept, undoable: time(app.updated_at) <= since };
}
