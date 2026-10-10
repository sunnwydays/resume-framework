// From classified emails to proposals: which tracked application each email
// belongs to, and what it suggests (status steps, assessments, missing dates).
// Pure and recomputed on every render from the pending emails plus the current
// tracker data, so accepting one job immediately makes the next one's match
// land on the new row. Nothing here is applied automatically.

import { RULES, classify } from "@/lib/tracker/email/classify";
import { extractFields, type EmailFields } from "@/lib/tracker/email/fields";
import { companyCloseness, hasDistinctRole, key, mentionsJobId, roleCloseness } from "@/lib/tracker/email/match";
import type { EmailFacts } from "@/lib/tracker/email/parse";
import {
  kindLabel,
  todayISO,
  type AppStatus,
  type Application,
  type Assessment,
  type AssessmentKind,
  type EmailKind,
  type StatusChange,
} from "@/lib/tracker/format";
import { STAGES, furthestStage } from "@/lib/tracker/stats";

export interface Analyzed {
  facts: EmailFacts;
  kind: EmailKind | null;
  phrase: string | null;
  reason: string | null; // why it was ignored
  fields: EmailFields;
}

export function analyze(facts: EmailFacts): Analyzed {
  const c = classify(facts);
  return {
    facts,
    kind: c.kind,
    phrase: c.kind ? c.phrase : null,
    reason: c.kind ? null : c.reason,
    fields: extractFields(facts, c.kind),
  };
}

// ---------------------------------------------------------------------------
// Email -> application

export interface AppMatch {
  matches: Application[]; // 1 = found it; several = ambiguous; none = untracked
  how: string;
}

const COMPANY_MATCH = 60;
const ROLE_MATCH = 50;

// A confirmation usually arrives the day you applied (or just after midnight).
function appliedAround(apps: Application[], receivedAt: string): Application[] {
  const day = todayISO(new Date(receivedAt).getTime());
  const before = todayISO(new Date(receivedAt).getTime() - 86_400_000);
  return apps.filter((a) => a.applied_on === day || a.applied_on === before);
}

export function matchApplications(
  f: Pick<EmailFields, "company" | "role" | "jobId" | "assessmentTitle">,
  apps: Application[],
  context?: { kind: EmailKind | null; receivedAt: string }
): AppMatch {
  const result = matchByName(f, apps);
  // Several roles at one company and a confirmation that doesn't name one:
  // the application made that day is the one it confirms.
  if (result.matches.length > 1 && context?.kind === "confirmation") {
    const sameDay = appliedAround(result.matches, context.receivedAt);
    if (sameDay.length === 1) return { matches: sameDay, how: "company + applied that day" };
  }
  // One tracked job at the company, matched on the name alone, and the
  // confirmation names a role that shares nothing with it: a second application
  // there. Matching it anyway reads "already tracked" and the card disappears
  // (accepting one Meta confirmation made the other one vanish).
  if (context?.kind === "confirmation" && f.role && result.how === "company" && roleCloseness(f.role, result.matches[0].role) === 0) {
    return { matches: [], how: "company tracked, but not this role" };
  }
  return result;
}

function matchByName(f: Pick<EmailFields, "company" | "role" | "jobId" | "assessmentTitle">, apps: Application[]): AppMatch {
  // Which applications are at this company? CodeSignal names the test, not the
  // employer ("Globex Frontend Challenge Assessment"), so the title's start counts.
  const atCompany = apps.filter((a) => {
    if (f.company) return companyCloseness(f.company, a.company) >= COMPANY_MATCH;
    if (f.assessmentTitle) return key(f.assessmentTitle).startsWith(key(a.company)) && key(a.company).length >= 3;
    return false;
  });

  // A requisition number that appears in a posting URL or the notes is the
  // strongest signal, and works even when the company name differs.
  if (f.jobId) {
    const byId = apps.filter((a) => mentionsJobId(`${a.url ?? ""} ${a.notes ?? ""}`, f.jobId));
    const narrowed = atCompany.length ? byId.filter((a) => atCompany.includes(a)) : byId;
    if (narrowed.length === 1) return { matches: narrowed, how: "job id" };
  }

  if (atCompany.length === 0) return { matches: [], how: "no tracked application at this company" };
  if (atCompany.length === 1) return { matches: atCompany, how: "company" };

  if (f.role) {
    const scored = atCompany
      .map((a) => ({ a, score: roleCloseness(f.role!, a.role) }))
      .sort((x, y) => y.score - x.score);
    const best = scored[0].score;
    if (best >= ROLE_MATCH) {
      const top = scored.filter((s) => s.score === best).map((s) => s.a);
      return { matches: top, how: top.length === 1 ? "company + role" : "company + role (tie)" };
    }
    // The email names a specific role and every tracked one there names a
    // different specific role: it's another job at a company you track.
    if (best === 0 && hasDistinctRole(f.role) && atCompany.every((a) => hasDistinctRole(a.role))) {
      return { matches: [], how: "company tracked, but not this role" };
    }
  }
  return { matches: atCompany, how: f.role ? "company (role didn't match any)" : "company (no role in email)" };
}

