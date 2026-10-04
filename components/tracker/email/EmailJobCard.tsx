"use client";

import { useState } from "react";
import ApplicationPicker from "@/components/tracker/ApplicationPicker";
import { KIND_TONE } from "@/components/tracker/email/tone";
import { retarget, type AssessmentAction, type DateFill, type JobGroup, type Target } from "@/lib/tracker/email/group";
import { canMuteSender } from "@/lib/tracker/email/mute";
import {
  assessmentKey,
  buildPayload,
  defaultTicks,
  fillKey,
  newAppDefaults,
  stepKey,
  type EmailJobPayload,
} from "@/lib/tracker/email/payload";
import { gmailLink } from "@/lib/tracker/email/rows";
import {
  EMAIL_KINDS,
  STATUS_META,
  buttonCls,
  formatDate,
  formatDateTime,
  inputCls,
  kindLabel,
  primaryButtonCls,
  statusLabel,
  type AppStatus,
  type Application,
  type Assessment,
  type MuteKind,
  type StatusChange,
} from "@/lib/tracker/format";
import type { ApplicationOption } from "@/lib/tracker/io";
import type { RoleTrimOptions } from "@/lib/tracker/trimRole";

interface Props {
  group: JobGroup;
  applications: Application[];
  assessments: Assessment[];
  statusChanges: StatusChange[];
  trims: RoleTrimOptions;
  rowIdOf: (gmailId: string) => string;
  onAccept: (payload: EmailJobPayload, label: string) => Promise<string | null>;
  onDismiss: (ids: string[]) => void;
  onMute: (kind: MuteKind, value: string) => void;
}

// What the card is aimed at, as chosen on it: the automatic match, another
// tracked application, or a new one.
type Choice = { type: "auto" } | { type: "existing"; id: string } | { type: "new" };

const origin = (o: string | undefined) => (o ? `from ${o.replace(/-/g, " ")}` : null);

function assessmentText(a: AssessmentAction): string {
  const what = kindLabel(a.kind);
  if (a.existing) {
    if (a.completedAt) return `Mark “${a.existing.title}” completed on ${formatDateTime(a.completedAt)}`;
    const parts = [a.link && !a.existing.link && "its link", a.dueAt && !a.existing.due_at && `due ${formatDateTime(a.dueAt)}`].filter(Boolean);
    return `Fill in “${a.existing.title}”: ${parts.join(", ") || "nothing new"}`;
  }
  if (a.completedAt) return `Add completed ${what}: ${a.title} (${formatDateTime(a.completedAt)})`;
  return `Add ${what}: ${a.title}${a.dueAt ? ` · due ${formatDateTime(a.dueAt)}` : ""}${a.link ? " · with link" : ""}`;
}

function fillText(f: DateFill, app: Application | null): string {
  if (f.field === "applied_on") return `Set the applied date to ${formatDate(f.value)}${app ? ` (now ${formatDate(app.applied_on)})` : ""}`;
  return `Set “${app ? statusLabel(app.status) : "status"} on” to ${formatDate(f.value)}`;
}

