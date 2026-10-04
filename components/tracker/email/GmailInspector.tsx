"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import Chip from "@/components/tracker/Chip";
import { KIND_TONE } from "@/components/tracker/email/tone";
import { analyze, groupIntoJobs, matchApplications, type Analyzed, type AppMatch } from "@/lib/tracker/email/group";
import { GmailError, forgetToken, scanGmail, type ScanMode, type ScanProgress, type ScanResult } from "@/lib/tracker/email/gmail";
import type { EmailFacts } from "@/lib/tracker/email/parse";
import {
  EMAIL_KINDS,
  buttonCls,
  formatDate,
  inputCls,
  primaryButtonCls,
  todayISO,
  type EmailKind,
} from "@/lib/tracker/format";
import { useTracker } from "@/lib/tracker/useTracker";

// Development tool (/tracker/gmail-debug). Fetches mail like the real scan
// but writes nothing: every email appears with what the rules made of it, so
// misses and mislabels are easy to spot. The rules run on every render, so
// editing lib/tracker/email/*.ts updates the table without a re-fetch.

type Filter =
  | "all"
  | "classified"
  | "ignored"
  | EmailKind
  | "missing-company"
  | "missing-role"
  | "no-match"
  | "needs-pick";

interface Row {
  a: Analyzed;
  match: AppMatch | null;
}

const PAGE = 200;

