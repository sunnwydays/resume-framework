"use client";

import { useMemo, useState } from "react";
import { DEFAULT_MOVE_MINUTES, type TemplateStat } from "@/lib/tracker/arbitrage";
import {
  MOVE_CHANNELS,
  buttonCls,
  inputCls,
  primaryButtonCls,
  type MessageTemplate,
  type Move,
  type MoveChannel,
} from "@/lib/tracker/format";
import {
  BLANKS,
  BLANK_META,
  BUILT_IN_TEMPLATES,
  LINKEDIN_NOTE_LIMIT,
  fillTemplate,
  isBuiltIn,
  joinTarget,
  messageLength,
  missingFields,
  type Blank,
  type TemplateFields,
} from "@/lib/tracker/templates";
import { useLocalSetting } from "@/lib/tracker/useLocalSetting";
import type { MovesStore } from "@/lib/tracker/useMoves";

// What another part of the page can open the workshop with (e.g. "Draft
// follow-up" on a move). The page remounts the workshop with a new key.
export interface WorkshopSeed {
  templateKey?: string;
  channel?: MoveChannel;
  fields?: TemplateFields;
  move?: Move; // following up on this move rather than starting a new one
}

interface TemplateOption {
  key: string;
  name: string;
  channel: MoveChannel;
  body: string;
  saved?: MessageTemplate;
}

interface Props {
  seed: WorkshopSeed;
  templates: MessageTemplate[];
  stats: Map<string, TemplateStat>;
  store: Pick<MovesStore, "addMove" | "addTemplate" | "deleteTemplate" | "followUp" | "updateMove">;
}

