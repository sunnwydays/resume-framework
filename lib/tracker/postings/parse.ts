// Reads Jobright "instant alert" emails ("Vandelay just posted a 89% match
// role 1 hour ago") into one posting per job card. The plain-text part of
// these emails is useless (every card collapses to an "APPLY NOW" link), so
// this reads the HTML, where each card is a table with stable element ids.
// Pure; no network and no DOM.

import { cleanText, decodeEntities } from "@/lib/tracker/email/parse";

export interface ParsedPosting {
  source: "jobright";
  sourceId: string;
  url: string; // canonical Jobright link, tracking params dropped
  company: string;
  role: string;
  location: string | null;
  pay: string | null;
  referrals: string | null;
  categories: string | null;
  matchPct: number | null;
  postedAt: string | null; // ISO: when the email arrived minus "N hours ago"
  firstSeenAt: string; // ISO: when the email arrived
  gmailId: string;
}

export const JOBRIGHT_ALERT_SENDER = "noreply@jobright.ai";

export function isJobrightAlert(fromAddress: string, subject: string): boolean {
  return fromAddress.toLowerCase() === JOBRIGHT_ALERT_SENDER && /\bjust posted\b/i.test(subject);
}

const MINUTE = 60_000;
const UNIT_MS: Record<string, number> = { minute: MINUTE, hour: 60 * MINUTE, day: 24 * 60 * MINUTE, week: 7 * 24 * 60 * MINUTE };

// "37 minutes ago", "1 hour ago", "an hour ago", "2 days ago", "just now" -> ms.
export function parseAge(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (/^(?:just now|now)$/.test(t)) return 0;
  const m = /^(an?|\d+)\s+(minute|hour|day|week)s?\s+ago$/.exec(t);
  if (!m) return null;
  return (m[1][0] === "a" ? 1 : Number(m[1])) * UNIT_MS[m[2]];
}

const withoutComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "");
const toText = (html: string) => cleanText(decodeEntities(withoutComments(html).replace(/<[^>]*>/g, " ")));

// The inner HTML of every element carrying id="<id>", in order. Counts nested
// tags of the same name so "<span id=x><span>89</span>%</span>" keeps the "%".
function innerHtmlById(html: string, id: string): string[] {
  const out: string[] = [];
  const open = new RegExp(`<(\\w+)\\b[^>]*?\\bid\\s*=\\s*["']${id}["'][^>]*>`, "gi");
  for (let m = open.exec(html); m; m = open.exec(html)) {
    const tag = m[1];
    const from = m.index + m[0].length;
    const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
    tags.lastIndex = from;
    let depth = 1;
    let end = html.length;
    for (let t = tags.exec(html); t; t = tags.exec(html)) {
      depth += t[1] ? -1 : t[0].endsWith("/>") ? 0 : 1;
      if (depth === 0) {
        end = t.index;
        break;
      }
    }
    out.push(html.slice(from, end));
  }
  return out;
}

const firstText = (html: string, id: string) => {
  const found = innerHtmlById(html, id)[0];
  return found === undefined ? null : toText(found) || null;
};

type TagKind = "pay" | "referrals" | "location";

// Tags come in any subset and order, so each is read by what it says.
export function classifyTag(text: string): TagKind {
  if (/\breferrals?\b/i.test(text)) return "referrals";
  if (/\$|€|£|\/\s*(?:hr|hour|yr|year|mo|month|wk|week)\b/i.test(text)) return "pay";
  return "location";
}

const CARD_MARKER = /\bid\s*=\s*["']job-section["']/gi;
const JOB_LINK = /jobs\/info\/([0-9a-f]{24})/gi;

function jobIds(html: string): string[] {
  return [...html.matchAll(JOB_LINK)].map((m) => m[1].toLowerCase());
}

export function parseJobrightAlert(html: string, receivedAt: string, gmailId: string): ParsedPosting[] {
  const marks = [...html.matchAll(CARD_MARKER)].map((m) => m.index);
  const received = new Date(receivedAt).getTime();
  const postings: ParsedPosting[] = [];

  marks.forEach((start, i) => {
    // The card's link wraps its table, so it sits just before the marker, after
    // the previous card's last element; the title's own link is the fallback.
    const before = html.slice(i === 0 ? 0 : marks[i - 1], start);
    const card = html.slice(start, marks[i + 1] ?? html.length);
    const gap = before.slice(Math.max(0, before.lastIndexOf("job-time-posted")));
    const sourceId = jobIds(gap).pop() ?? jobIds(card)[0] ?? null;
    const company = firstText(card, "job-company-name");
    const role = firstText(card, "job-title");
    if (!sourceId || !company || !role) return;

    const tags: Partial<Record<TagKind, string>> = {};
    for (const raw of innerHtmlById(card, "job-tag")) {
      const text = toText(raw);
      if (text) tags[classifyTag(text)] ??= text;
    }
    const pct = /\d{1,3}/.exec(firstText(card, "job-match-percentage") ?? "");
    const age = parseAge(firstText(card, "job-time-posted") ?? "");

    postings.push({
      source: "jobright",
      sourceId,
      url: `https://jobright.ai/jobs/info/${sourceId}`,
      company,
      role,
      location: tags.location ?? null,
      pay: tags.pay ?? null,
      referrals: tags.referrals ?? null,
      categories: firstText(card, "job-company-categories"),
      matchPct: pct ? Math.min(100, Number(pct[0])) : null,
      postedAt: age === null || Number.isNaN(received) ? null : new Date(received - age).toISOString(),
      firstSeenAt: receivedAt,
      gmailId,
    });
  });
  return postings;
}
