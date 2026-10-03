"use client";

import { useEffect, useRef, useState } from "react";
import type { TablesInsert } from "@/lib/tracker/database.types";
import type { ExtractField, ExtractResult } from "@/lib/tracker/extract";
import {
  STATUSES,
  STATUS_META,
  buttonCls,
  inputCls,
  primaryButtonCls,
  sameUrl,
  todayISO,
  type Application,
} from "@/lib/tracker/format";
import { DEFAULT_TRIMS, trimRole, type RoleTrimOptions } from "@/lib/tracker/trimRole";

const ORIGIN_LABEL: Record<string, string> = {
  greenhouse: "from Greenhouse",
  lever: "from Lever",
  ashby: "from Ashby",
  workday: "from Workday",
  linkedin: "from LinkedIn title",
  jsonld: "from page data",
  meta: "guessed from page title",
  domain: "guessed from domain",
};

const TRIM_LABELS: Record<keyof RoleTrimOptions, string> = {
  term: "Trim term",
  intern: "Trim intern",
  shorten: "Shorten title",
};

interface Draft {
  url: string;
  company: string;
  role: string;
  location: string;
  applied_on: string;
  status: string;
  notes: string;
  description: string;
}

const emptyDraft = (url = ""): Draft => ({
  url,
  company: "",
  role: "",
  location: "",
  applied_on: todayISO(),
  status: "applied",
  notes: "",
  description: "",
});

interface Props {
  applications: Application[];
  onAdd: (row: TablesInsert<"applications">) => Promise<Application | null>;
}

