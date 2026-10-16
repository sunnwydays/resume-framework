import type { Analyzed, JobGroup, Target } from "@/lib/tracker/email/group";
import type { EmailJobPayload } from "@/lib/tracker/email/payload";
import { changedKeys, toJson, type FeedbackInsert, type FeedbackReason } from "@/lib/tracker/feedback/events";
import type { MuteKind } from "@/lib/tracker/format";

// The kind pill on a card can't be edited, so a dismiss with a reason is the
// only way to say "the rules misread this".
export const EMAIL_DISMISS_REASONS: FeedbackReason[] = [
  { key: "not-job-mail", label: "Not a job email", rule: "lib/tracker/email/classify.ts" },
  { key: "wrong-type", label: "Wrong type", rule: "lib/tracker/email/classify.ts" },
  { key: "wrong-company-role", label: "Wrong company or role", rule: "lib/tracker/email/fields.ts" },
  { key: "wrong-match", label: "Wrong application", rule: "lib/tracker/email/group.ts" },
  { key: "duplicate", label: "Duplicate", rule: "lib/tracker/email/group.ts" },
  { key: "nothing-to-do", label: "Nothing to do", rule: "taste" },
  { key: "other", label: "Other", rule: "taste" },
];

const targetKey = (t: Target) => (t.type === "existing" ? `existing:${t.application.id}` : t.type);

function emailContext(e: Analyzed) {
  const { facts, fields } = e;
  return {
    gmail_id: facts.gmailId,
    kind: e.kind,
    phrase: e.phrase,
    subject: facts.subject,
    from: facts.fromAddress,
    received_at: facts.receivedAt,
    company: fields.company,
    role: fields.role,
    job_id: fields.jobId,
    due_at: fields.dueAt,
    origins: fields.origins,
  };
}

const groupContext = (group: JobGroup) => ({
  emails: group.emails.map(emailContext),
  steps: group.steps.map((s) => ({ gmail_id: s.email.facts.gmailId, status: s.status, apply: s.apply, note: s.note ?? null })),
  assessments: group.assessments.map((a) => ({ kind: a.kind, title: a.title, existing: a.existing?.id ?? null, apply: a.apply })),
});

// What the card proposed against what was accepted: the application it was
// aimed at, which changes were ticked, and the company/role typed on a new row.
// An accept with nothing changed is recorded too: it's how often a rule is right.
export function emailAcceptFeedback(args: {
  group: JobGroup; // as the rules planned it
  card: JobGroup; // re-planned for the chosen target
  defaultTicks: Set<string>;
  ticks: Set<string>;
  defaults: { company: string; role: string }; // what the new-row inputs started as
  inputs: { company: string; role: string };
  payload: EmailJobPayload;
  bulk?: boolean;
}): FeedbackInsert {
  const { group, card, defaultTicks, ticks, defaults, inputs, payload, bulk = false } = args;
  const isNew = card.target.type === "new";
  const guess: Record<string, unknown> = { target: targetKey(group.target), ticks: [...defaultTicks].sort() };
  const final: Record<string, unknown> = { target: targetKey(card.target), ticks: [...ticks].sort() };
  if (isNew) {
    guess.company = defaults.company;
    guess.role = defaults.role;
    final.company = inputs.company.trim();
    final.role = inputs.role.trim();
  }
  return {
    surface: "email",
    action: "accept",
    subject_id: group.emails[0].facts.gmailId,
    guess: toJson(guess),
    final: toJson(final),
    changed: changedKeys(guess, final),
    context: toJson({ ...groupContext(group), bulk, payload }),
  };
}

export function emailDismissFeedback(groups: JobGroup[], bulk: boolean): FeedbackInsert {
  return {
    surface: "email",
    action: "dismiss",
    subject_id: groups[0]?.emails[0]?.facts.gmailId ?? null,
    guess: toJson({ targets: groups.map((g) => targetKey(g.target)), nothing_to_do: groups.map((g) => g.nothingToDo) }),
    context: toJson({ bulk, groups: groups.map(groupContext) }),
  };
}

export function emailMuteFeedback(kind: MuteKind, value: string, group: JobGroup): FeedbackInsert {
  return {
    surface: "email",
    action: "mute",
    subject_id: group.emails[0].facts.gmailId,
    final: toJson({ kind, value }),
    context: toJson(groupContext(group)),
  };
}
