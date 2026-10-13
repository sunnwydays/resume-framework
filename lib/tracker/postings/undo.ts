import type { Application, Assessment, JobPosting, PostingState } from "@/lib/tracker/format";

// The Postings page's last Save / Dismiss / Applied, kept so its banner can
// put the row back the way it was in one click.
export type PostingAction = "saved" | "dismissed" | "applied";

export interface PostingUndo {
  action: PostingAction;
  postingId: string;
  label: string;
  before: { state: PostingState; application_id: string | null };
  // The application "Applied" added, as it was right after. Null when it
  // linked one that already existed (undo only unlinks that).
  created: { id: string; updated_at: string } | null;
}

const VERB: Record<PostingAction, string> = { saved: "Saved", dismissed: "Dismissed", applied: "Marked applied" };

export function postingUndo(
  posting: JobPosting,
  action: PostingAction,
  created: Application | null = null
): PostingUndo {
  return {
    action,
    postingId: posting.id,
    label: `${posting.company} · ${posting.role}`,
    before: { state: posting.state as PostingState, application_id: posting.application_id },
    created: created && { id: created.id, updated_at: created.updated_at },
  };
}

export function undoMessage(undo: PostingUndo): string {
  return `${VERB[undo.action]} ${undo.label}.`;
}

// Undoing "Applied" deletes the application it added, unless it has been
// worked on since: edited (its updated_at moved) or given an assessment.
// Then it stays, and only the posting goes back.
export function removesCreatedApp(undo: PostingUndo, applications: Application[], assessments: Assessment[]): boolean {
  if (!undo.created) return false;
  const app = applications.find((a) => a.id === undo.created!.id);
  if (!app) return false;
  return app.updated_at === undo.created.updated_at && !assessments.some((a) => a.application_id === app.id);
}