export default function EmailJobCard({ group, applications, assessments, statusChanges, trims, rowIdOf, onAccept, onDismiss, onMute }: Props) {
  const [choice, setChoice] = useState<Choice>({ type: "auto" });
  const [changing, setChanging] = useState(false);
  // Only what's been typed; the rest follows the emails and the trim options.
  const [edits, setEdits] = useState<{ company?: string; role?: string }>({});
  const inputs = { ...newAppDefaults(group, trims), ...edits };
  // Ticks belong to one target: re-planning for another starts from its defaults.
  const [tickState, setTickState] = useState<{ key: string; ticks: Set<string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenApp = choice.type === "existing" ? applications.find((a) => a.id === choice.id) ?? null : null;
  const target: Target | null =
    choice.type === "existing" && chosenApp
      ? { type: "existing", application: chosenApp }
      : choice.type === "new"
        ? { type: "new", company: inputs.company, role: inputs.role }
        : null;
  const card = target ? retarget(group, target, assessments, statusChanges) : group;
  const targetKey = choice.type === "existing" ? choice.id : choice.type;
  const ticks = tickState?.key === targetKey ? tickState.ticks : defaultTicks(card);
  const toggle = (key: string) => {
    const next = new Set(ticks);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setTickState({ key: targetKey, ticks: next });
  };

  const app = card.target.type === "existing" ? card.target.application : null;
  const isNew = card.target.type === "new";
  const missing = isNew ? { company: !inputs.company.trim(), role: !inputs.role.trim() } : { company: false, role: false };
  const canAccept = card.target.type === "existing" || (isNew && !missing.company && !missing.role);

  const first = group.emails[0];
  const company = app?.company ?? (inputs.company.trim() || first.fields.company);
  const sender = group.emails.find((e) => canMuteSender(e.facts.fromAddress))?.facts.fromAddress ?? null;
  const options: ApplicationOption[] = applications.map((a) => ({ value: `existing:${a.id}`, company: a.company, role: a.role, isNew: false }));
  const showPicker = group.target.type === "pick" || changing;

  async function accept() {
    setError(null);
    let payload: EmailJobPayload;
    try {
      payload = buildPayload(card, ticks, rowIdOf, isNew ? inputs : undefined);
    } catch (e) {
      return setError((e as Error).message);
    }
    setBusy(true);
    const label = app ? `${app.company} · ${app.role}` : `${inputs.company.trim()} · ${inputs.role.trim()}`;
    const err = await onAccept(payload, label);
    setBusy(false);
    if (err) setError(err);
  }

  const inputField = (key: "company" | "role", label: string) => (
    <label className="block min-w-40 flex-1 space-y-1">
      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {label}
        {origin(first.fields.origins[key]) && inputs[key] && (
          <span className="ml-1.5 font-normal text-neutral-400 dark:text-neutral-500">· {origin(first.fields.origins[key])}</span>
        )}
      </span>
      <input
        value={inputs[key]}
        onChange={(e) => setEdits((v) => ({ ...v, [key]: e.target.value }))}
        className={`${inputCls} ${missing[key] ? "border-amber-400! dark:border-amber-500!" : ""}`}
      />
    </label>
  );

  return (
    <article className="space-y-3 rounded-lg border border-neutral-200 bg-surface p-4 dark:border-neutral-800">
      {/* ---- which application ---- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          {app && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{app.company}</span>
              <span className="text-neutral-600 dark:text-neutral-400">{app.role}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_META[app.status as AppStatus]?.cls ?? ""}`}>
                {statusLabel(app.status)}
              </span>
              {!changing && (
                <button type="button" className="text-xs text-neutral-500 underline" onClick={() => setChanging(true)}>
                  Wrong application?
                </button>
              )}
            </div>
          )}
          {isNew && (
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">New application</p>
              <div className="flex flex-wrap gap-2">
                {inputField("company", "Company")}
                {inputField("role", "Role")}
              </div>
              {!changing && applications.length > 0 && (
                <button type="button" className="text-xs text-neutral-500 underline" onClick={() => setChanging(true)}>
                  Already tracked? Attach to an application
                </button>
              )}
            </div>
          )}
          {group.target.type === "pick" && choice.type === "auto" && (
            <p className="text-sm">
              Several applications at <span className="font-medium">{group.target.company ?? "this company"}</span> fit. Which one is
              this?
            </p>
          )}
          {showPicker && (
            <ApplicationPicker
              value={choice.type === "existing" ? `existing:${choice.id}` : ""}
              options={options}
              company={group.target.type === "existing" ? group.target.application.company : (company ?? "")}
              role={inputs.role}
              emptyLabel={choice.type === "new" ? "New application (above)" : "Pick an application…"}
              optional={choice.type === "new"}
              clearLabel="None of these: it's a new application"
              onChange={(value) => {
                setChoice(value ? { type: "existing", id: value.replace(/^existing:/, "") } : { type: "new" });
                setChanging(false);
              }}
            />
          )}
        </div>
        <span className="text-xs text-neutral-500 tabular-nums">{formatDate(group.emails[group.emails.length - 1].facts.receivedAt)}</span>
      </div>

      {/* ---- the emails, oldest first, each with the step it suggests ---- */}
      <ul className="space-y-1">
        {card.emails.map((email) => {
          const step = card.steps.find((s) => s.email === email);
          const tone = email.kind ? KIND_TONE[email.kind] : null;
          // A new row is created as "applied", so its confirmation isn't optional.
          const fixed = Boolean(step && isNew && step.status === "applied" && step.apply);
          return (
            <li key={email.facts.gmailId} className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-l-2 py-1 pl-2 text-sm ${tone?.edge ?? ""}`}>
              {step ? (
                <input
                  type="checkbox"
                  className="translate-y-0.5"
                  checked={fixed || (step.apply && ticks.has(stepKey(step)))}
                  disabled={fixed || !step.apply || busy}
                  onChange={() => toggle(stepKey(step))}
                  aria-label={`Apply: ${statusLabel(step.status)}`}
                />
              ) : (
                <span className="inline-block w-3.5" />
              )}
              <span className="text-xs text-neutral-500 tabular-nums">{formatDate(email.facts.receivedAt)}</span>
              {email.kind && tone && <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tone.pill}`}>{EMAIL_KINDS[email.kind]}</span>}
              <span className="min-w-0 flex-1 truncate" title={email.facts.subject}>
                {email.facts.subject || "(no subject)"}
              </span>
              <a href={gmailLink(email.facts.gmailId)} target="_blank" rel="noreferrer" className="text-xs text-neutral-500 underline">
                Open in Gmail
              </a>
              <span className="basis-full pl-5 text-xs text-neutral-500">
                {email.facts.fromName || email.facts.fromAddress}
                {email.phrase && <> · matched “{email.phrase}”</>}
                {step && (step.apply ? <> · → {statusLabel(step.status)}</> : step.note && <> · {step.note}</>)}
              </span>
            </li>
          );
        })}
      </ul>

      {/* ---- assessment and date changes ---- */}
      {(card.assessments.length > 0 || card.fills.length > 0) && (
        <ul className="space-y-1 text-sm">
          {card.assessments.map((a, i) => (
            <li key={`a${i}`}>
              <label className={`flex items-baseline gap-2 ${a.apply ? "" : "text-neutral-400"}`}>
                <input
                  type="checkbox"
                  checked={a.apply && ticks.has(assessmentKey(i))}
                  disabled={!a.apply || busy}
                  onChange={() => toggle(assessmentKey(i))}
                />
                <span>
                  {assessmentText(a)}
                  {a.note && <span className="text-xs"> ({a.note})</span>}
                </span>
              </label>
            </li>
          ))}
          {card.fills.map((f) => (
            <li key={f.field}>
              <label className="flex items-baseline gap-2">
                <input type="checkbox" checked={ticks.has(fillKey(f))} disabled={busy} onChange={() => toggle(fillKey(f))} />
                <span>{fillText(f, app)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {/* ---- actions ---- */}
      <div className="flex flex-wrap items-center gap-2">
        {card.nothingToDo && card.target.type === "existing" ? (
          <span className="text-sm text-neutral-500">Already reflected in the tracker.</span>
        ) : (
          <button type="button" className={primaryButtonCls} onClick={accept} disabled={!canAccept || busy}>
            {busy ? "Saving…" : isNew ? "Add application" : "Accept"}
          </button>
        )}
        <button type="button" className={buttonCls} onClick={() => onDismiss(group.emails.map((e) => rowIdOf(e.facts.gmailId)))} disabled={busy}>
          Dismiss
        </button>
        <details className="relative">
          <summary className={`${buttonCls} cursor-pointer list-none`}>Mute ▾</summary>
          <div className="absolute z-10 mt-1 w-64 space-y-0.5 rounded-md border border-neutral-200 bg-surface p-1 shadow-lg dark:border-neutral-800">
            {company && (
              <button type="button" className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900" onClick={() => onMute("company", company)}>
                Never suggest from <span className="font-medium">{company}</span>
              </button>
            )}
            {sender && (
              <button type="button" className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900" onClick={() => onMute("sender", sender)}>
                Never suggest from <span className="font-medium">{sender}</span>
              </button>
            )}
            {!company && !sender && <p className="px-2 py-1 text-xs text-neutral-500">Nothing to mute: no company found and the sender is a job platform.</p>}
          </div>
        </details>
        {!canAccept && isNew && <span className="text-xs text-amber-700 dark:text-amber-400">Fill in the company and role to add it.</span>}
        {group.target.type === "pick" && choice.type === "auto" && <span className="text-xs text-amber-700 dark:text-amber-400">Pick an application first.</span>}
        {error && <span className="text-sm text-red-700 dark:text-red-400">{error}</span>}
      </div>
    </article>
  );
}