// Pick a template, fill the blanks, optionally have Claude draft it, then copy
// it out and log it as sent. Nothing is ever sent from here.
export default function Workshop({ seed, templates, stats, store }: Props) {
  const options = useMemo<TemplateOption[]>(
    () => [
      ...BUILT_IN_TEMPLATES,
      ...templates.map((t) => ({
        key: t.id,
        name: t.name,
        channel: (t.channel in MOVE_CHANNELS ? t.channel : "other") as MoveChannel,
        body: t.body,
        saved: t,
      })),
    ],
    [templates]
  );

  const initial = options.find((o) => o.key === seed.templateKey) ?? options[0];
  const [templateKey, setTemplateKey] = useState(initial.key);
  const [channel, setChannel] = useState<MoveChannel>(seed.channel ?? initial.channel);
  const [body, setBody] = useState(initial.body);
  const [fields, setFields] = useState<TemplateFields>(seed.fields ?? {});
  // "About you" rarely changes, so it's remembered on this device.
  const [about, setAbout] = useLocalSetting("tracker.arbitrage.about", "");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingName, setSavingName] = useState<string | null>(null);
  // The seeded move is a snapshot, so a follow-up is logged once per opening.
  const [followUpLogged, setFollowUpLogged] = useState(false);

  const allFields: TemplateFields = { ...fields, about };
  const filled = fillTemplate(body, allFields);
  const output = draft ?? filled;
  const missing = draft === null ? missingFields(body, allFields) : [];
  const length = messageLength(output);
  const overLimit = channel === "linkedin" && length > LINKEDIN_NOTE_LIMIT;
  const target = joinTarget(fields.name, fields.company);
  const current = options.find((o) => o.key === templateKey);
  const edited = current ? body !== current.body : false;

  function pickTemplate(key: string) {
    const t = options.find((o) => o.key === key);
    if (!t) return;
    setTemplateKey(key);
    setBody(t.body);
    setChannel(t.channel);
    setDraft(null);
  }

  function setField(key: Blank, value: string) {
    if (key === "about") setAbout(value);
    else setFields((f) => ({ ...f, [key]: value }));
  }

  async function draftWithClaude() {
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/tracker/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, fields: allFields, templateBody: body, notes }),
      });
      const json = (await res.json()) as { draft?: string; error?: string };
      if (json.draft) setDraft(json.draft);
      else setError(json.error ?? `Draft failed (${res.status})`);
    } catch {
      setError("Couldn't reach the draft service.");
    } finally {
      setDrafting(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setNotice("Copied.");
    } catch {
      setNotice("Couldn't copy; select the text and copy it by hand.");
    }
  }

  async function logAsSent() {
    setError(null);
    if (seed.move) {
      if (followUpLogged) return;
      setFollowUpLogged(true);
      await store.followUp(seed.move);
      if (output.trim()) {
        const note = `Follow-up: ${output.trim()}`;
        await store.updateMove(seed.move.id, { notes: seed.move.notes ? `${seed.move.notes}\n\n${note}` : note });
      }
      setNotice(`Logged a follow-up to ${seed.move.target}.`);
      return;
    }
    const row = await store.addMove({
      channel,
      target,
      link: link.trim() || null,
      template_key: templateKey,
      message: output.trim() || null,
      notes: notes.trim() || null,
      minutes: DEFAULT_MOVE_MINUTES[channel],
    });
    if (row) {
      setNotice(`Logged a message to ${target}. Next person!`);
      setFields((f) => ({ ask: f.ask }));
      setLink("");
      setNotes("");
      setDraft(null);
    }
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!savingName?.trim()) return;
    const row = await store.addTemplate({ channel, name: savingName.trim(), body });
    if (row) {
      setTemplateKey(row.id);
      setSavingName(null);
      setNotice(`Saved “${row.name}”.`);
    }
  }

  return (
    <section id="workshop" className="space-y-4 rounded-lg border border-neutral-200 bg-surface p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Message workshop
          {seed.move && <span className="font-normal text-neutral-500"> · following up with {seed.move.target}</span>}
        </h2>
        <p className="text-xs text-neutral-500">{MOVE_CHANNELS[channel].tip}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const s = stats.get(o.key);
          return (
            <span key={o.key} className="inline-flex">
              <button
                type="button"
                onClick={() => pickTemplate(o.key)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  o.key === templateKey
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
                title={s ? `${s.replied} of ${s.sent} replied` : "Not used yet"}
              >
                {o.name}
                {s && <span className="ml-1 tabular-nums opacity-70">{s.rate}</span>}
              </button>
              {o.saved && o.key === templateKey && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete the template “${o.name}”?`)) {
                      store.deleteTemplate(o.key);
                      pickTemplate(BUILT_IN_TEMPLATES[0].key);
                    }
                  }}
                  aria-label={`Delete template ${o.name}`}
                  className="ml-0.5 px-1 text-xs text-neutral-400 hover:text-red-600"
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-xs font-medium text-neutral-500">
            Channel
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as MoveChannel)}
              className={`${inputCls} mt-1`}
              disabled={!!seed.move}
            >
              {(Object.keys(MOVE_CHANNELS) as MoveChannel[])
                .filter((c) => MOVE_CHANNELS[c].outreach)
                .map((c) => (
                  <option key={c} value={c}>
                    {MOVE_CHANNELS[c].label}
                  </option>
                ))}
            </select>
          </label>
          {BLANKS.map((key) => (
            <label key={key} className="block text-xs font-medium text-neutral-500">
              {BLANK_META[key].label}
              {missing.includes(key) && <span className="ml-1 text-amber-600">· missing</span>}
              {key === "hook" ? (
                <textarea
                  rows={2}
                  value={fields.hook ?? ""}
                  onChange={(e) => setField(key, e.target.value)}
                  placeholder={BLANK_META[key].placeholder}
                  className={`${inputCls} mt-1 font-normal text-foreground`}
                />
              ) : (
                <input
                  value={key === "about" ? about : (fields[key] ?? "")}
                  onChange={(e) => setField(key, e.target.value)}
                  placeholder={BLANK_META[key].placeholder}
                  className={`${inputCls} mt-1 font-normal text-foreground`}
                />
              )}
            </label>
          ))}
          {!seed.move && (
            <label className="block text-xs font-medium text-neutral-500">
              Link (profile, email, thread)
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://linkedin.com/in/…"
                className={`${inputCls} mt-1 font-normal text-foreground`}
              />
            </label>
          )}
          <label className="block text-xs font-medium text-neutral-500">
            Notes for Claude (optional)
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. we met at the Waterloo hackathon; keep it casual"
              className={`${inputCls} mt-1 font-normal text-foreground`}
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <details className="text-xs text-neutral-500">
            <summary className="cursor-pointer select-none">
              Template text{edited ? " (edited)" : ""}
            </summary>
            <textarea
              rows={6}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setDraft(null);
              }}
              className={`${inputCls} mt-1 font-mono text-xs text-foreground`}
            />
            <span className="mt-1 block">Blanks: {"{name} {company} {about} {hook} {ask}"}</span>
          </details>

          <div className="flex items-baseline justify-between text-xs text-neutral-500">
            <span>{draft === null ? "Preview" : "Claude's draft (edit freely)"}</span>
            <span className={`tabular-nums ${overLimit ? "font-medium text-red-600 dark:text-red-400" : ""}`}>
              {length}
              {channel === "linkedin" && ` / ${LINKEDIN_NOTE_LIMIT}`}
            </span>
          </div>
          <textarea
            rows={10}
            value={output}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Message"
            className={`${inputCls} flex-1 text-sm leading-relaxed`}
          />
          {overLimit && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Too long for a LinkedIn connection note. Fine for a DM to an existing connection or InMail.
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={draftWithClaude}
              disabled={drafting || !target}
              title={target ? undefined : "Fill in their name or company first"}
              className={buttonCls}
            >
              {drafting ? "Drafting…" : draft === null ? "Draft with Claude" : "Redraft"}
            </button>
            {draft !== null && (
              <button type="button" onClick={() => setDraft(null)} className={buttonCls}>
                Back to template
              </button>
            )}
            <button type="button" onClick={copy} className={buttonCls}>
              Copy
            </button>
            {savingName === null ? (
              <button
                type="button"
                onClick={() => setSavingName(isBuiltIn(templateKey) ? "" : `${current?.name ?? "Template"} (copy)`)}
                className={buttonCls}
              >
                Save as template
              </button>
            ) : (
              <form onSubmit={saveTemplate} className="flex gap-1.5">
                <input
                  autoFocus
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setSavingName(null)}
                  placeholder="Template name"
                  className={`${inputCls} w-40`}
                />
                <button type="submit" disabled={!savingName.trim()} className={buttonCls}>
                  Save
                </button>
              </form>
            )}
            <button
              type="button"
              onClick={logAsSent}
              disabled={seed.move ? followUpLogged : !target}
              title={seed.move || target ? undefined : "Fill in their name or company first"}
              className={`${primaryButtonCls} sm:ml-auto`}
            >
              {seed.move ? (followUpLogged ? "Follow-up logged" : "Log follow-up") : "Log as sent"}
            </button>
          </div>
          {draft === null && missing.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Still blank: {missing.map((k) => `{${k}}`).join(" ")}
            </p>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {notice && !error && <p className="text-xs text-emerald-700 dark:text-emerald-400">{notice}</p>}
        </div>
      </div>
    </section>
  );
}