// ---------------------------------------------------------------------------
// Grouping

export interface Step {
  email: Analyzed;
  status: AppStatus;
  at: string;
  apply: boolean;
  note?: string; // why it isn't ticked
}

export interface AssessmentAction {
  emails: Analyzed[];
  kind: AssessmentKind;
  title: string;
  link: string | null;
  dueAt: string | null;
  existing: Assessment | null; // fill this one in instead of adding another
  completedAt: string | null; // set when a "you completed it" mail was seen
  apply: boolean;
  note?: string;
}

export interface DateFill {
  field: "status_changed_at" | "applied_on";
  value: string; // ISO timestamp, or YYYY-MM-DD for applied_on
  email: Analyzed;
}

export type Target =
  | { type: "existing"; application: Application }
  | { type: "new"; company: string | null; role: string | null }
  | { type: "pick"; candidates: Application[]; company: string | null; role: string | null };

export interface JobGroup {
  key: string;
  target: Target;
  emails: Analyzed[]; // oldest first
  steps: Step[];
  assessments: AssessmentAction[];
  fills: DateFill[];
  nothingToDo: boolean;
  ready: boolean; // the target is settled, so Accept needs no input
}

export const STATUS_FOR: Partial<Record<EmailKind, AppStatus>> = {
  confirmation: "applied",
  oa_invite: "oa",
  video_invite: "video_interview",
  interview_invite: "interview",
  rejection: "rejected",
};
const ASSESSMENT_FOR: Partial<Record<EmailKind, AssessmentKind>> = {
  oa_invite: "oa",
  video_invite: "video_interview",
  interview_invite: "interview",
};
const rank = (status: string) => STAGES.indexOf(status as (typeof STAGES)[number]);
const isClosed = (status: string) => status === "rejected" || status === "withdrawn";
const byTime = (a: Analyzed, b: Analyzed) => a.facts.receivedAt.localeCompare(b.facts.receivedAt);

const assessmentTitle = (e: Analyzed, kind: AssessmentKind) => {
  if (e.fields.assessmentTitle) return e.fields.assessmentTitle;
  const subject = e.facts.subject
    .replace(/^\[?action required\]?:?\s*/i, "")
    .replace(/^(?:reminder:?\s*)/i, "")
    .replace(/\s+invitation$/i, "")
    .replace(/^your\s+/i, "")
    .trim();
  return subject || kindLabel(kind);
};

interface Cluster {
  company: string | null;
  role: string | null;
  jobId: string | null;
  emails: Analyzed[];
}

// Untracked emails -> one cluster per (company, role). Role-less mails (a
// reminder, "assessment completed") join their company's cluster when there is
// exactly one; otherwise they stand alone and the card asks for the role.
function cluster(items: Analyzed[]): Cluster[] {
  const clusters: Cluster[] = [];
  const sameCompany = (a: string | null, b: string | null) => a !== null && b !== null && companyCloseness(a, b) >= 85;
  const place = (e: Analyzed) => {
    const { company, role, jobId } = e.fields;
    const byId = jobId ? clusters.find((c) => c.jobId === jobId && sameCompany(c.company, company)) : undefined;
    if (byId) return byId.emails.push(e);
    if (!company) {
      const sameThread = clusters.find((c) => c.company === null && c.emails.some((x) => x.facts.threadId === e.facts.threadId));
      if (sameThread) return sameThread.emails.push(e);
      return clusters.push({ company: null, role, jobId, emails: [e] });
    }
    const atCompany = clusters.filter((c) => sameCompany(c.company, company));
    const hit = role
      ? atCompany.find((c) => c.role !== null && roleCloseness(c.role, role) >= 60) ??
        (atCompany.length === 1 && atCompany[0].role === null ? atCompany[0] : undefined)
      : atCompany.length === 1
        ? atCompany[0]
        : atCompany.find((c) => c.role === null);
    if (hit) {
      hit.emails.push(e);
      hit.role ??= role;
      hit.jobId ??= jobId;
      return;
    }
    clusters.push({ company, role, jobId, emails: [e] });
  };
  [...items].sort(byTime).forEach(place);
  return clusters;
}

