// The emails behind an application, for its expanded row, and whether the
// last Gmail accept on it can still be undone.

import type { Application, EmailAccept, EmailMessage } from "@/lib/tracker/format";

export interface Trail {
  emails: EmailMessage[]; // newest first
  // The newest accept on this row that hasn't been undone. Undo goes newest
  // first, and only while the row hasn't been edited by hand since.
  accept: EmailAccept | null;
  undoable: boolean;
}

export function emailTrail(app: Pick<Application, "id" | "updated_at">, messages: EmailMessage[], accepts: EmailAccept[]): Trail {
  const emails = messages
    .filter((m) => m.state === "accepted" && m.application_id === app.id)
    .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
  const accept =
    accepts
      .filter((a) => a.application_id === app.id && !a.undone_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
  const undoable = accept !== null && new Date(app.updated_at).getTime() <= new Date(accept.created_at).getTime();
  return { emails, accept, undoable };
}