export default function AddApplication({ applications, onAdd }: Props) {
  const [link, setLink] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [extracted, setExtracted] = useState<ExtractResult | null>(null);
  const [trims, setTrims] = useState<RoleTrimOptions>(DEFAULT_TRIMS);
  const [saving, setSaving] = useState(false);
  const [focusField, setFocusField] = useState<ExtractField | null>(null);
  const fieldRefs = useRef<Partial<Record<ExtractField, HTMLInputElement | null>>>({});

  // Jump to the first field extraction couldn't fill, once the form exists.
  const formOpen = draft !== null;
  useEffect(() => {
    if (formOpen && focusField) fieldRefs.current[focusField]?.focus();
  }, [formOpen, focusField]);

  const normalizedLink = link.trim();
  const duplicate = normalizedLink
    ? applications.find((a) => a.url && sameUrl(a.url, normalizedLink))
    : undefined;

  async function lookUp(raw: string) {
    const url = raw.trim();
    if (!url) return;
    setExtracting(true);
    setLookupNote(null);
    try {
      const res = await fetch("/api/tracker/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLookupNote(json.error ?? "Lookup failed. Fill it in below.");
        openManual(url);
        return;
      }
      const result = json as ExtractResult;
      setExtracted(result);
      setDraft({
        ...emptyDraft(url),
        company: result.fields.company ?? "",
        role: trimRole(result.fields.role ?? "", trims),
        location: result.fields.location ?? "",
        description: result.fields.description ?? "",
      });
      setFocusField(result.missing[0] ?? null);
      if (result.missing.length) {
        setLookupNote(
          `Couldn't find ${result.missing.join(", ")}. Fill in the highlighted fields.`
        );
      }
    } catch {
      setLookupNote("Lookup failed. Fill it in below.");
      openManual(url);
    } finally {
      setExtracting(false);
    }
  }

  // Re-trim the looked-up title when an option flips, unless it's been edited.
  function toggleTrim(key: keyof RoleTrimOptions) {
    const next = { ...trims, [key]: !trims[key] };
    setTrims(next);
    const raw = extracted?.fields.role;
    if (!raw) return;
    setDraft((d) =>
      d && d.role === trimRole(raw, trims) ? { ...d, role: trimRole(raw, next) } : d
    );
  }

  function openManual(url = normalizedLink) {
    setExtracted(null);
    setDraft(emptyDraft(url));
    setFocusField(url ? "company" : null);
  }

  function reset() {
    setLink("");
    setDraft(null);
    setExtracted(null);
    setLookupNote(null);
    setFocusField(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !draft.company.trim() || !draft.role.trim()) return;
    setSaving(true);
    const added = await onAdd({
      company: draft.company.trim(),
      role: draft.role.trim(),
      url: draft.url.trim() || null,
      location: draft.location.trim() || null,
      applied_on: draft.applied_on || todayISO(),
      status: draft.status,
      notes: draft.notes.trim() || null,
      description: draft.description.trim() || null,
      source: extracted?.source ?? "manual",
    });
    setSaving(false);
    if (added) reset();
  }

  const set = (key: keyof Draft) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setDraft((d) => (d ? { ...d, [key]: e.target.value } : d));

  function field(key: ExtractField, label: string, required = false) {
    if (!draft) return null;
    const value = draft[key];
    const flagged = extracted?.missing.includes(key) && !value.trim();
    const origin = extracted?.origins[key];
    return (
      <label className="block space-y-1">
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          {label}
          {required && " *"}
          {origin && value && (
            <span className="ml-1.5 font-normal text-neutral-400 dark:text-neutral-500">
              · {ORIGIN_LABEL[origin] ?? origin}
            </span>
          )}
        </span>
        <input
          ref={(el) => {
            fieldRefs.current[key] = el;
          }}
          value={value}
          onChange={set(key)}
          required={required}
          className={`${inputCls} ${flagged ? "border-amber-400! dark:border-amber-500!" : ""}`}
        />
      </label>
    );
  }

  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-surface p-4 space-y-3">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          lookUp(link);
        }}
      >
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text").trim();
            if (/^https?:\/\//i.test(pasted)) {
              e.preventDefault();
              setLink(pasted);
              lookUp(pasted);
            }
          }}
          placeholder="Paste a job link to fill in the details…"
          className={inputCls}
          disabled={extracting}
        />
        <div className="flex gap-2 shrink-0">
          <button type="submit" disabled={extracting || !normalizedLink} className={primaryButtonCls}>
            {extracting ? "Looking up…" : "Look up"}
          </button>
          <button type="button" onClick={() => openManual()} className={buttonCls}>
            Add manually
          </button>
        </div>
      </form>

      {duplicate && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Already tracking this link: {duplicate.company} · {duplicate.role}
        </p>
      )}
      {lookupNote && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{lookupNote}</p>
      )}

      {draft && (
        <form onSubmit={save} className="space-y-3 pt-1">
          <div className="grid gap-3 sm:grid-cols-2">
            {field("company", "Company", true)}
            <div className="space-y-1">
              {field("role", "Role", true)}
              {extracted?.fields.role && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {(Object.keys(TRIM_LABELS) as (keyof RoleTrimOptions)[]).map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400"
                    >
                      <input type="checkbox" checked={trims[key]} onChange={() => toggleTrim(key)} />
                      {TRIM_LABELS[key]}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {field("location", "Location")}
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Applied
                </span>
                <input type="date" value={draft.applied_on} onChange={set("applied_on")} className={inputCls} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Status
                </span>
                <select value={draft.status} onChange={set("status")} className={inputCls}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Link</span>
              <input value={draft.url} onChange={set("url")} className={inputCls} />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Notes</span>
              <input value={draft.notes} onChange={set("notes")} className={inputCls} />
            </label>
          </div>
          <details>
            <summary className="cursor-pointer text-xs font-medium text-neutral-500">
              Job description {draft.description ? `(${draft.description.length} chars)` : "(empty)"}
            </summary>
            <textarea
              value={draft.description}
              onChange={set("description")}
              rows={8}
              className={`${inputCls} mt-2 font-mono text-xs`}
              placeholder="Paste the description to keep a copy (postings disappear)."
            />
          </details>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className={primaryButtonCls}>
              {saving ? "Saving…" : "Add application"}
            </button>
            <button type="button" onClick={reset} className={buttonCls}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