function planGroup(
  emails: Analyzed[],
  app: Application | null,
  assessments: Assessment[],
  changes: StatusChange[]
): Omit<JobGroup, "key" | "target" | "emails" | "ready"> {
  const sorted = [...emails].sort(byTime);

  // ---- status steps, oldest first, forward only ---------------------------
  let reached = app ? rank(furthestStage(app, assessments, changes)) : -1;
  let closed = app ? isClosed(app.status) : false;
  let appliedSeen = false;
  const steps: Step[] = [];
  for (const email of sorted) {
    const status = email.kind ? STATUS_FOR[email.kind] : undefined;
    if (!status) continue;
    const step: Step = { email, status, at: email.facts.receivedAt, apply: true };
    if (closed) {
      step.apply = false;
      step.note = app && isClosed(app.status) ? `already ${app.status}` : "after the rejection";
    } else if (status === "applied") {
      if (appliedSeen || reached >= 0) {
        step.apply = false;
        step.note = appliedSeen ? "same as the first confirmation" : "already tracked";
      }
      appliedSeen = true;
      if (step.apply) reached = Math.max(reached, rank("applied"));
    } else if (status === "rejected") {
      closed = true;
    } else if (rank(status) <= reached) {
      step.apply = false;
      step.note = "already at or past this stage";
    } else {
      reached = rank(status);
    }
    steps.push(step);
  }

  // ---- assessments ---------------------------------------------------------
  const actions: AssessmentAction[] = [];
  const pending = (kind?: AssessmentKind) =>
    assessments.filter((a) => a.status === "pending" && (!kind || a.kind === kind));
  const findAction = (kind: AssessmentKind) => actions.find((a) => a.kind === kind);
  for (const email of sorted) {
    const invite = email.kind ? ASSESSMENT_FOR[email.kind] : undefined;
    if (invite) {
      const have = findAction(invite);
      if (have) {
        // A second mail for the same assessment (platform invite after the
        // company's, or a deadline extension): merge, keeping what's known.
        have.emails.push(email);
        have.link ??= email.fields.link;
        have.dueAt = email.fields.dueAt ?? have.dueAt;
        continue;
      }
      const existing = pending(invite).length === 1 ? pending(invite)[0] : null;
      const action: AssessmentAction = {
        emails: [email],
        kind: invite,
        title: assessmentTitle(email, invite),
        link: email.fields.link,
        dueAt: email.fields.dueAt,
        existing,
        completedAt: null,
        apply: true,
      };
      // Already tracked and nothing new to say: don't offer a no-op.
      if (existing && (existing.link || !action.link) && (existing.due_at || !action.dueAt)) {
        action.apply = false;
        action.note = "already tracked";
      }
      actions.push(action);
    } else if (email.kind === "reminder") {
      const only = pending().length === 1 ? pending()[0] : null;
      const mine = actions[0] ?? null;
      if (mine) {
        mine.emails.push(email);
        mine.dueAt = email.fields.dueAt ?? mine.dueAt;
      } else if (only && ((!only.link && email.fields.link) || (!only.due_at && email.fields.dueAt))) {
        actions.push({
          emails: [email],
          kind: only.kind as AssessmentKind,
          title: only.title,
          link: email.fields.link,
          dueAt: email.fields.dueAt,
          existing: only,
          completedAt: null,
          apply: true,
        });
      }
    } else if (email.kind === "assessment_done") {
      const at = email.fields.completedAt ?? email.facts.receivedAt;
      // A finished video interview completes a video interview, not an OA.
      const done: AssessmentKind = RULES.video.some((r) => r.test(`${email.facts.subject}\n${email.facts.text}`))
        ? "video_interview"
        : "oa";
      const mine = actions.find((a) => !a.completedAt && a.kind === done) ?? null;
      const only = pending(done).length === 1 ? pending(done)[0] : null;
      if (mine) {
        mine.emails.push(email);
        mine.completedAt = at;
        mine.apply = true;
        mine.note = undefined;
      } else if (only) {
        actions.push({
          emails: [email],
          kind: done,
          title: only.title,
          link: null,
          dueAt: null,
          existing: only,
          completedAt: at,
          apply: true,
        });
      } else if (!assessments.some((a) => a.status === "completed" && a.kind === done && email.fields.assessmentTitle && key(a.title) === key(email.fields.assessmentTitle))) {
        actions.push({
          emails: [email],
          kind: done,
          title: assessmentTitle(email, done),
          link: null,
          dueAt: null,
          existing: null,
          completedAt: at,
          apply: true,
        });
      }
    }
  }

  // ---- missing dates on rows that already have the status -----------------
  const fills: DateFill[] = [];
  if (app) {
    // The oldest mail with the row's status dates it; later ones (a second
    // rejection) add nothing.
    const dating = steps.find((s) => s.status === app.status && s.status !== "applied");
    if (dating && !app.status_changed_at) {
      fills.push({ field: "status_changed_at", value: dating.at, email: dating.email });
      dating.apply = false;
      dating.note = "row already has this status; fills its date instead";
    }
    // applied_on defaulted to the day the row was created (an import without a date).
    const first = steps.find((s) => s.status === "applied");
    if (first && app.applied_on === todayISO(new Date(app.created_at).getTime())) {
      const day = todayISO(new Date(first.at).getTime());
      if (day < app.applied_on) fills.push({ field: "applied_on", value: day, email: first.email });
    }
  }

  const nothingToDo =
    !steps.some((s) => s.apply) && !actions.some((a) => a.apply) && fills.length === 0;
  return { steps, assessments: actions, fills, nothingToDo };
}