const daysAgo = (n: number) => todayISO(Date.now() - n * 86_400_000);

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlighted({ text, phrase }: { text: string; phrase: string | null }) {
  if (!phrase) return <>{text}</>;
  const pattern = phrase.split(/\s+/).map(escapeRegExp).join("\\s+");
  return (
    <>
      {text.split(new RegExp(`(${pattern})`, "i")).map((part, i) =>
        i % 2 ? (
          <mark key={i} className="bg-amber-200 dark:bg-amber-700/60">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function passes(r: Row, filter: Filter, q: string): boolean {
  const { facts: f, kind, fields } = r.a;
  if (q && !`${f.subject} ${f.fromName} ${f.fromAddress} ${fields.company ?? ""}`.toLowerCase().includes(q)) return false;
  switch (filter) {
    case "all":
      return true;
    case "classified":
      return kind !== null;
    case "ignored":
      return kind === null;
    case "missing-company":
      return kind !== null && !fields.company;
    case "missing-role":
      return kind !== null && !fields.role;
    case "no-match":
      return r.match?.matches.length === 0;
    case "needs-pick":
      return (r.match?.matches.length ?? 0) > 1;
    default:
      return kind === filter;
  }
}

// A skeleton to paste into tests/unit/email-*.test.ts. Swap the real names for
// made-up ones first: fixtures must never contain real people or companies.
function fixtureOf(r: Row): string {
  const { facts, kind, fields } = r.a;
  const expected = { kind, company: fields.company, role: fields.role, jobId: fields.jobId };
  return [
    "// TODO: replace real names/addresses with made-up ones before committing.",
    `mail({`,
    `  fromAddress: ${JSON.stringify(facts.fromAddress)},`,
    `  subject: ${JSON.stringify(facts.subject)},`,
    `  text: ${JSON.stringify(facts.text.slice(0, 1500))},`,
    `}),`,
    `// reads as: ${JSON.stringify(expected)}`,
  ].join("\n");
}

function Field({ value, origin }: { value: string | null; origin?: string }) {
  if (!value) return <span className="text-neutral-400">—</span>;
  return (
    <div title={origin}>
      <div className="wrap-break-word">{value}</div>
      {origin && <div className="text-[10px] leading-tight text-neutral-400">{origin}</div>}
    </div>
  );
}

export default function GmailInspector() {
  const tracker = useTracker();
  const { applications, assessments, statusChanges } = tracker;

  const [since, setSince] = useState(() => daysAgo(30));
  const [mode, setMode] = useState<ScanMode>("broad");
  const [cap, setCap] = useState(1000);
  const [facts, setFacts] = useState<EmailFacts[]>([]);
  const [info, setInfo] = useState<ScanResult | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [copied, setCopied] = useState<string | null>(null);

  async function run() {
    abort.current = new AbortController();
    setRunning(true);
    setError(null);
    setProgress(null);
    try {
      const [y, m, d] = since.split("-").map(Number);
      const result = await scanGmail({
        since: new Date(y, m - 1, d),
        mode,
        cap,
        onProgress: setProgress,
        signal: abort.current.signal,
      });
      setFacts(result.facts);
      setInfo(result);
      setOpen(null);
      setShown(PAGE);
    } catch (e) {
      if ((e as Error).name === "AbortError") setError("Cancelled.");
      else setError(e instanceof GmailError ? e.message : `Unexpected error: ${(e as Error).message}`);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const rows: Row[] = useMemo(
    () =>
      facts.map((f) => {
        const a = analyze(f);
        return { a, match: a.kind ? matchApplications(a.fields, applications, { kind: a.kind, receivedAt: f.receivedAt }) : null };
      }),
    [facts, applications]
  );
  const groups = useMemo(
    () => groupIntoJobs(rows.map((r) => r.a), applications, assessments, statusChanges),
    [rows, applications, assessments, statusChanges]
  );

  const classified = rows.filter((r) => r.a.kind);
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: rows.length,
      classified: 0,
      ignored: 0,
      "missing-company": 0,
      "missing-role": 0,
      "no-match": 0,
      "needs-pick": 0,
    };
    for (const r of rows) {
      if (!r.a.kind) {
        c.ignored++;
        continue;
      }
      c.classified++;
      c[r.a.kind] = (c[r.a.kind] ?? 0) + 1;
      if (!r.a.fields.company) c["missing-company"]++;
      if (!r.a.fields.role) c["missing-role"]++;
      if (r.match?.matches.length === 0) c["no-match"]++;
      if ((r.match?.matches.length ?? 0) > 1) c["needs-pick"]++;
    }
    return c;
  }, [rows]);

  const visible = rows.filter((r) => passes(r, filter, query.trim().toLowerCase()));

  const withCompany = classified.filter((r) => r.a.fields.company).length;
  const withRole = classified.filter((r) => r.a.fields.role).length;
  const matched = classified.filter((r) => r.match?.matches.length === 1).length;
  const kindSummary = (Object.keys(EMAIL_KINDS) as EmailKind[])
    .filter((k) => counts[k])
    .map((k) => `${counts[k]} ${EMAIL_KINDS[k].toLowerCase()}`)
    .join(", ");
  const chip = (value: Filter, label: string) => (
    <Chip key={value} active={filter === value} onClick={() => { setFilter(value); setShown(PAGE); }} label={label} count={counts[value]} />
  );

  async function copy(r: Row) {
    await navigator.clipboard.writeText(fixtureOf(r));
    setCopied(r.a.facts.gmailId);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Gmail inspector</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">
          Development tool. Fetches mail the way the real scan will, but saves nothing. Each row shows what the rules made of
          that email. Edit <code>lib/tracker/email/*.ts</code> and this table updates without fetching again.
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-surface p-4 dark:border-neutral-800">
        <label className="space-y-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Scan from
          <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className={`${inputCls} w-40`} disabled={running} />
        </label>
        <label className="space-y-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Query
          <select value={mode} onChange={(e) => setMode(e.target.value as ScanMode)} className={`${inputCls} w-64`} disabled={running}>
            <option value="broad">Broad: everything since the date</option>
            <option value="rules">Rules: what the real scan asks for</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Max emails
          <input type="number" min={50} step={50} value={cap} onChange={(e) => setCap(Math.max(50, Number(e.target.value) || 1000))} className={`${inputCls} w-24`} disabled={running} />
        </label>
        {running ? (
          <button type="button" className={buttonCls} onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        ) : (
          <button type="button" className={primaryButtonCls} onClick={run}>
            {facts.length ? "Scan again" : "Scan Gmail"}
          </button>
        )}
        <button type="button" className={buttonCls} onClick={forgetToken} disabled={running} title="Revoke the access token this page holds">
          Sign out of Google
        </button>
        <div className="basis-full text-xs text-neutral-500" aria-live="polite">
          {running && progress
            ? progress.phase === "listing"
              ? `Listing… ${progress.done} found`
              : `Reading ${progress.done} of ${progress.total}…`
            : running
              ? "Waiting for Google sign-in…"
              : info
                ? `Fetched ${info.facts.length} from ${info.listed} listed${info.failed ? `, ${info.failed} couldn't be read` : ""}${info.capped ? " (hit the max; raise it or narrow the date)" : ""}.`
                : "Not scanned yet."}
        </div>
        {error && <div className="basis-full text-sm text-red-700 dark:text-red-400">{error}</div>}
        {info && (
          <details className="basis-full text-xs text-neutral-500">
            <summary className="cursor-pointer">Gmail query used</summary>
            <code className="mt-1 block break-all">{info.query}</code>
          </details>
        )}
      </section>

      {rows.length > 0 && (
        <>
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            <strong>{rows.length}</strong> fetched · <strong>{counts.classified}</strong> classified ({kindSummary || "none"}) ·{" "}
            <strong>{counts.ignored}</strong> ignored · company found {withCompany}/{classified.length} · role found {withRole}/
            {classified.length} · matched to one application {matched}/{classified.length}
            <br />
            <span className="text-neutral-500">
              Review would show {groups.length} job{groups.length === 1 ? "" : "s"}:{" "}
              {groups.filter((g) => g.target.type === "new").length} new,{" "}
              {groups.filter((g) => g.target.type === "existing" && !g.nothingToDo).length} updates,{" "}
              {groups.filter((g) => g.target.type === "pick").length} needing a pick,{" "}
              {groups.filter((g) => g.nothingToDo).length} with nothing to do.
              {tracker.loading ? " (tracker data still loading)" : ` Matching against ${applications.length} tracked applications.`}
            </span>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {chip("all", "All")}
            {chip("classified", "Classified")}
            {chip("ignored", "Ignored")}
            <span className="mx-1 h-4 w-px bg-neutral-200 dark:bg-neutral-800" />
            {(Object.keys(EMAIL_KINDS) as EmailKind[]).map((k) => chip(k, EMAIL_KINDS[k]))}
            <span className="mx-1 h-4 w-px bg-neutral-200 dark:bg-neutral-800" />
            {chip("missing-company", "No company")}
            {chip("missing-role", "No role")}
            {chip("no-match", "Not tracked")}
            {chip("needs-pick", "Needs pick")}
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }}
              placeholder="Search subject, sender, company…"
              aria-label="Search emails"
              className="ml-auto w-full rounded-md border border-neutral-300 bg-surface px-2.5 py-1 text-sm focus:border-neutral-500 focus:outline-none sm:w-72 dark:border-neutral-700"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full min-w-275 table-fixed border-collapse text-xs">
              <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="w-20 px-2 py-2 font-medium">Date</th>
                  <th className="w-44 px-2 py-2 font-medium">From</th>
                  <th className="w-64 px-2 py-2 font-medium">Subject</th>
                  <th className="w-36 px-2 py-2 font-medium">Read as</th>
                  <th className="w-36 px-2 py-2 font-medium">Company</th>
                  <th className="w-44 px-2 py-2 font-medium">Role</th>
                  <th className="w-24 px-2 py-2 font-medium">Job id</th>
                  <th className="w-40 px-2 py-2 font-medium">Link / due</th>
                  <th className="w-44 px-2 py-2 font-medium">Tracked as</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, shown).map((r) => {
                  const { facts: f, kind, phrase, reason, fields } = r.a;
                  const isOpen = open === f.gmailId;
                  const tone = kind ? KIND_TONE[kind] : null;
                  return (
                    <Fragment key={f.gmailId}>
                      <tr
                        onClick={() => setOpen(isOpen ? null : f.gmailId)}
                        className={`cursor-pointer border-t border-neutral-200 align-top hover:brightness-95 dark:border-neutral-800 dark:hover:brightness-125 ${tone ? tone.row : "text-neutral-500"}`}
                      >
                        <td className={`border-l-4 px-2 py-2 tabular-nums ${tone ? tone.edge : "border-l-transparent"}`}>{formatDate(f.receivedAt)}</td>
                        <td className="px-2 py-2">
                          <div className="truncate" title={f.fromAddress}>{f.fromName || f.fromAddress}</div>
                          <div className="truncate text-[10px] text-neutral-400">{f.fromAddress}</div>
                        </td>
                        <td className="px-2 py-2"><div className="line-clamp-2 wrap-break-word" title={f.subject}>{f.subject}</div></td>
                        <td className="px-2 py-2">
                          {kind ? (
                            <>
                              <span className={`inline-block rounded-full px-2 py-0.5 font-medium ${tone!.pill}`}>{EMAIL_KINDS[kind]}</span>
                              <div className="text-[10px] leading-tight text-neutral-400">&ldquo;{phrase}&rdquo;</div>
                            </>
                          ) : (
                            <div className="text-[10px] leading-tight">ignored: {reason}</div>
                          )}
                        </td>
                        <td className="px-2 py-2"><Field value={fields.company} origin={fields.origins.company} /></td>
                        <td className="px-2 py-2"><Field value={fields.role} origin={fields.origins.role} /></td>
                        <td className="px-2 py-2"><Field value={fields.jobId} origin={fields.origins.jobId} /></td>
                        <td className="px-2 py-2">
                          {fields.link ? <div className="truncate text-sky-700 dark:text-sky-400" title={fields.link}>{fields.link.replace(/^https?:\/\//, "")}</div> : null}
                          {fields.dueAt ? <div>due {formatDate(fields.dueAt)}</div> : null}
                          {fields.completedAt ? <div>done {formatDate(fields.completedAt)}</div> : null}
                          {!fields.link && !fields.dueAt && !fields.completedAt && <span className="text-neutral-400">—</span>}
                        </td>
                        <td className="px-2 py-2">
                          {r.match ? (
                            r.match.matches.length === 1 ? (
                              <div title={r.match.how}>
                                {r.match.matches[0].company} · {r.match.matches[0].role}
                                <div className="text-[10px] text-neutral-400">{r.match.how}</div>
                              </div>
                            ) : r.match.matches.length === 0 ? (
                              <span className="text-amber-700 dark:text-amber-400">not tracked</span>
                            ) : (
                              <span className="text-amber-700 dark:text-amber-400" title={r.match.matches.map((a) => `${a.company} · ${a.role}`).join("\n")}>
                                needs pick ({r.match.matches.length})
                                <div className="text-[10px] text-neutral-400">{r.match.how}</div>
                              </span>
                            )
                          ) : null}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
                          <td colSpan={9} className="px-3 py-3">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <button type="button" className={buttonCls} onClick={() => copy(r)}>
                                {copied === f.gmailId ? "Copied" : "Copy as test fixture"}
                              </button>
                              <a
                                className="text-xs underline"
                                href={`https://mail.google.com/mail/u/0/#all/${f.gmailId.split("#")[0]}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open in Gmail
                              </a>
                              <span className="text-xs text-neutral-500">
                                thread {f.threadId} · {f.text.length} chars read · {f.links.length} links
                              </span>
                            </div>
                            <pre className="max-h-80 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md border border-neutral-200 bg-surface p-3 font-mono text-[11px] leading-relaxed dark:border-neutral-800">
                              <Highlighted text={f.text} phrase={phrase} />
                            </pre>
                            {f.links.length > 0 && (
                              <ul className="mt-2 space-y-0.5 text-[11px] text-neutral-500">
                                {f.links.slice(0, 12).map((l, i) => (
                                  <li key={i} className="truncate">
                                    <span className="text-neutral-700 dark:text-neutral-300">{l.label || "(no text)"}</span> → {l.url}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {visible.length === 0 && <p className="p-6 text-center text-sm text-neutral-500">Nothing matches this filter.</p>}
          </div>
          {visible.length > shown && (
            <button type="button" className={buttonCls} onClick={() => setShown(shown + PAGE)}>
              Show {Math.min(PAGE, visible.length - shown)} more ({visible.length - shown} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}
