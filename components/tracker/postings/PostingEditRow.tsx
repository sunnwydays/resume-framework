"use client";

import { useState } from "react";
import { buttonCls, formatAgo, inputCls, primaryButtonCls } from "@/lib/tracker/format";
import { draftOf, type PostingDraft } from "@/lib/tracker/postings/edits";
import { LEVELS } from "@/lib/tracker/postings/level";
import { REGION_LABEL, type Region } from "@/lib/tracker/postings/region";
import type { PostingView } from "@/lib/tracker/postings/view";
import { ROLE_TYPES } from "@/lib/tracker/roles";

interface Props {
  view: PostingView;
  now: number;
  // Each returns an error message, or null when saved.
  onSave: (initial: PostingDraft, draft: PostingDraft) => Promise<string | null>;
  onReset: () => Promise<string | null>;
  onCancel: () => void;
}

const tdCls = "px-3 py-2 align-top";
const cellInputCls = `${inputCls} px-1.5 py-1 text-xs`;
const smallButtonCls = "px-3 py-1.5 text-center text-xs whitespace-nowrap";
const REGIONS = Object.keys(REGION_LABEL) as Region[];

// A posting row turned into a form. Every value the row shows can be changed:
// the parsed text (company, role, location, pay) and the values the rules work
// out from it (level, region, term, length, type). Enter saves, Escape cancels.
export default function PostingEditRow({ view, now, onSave, onReset, onCancel }: Props) {
  const [initial] = useState(() => draftOf(view));
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { posting } = view;

  const set = <K extends keyof PostingDraft>(key: K, value: PostingDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    const err = await action();
    setBusy(false);
    setError(err);
  };
  const save = () => run(() => onSave(initial, draft));
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") save();
  };

  const text = (key: "company" | "role" | "location" | "pay" | "term" | "length", label: string, placeholder?: string) => (
    <input value={draft[key]} onChange={(e) => set(key, e.target.value)} aria-label={label} placeholder={placeholder} className={cellInputCls} />
  );

  return (
    <tr className="border-b border-neutral-100 bg-amber-50/60 dark:border-neutral-900 dark:bg-amber-950/20" onKeyDown={keys}>
      <td className={`${tdCls} whitespace-nowrap tabular-nums text-neutral-500`}>{formatAgo(posting.posted_at ?? posting.first_seen_at, now)}</td>
      <td className={tdCls}>{text("company", "Company")}</td>
      <td className={`${tdCls} min-w-64`}>
        <div className="space-y-1">
          {text("role", "Role")}
          <div className="grid grid-cols-3 gap-1">
            <select value={draft.role_type} onChange={(e) => set("role_type", e.target.value as PostingDraft["role_type"])} aria-label="Type" className={cellInputCls}>
              {ROLE_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            {text("term", "Term", "Term")}
            {text("length", "Length", "Length")}
          </div>
          {error && <div className="text-xs text-red-700 dark:text-red-400">{error}</div>}
        </div>
      </td>
      <td className={tdCls}>
        <select value={draft.level} onChange={(e) => set("level", e.target.value as PostingDraft["level"])} aria-label="Level" className={cellInputCls}>
          {LEVELS.map((l) => (
            <option key={l.key} value={l.key}>
              {l.key === "unstated" ? "Not stated" : l.label}
            </option>
          ))}
        </select>
      </td>
      <td className={tdCls}>
        <select value={draft.region} onChange={(e) => set("region", e.target.value as Region)} aria-label="Region" className={cellInputCls}>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {REGION_LABEL[r]}
            </option>
          ))}
        </select>
      </td>
      <td className={tdCls}>{text("location", "Location", "—")}</td>
      <td className={tdCls}>{text("pay", "Pay", "—")}</td>
      <td className={`${tdCls} w-56 min-w-56`}>
        <div className="mr-7 grid grid-cols-2 gap-2">
          <button type="button" onClick={save} disabled={busy} className={`${primaryButtonCls} ${smallButtonCls}`}>
            Save
          </button>
          <button type="button" onClick={onCancel} className={`${buttonCls} ${smallButtonCls}`}>
            Cancel
          </button>
          {view.edited.length > 0 && (
            <button
              type="button"
              onClick={() => run(onReset)}
              disabled={busy}
              className="col-span-2 text-xs underline opacity-70"
              title="Drop every hand edit and show what the alert and the rules said"
            >
              Reset to parsed
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
