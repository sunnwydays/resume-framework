"use client";

import { useState } from "react";
import { gmailLink } from "@/lib/tracker/email/rows";
import { buttonCls, EMAIL_KINDS, formatDate, type EmailKind, type EmailMessage } from "@/lib/tracker/format";

interface Props {
  emails: EmailMessage[]; // dismissed, newest first
  onRestore: (ids: string[]) => void;
}

const PAGE = 40;

// Emails dismissed from the review, kept so a misclick can be undone. Restoring
// sends one back to pending; the next scan re-reads it with the current rules.
export default function DismissedEmails({ emails, onRestore }: Props) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  if (emails.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      <div className="flex items-center gap-2">
        <button type="button" className={buttonCls} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          Dismissed {emails.length}
        </button>
        {open && (
          <button
            type="button"
            className="text-xs underline"
            onClick={() => window.confirm(`Restore all ${emails.length} dismissed emails to review?`) && onRestore(emails.map((e) => e.id))}
          >
            Restore all
          </button>
        )}
      </div>
      {open && (
        <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
          {emails.slice(0, shown).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="text-xs text-neutral-500 tabular-nums">{formatDate(e.received_at)}</span>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium dark:bg-neutral-800">
                {EMAIL_KINDS[e.kind as EmailKind] ?? e.kind}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{e.company ?? e.from_name ?? e.from_address}</span>
                {e.role && <span className="text-neutral-600 dark:text-neutral-400"> · {e.role}</span>}
                <span className="text-neutral-500"> · {e.subject}</span>
              </span>
              <a href={gmailLink(e.gmail_id)} target="_blank" rel="noreferrer" className="text-xs text-neutral-500 underline">
                Open in Gmail
              </a>
              <button type="button" className="text-xs underline" onClick={() => onRestore([e.id])}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && emails.length > shown && (
        <button type="button" className={buttonCls} onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, emails.length - shown)} more of {emails.length - shown}
        </button>
      )}
    </div>
  );
}
