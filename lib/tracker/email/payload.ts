// A reviewed card -> the apply_email_job payload. The card's ticks start from
// what groupIntoJobs proposed; unticking leaves a change out. Steps and
// assessment actions it marked not applicable can't be ticked back on.

import type { AssessmentAction, DateFill, JobGroup, Step } from "@/lib/tracker/email/group";
import { todayISO, type AppStatus, type AssessmentKind } from "@/lib/tracker/format";
import { DEFAULT_TRIMS, trimRole } from "@/lib/tracker/trimRole";

export const stepKey = (s: Step) => `step:${s.email.facts.gmailId}`;
export const assessmentKey = (index: number) => `asmt:${index}`;
export const fillKey = (f: DateFill) => `fill:${f.field}`;

export function defaultTicks(group: JobGroup): Set<string> {
  const ticks = new Set<string>();
  for (const s of group.steps) if (s.apply) ticks.add(stepKey(s));
  group.assessments.forEach((a, i) => a.apply && ticks.add(assessmentKey(i)));
  for (const f of group.fills) ticks.add(fillKey(f));
  return ticks;
}

// A new card's editable company and role, starting from what the emails said
// (the role tidied like the add form does).
export function newAppDefaults(group: JobGroup): { company: string; role: string } {
  const t = group.target;
  const company = t.type === "existing" ? t.application.company : (t.company ?? "");
  const role = t.type === "existing" ? t.application.role : t.role ? trimRole(t.role, DEFAULT_TRIMS) : "";
  return { company, role };
}

export interface EmailJobPayload {
  application_id?: string;
  new_application?: {
    company: string;
    role: string;
    url: null;
    applied_on: string;
    status_changed_at: string;
  };
  steps: { status: AppStatus; at: string }[];
  assessments: {
    id?: string;
    kind?: AssessmentKind;
    title?: string;
    link: string | null;
    due_at: string | null;
    completed_at: string | null;
  }[];
  fill: { status_changed_at?: string; applied_on?: { from: string; to: string } };
  message_ids: string[];
}

function assessmentPayload(a: AssessmentAction): EmailJobPayload["assessments"][number] {
  const common = { link: a.link, due_at: a.dueAt, completed_at: a.completedAt };
  return a.existing ? { id: a.existing.id, ...common } : { kind: a.kind, title: a.title, ...common };
}

// `group` is already planned against the chosen target (see retarget), and
// `newApp` holds the card's company/role inputs when that target is new.
// `rowIdOf` maps a Gmail id to its email_messages id.
export function buildPayload(
  group: JobGroup,
  ticks: Set<string>,
  rowIdOf: (gmailId: string) => string,
  newApp?: { company: string; role: string }
): EmailJobPayload {
  const { target } = group;
  if (target.type === "pick") throw new Error("Pick an application for this card first.");
  const ticked = <T>(items: T[], key: (item: T, i: number) => string) => items.filter((item, i) => ticks.has(key(item, i)));
  const payload: EmailJobPayload = {
    steps: [],
    assessments: ticked(group.assessments, (_, i) => assessmentKey(i)).map(assessmentPayload),
    fill: {},
    message_ids: group.emails.map((e) => rowIdOf(e.facts.gmailId)),
  };

  if (target.type === "existing") {
    payload.application_id = target.application.id;
    payload.steps = ticked(group.steps, stepKey).map((s) => ({ status: s.status, at: s.at }));
    for (const f of ticked(group.fills, fillKey)) {
      if (f.field === "status_changed_at") payload.fill.status_changed_at = f.value;
      else payload.fill.applied_on = { from: target.application.applied_on, to: f.value };
    }
    return payload;
  }

  // A new row is created as "applied", dated by its confirmation (or the
  // first email, when the first thing heard was an OA or a rejection).
  const company = newApp?.company.trim() || target.company?.trim() || "";
  const role = newApp?.role.trim() || target.role?.trim() || "";
  if (!company || !role) throw new Error("A new application needs a company and a role.");
  const applied = group.steps.find((s) => s.status === "applied");
  const since = applied?.at ?? group.emails[0].facts.receivedAt;
  payload.new_application = {
    company,
    role,
    url: null,
    applied_on: todayISO(new Date(since).getTime()),
    status_changed_at: since,
  };
  payload.steps = ticked(group.steps, stepKey)
    .filter((s) => s.status !== "applied")
    .map((s) => ({ status: s.status, at: s.at }));
  return payload;
}