// The same emails planned against another target: what a card shows once an
// application is picked for it (or "new application" is chosen instead).
export function retarget(
  group: JobGroup,
  target: Target,
  assessments: Assessment[],
  statusChanges: StatusChange[]
): JobGroup {
  const app = target.type === "existing" ? target.application : null;
  const plan = app
    ? planGroup(
        group.emails,
        app,
        assessments.filter((a) => a.application_id === app.id),
        statusChanges.filter((c) => c.application_id === app.id)
      )
    : planGroup(group.emails, null, [], []);
  const ready = target.type === "existing" || (target.type === "new" && Boolean(target.company && target.role));
  return { ...group, target, ready, ...plan };
}

export function groupIntoJobs(
  items: Analyzed[],
  applications: Application[],
  assessments: Assessment[],
  statusChanges: StatusChange[]
): JobGroup[] {
  const classified = items.filter((i) => i.kind !== null);
  const byApp = new Map<string, Analyzed[]>();
  const untracked: Analyzed[] = [];
  const ambiguous: { email: Analyzed; candidates: Application[] }[] = [];

  for (const email of classified) {
    const { matches } = matchApplications(email.fields, applications, { kind: email.kind, receivedAt: email.facts.receivedAt });
    if (matches.length === 1) byApp.set(matches[0].id, [...(byApp.get(matches[0].id) ?? []), email]);
    else if (matches.length === 0) untracked.push(email);
    else ambiguous.push({ email, candidates: matches });
  }

  const groups: JobGroup[] = [];
  for (const [id, emails] of byApp) {
    const application = applications.find((a) => a.id === id)!;
    const mine = assessments.filter((a) => a.application_id === id);
    const changes = statusChanges.filter((c) => c.application_id === id);
    const plan = planGroup(emails, application, mine, changes);
    groups.push({ key: `app:${id}`, target: { type: "existing", application }, emails: [...emails].sort(byTime), ready: true, ...plan });
  }
  for (const c of cluster(untracked)) {
    const target: Target = { type: "new", company: c.company, role: c.role };
    const plan = planGroup(c.emails, null, [], []);
    groups.push({
      key: `new:${c.emails[0].facts.gmailId}`,
      target,
      emails: [...c.emails].sort(byTime),
      ready: Boolean(c.company && c.role),
      ...plan,
    });
  }
  for (const { email, candidates } of ambiguous) {
    const target: Target = { type: "pick", candidates, company: email.fields.company, role: email.fields.role };
    const plan = planGroup([email], null, [], []);
    groups.push({ key: `pick:${email.facts.gmailId}`, target, emails: [email], ready: false, ...plan });
  }
  // Newest activity first.
  return groups.sort((a, b) => b.emails[b.emails.length - 1].facts.receivedAt.localeCompare(a.emails[a.emails.length - 1].facts.receivedAt));
}
