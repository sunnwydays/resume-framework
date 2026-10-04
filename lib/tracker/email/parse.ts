// Turns a Gmail API message (users.messages.get, format=full) into the plain
// facts the rules read: who sent it, when, the subject, readable text, and
// the links with their anchor text. Pure; no network and no DOM, so it runs
// the same in the browser and in tests.

export interface EmailLink {
  url: string;
  label: string;
}

export interface EmailFacts {
  gmailId: string;
  threadId: string;
  receivedAt: string; // ISO
  fromName: string;
  fromAddress: string; // lowercased
  subject: string;
  text: string;
  links: EmailLink[];
}

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}
export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: GmailPart;
}

const MAX_TEXT = 8000;

function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"',
  ndash: "-", mdash: "-", hellip: "...", copy: "(c)", reg: "(r)", trade: "(tm)", bull: "*", middot: "·",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

// Written as escapes (not literal characters) so editors can't silently
// normalize them.
const CURLY_SINGLE = new RegExp("[\\u2018\\u2019\\u201B]", "g");
const CURLY_DOUBLE = new RegExp("[\\u201C\\u201D]", "g");
const ODD_SPACES = new RegExp("[\\u00A0\\u2007\\u202F]", "g");
const INVISIBLE = new RegExp("[\\u200B-\\u200F\\u2060\\uFEFF\\u034F\\u00AD\\u2800\\u2028\\u2029]", "g");

// Curly quotes to straight (the rules are written with straight ones), and
// the invisible padding marketing emails use (zero-width spaces, combining
// grapheme joiners, soft hyphens) removed.
export function cleanText(s: string): string {
  return s
    .replace(INVISIBLE, "")
    .replace(CURLY_SINGLE, "'")
    .replace(CURLY_DOUBLE, '"')
    .replace(ODD_SPACES, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const stripTags = (html: string) => html.replace(/<[^>]*>/g, " ");

export function htmlToText(html: string): { text: string; links: EmailLink[] } {
  const links: EmailLink[] = [];
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1>/gi, " ");
  cleaned.replace(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi, (_, dq, sq, inner: string) => {
    const url = decodeEntities(dq ?? sq ?? "").trim();
    if (/^https?:\/\//i.test(url)) links.push({ url, label: cleanText(decodeEntities(stripTags(inner))) });
    return "";
  });
  const text = decodeEntities(
    stripTags(
      cleaned
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article|blockquote)>/gi, "\n")
        .replace(/<\/t[dh]>/gi, " ")
    )
  );
  return { text: cleanText(text), links };
}

function plainLinks(text: string): EmailLink[] {
  return (text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? []).map((url) => ({ url, label: "" }));
}

function collect(part: GmailPart | undefined, out: { plain: string[]; html: string[] }) {
  if (!part) return;
  const isAttachment = Boolean(part.filename);
  if (!isAttachment && part.body?.data) {
    if (part.mimeType === "text/plain") out.plain.push(decodeBase64Url(part.body.data));
    else if (part.mimeType === "text/html") out.html.push(decodeBase64Url(part.body.data));
  }
  for (const child of part.parts ?? []) collect(child, out);
}

const header = (msg: GmailMessage, name: string) =>
  msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

export function parseFrom(value: string): { name: string; address: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  if (match) return { name: cleanText(decodeEntities(match[1])), address: match[2].trim().toLowerCase() };
  return { name: "", address: value.trim().toLowerCase() };
}

export function parseGmailMessage(msg: GmailMessage): EmailFacts {
  const bodies = { plain: [] as string[], html: [] as string[] };
  collect(msg.payload, bodies);

  const plain = cleanText(decodeEntities(bodies.plain.join("\n")));
  const html = bodies.html.length ? htmlToText(bodies.html.join("\n")) : null;
  // Some senders ship a one-line plain part ("view this email in your
  // browser") next to the real HTML body.
  const usePlain = plain.replace(/\s/g, "").length >= 80 || !html;
  const text = (usePlain ? plain : html!.text).slice(0, MAX_TEXT);
  // Anchor text only exists in the HTML; the plain part still has bare URLs.
  const links = [...(html?.links ?? []), ...plainLinks(plain)];

  const from = parseFrom(header(msg, "From"));
  const received = msg.internalDate
    ? new Date(Number(msg.internalDate))
    : new Date(header(msg, "Date") || Date.now());

  return {
    gmailId: msg.id,
    threadId: msg.threadId,
    receivedAt: (Number.isNaN(received.getTime()) ? new Date() : received).toISOString(),
    fromName: from.name,
    fromAddress: from.address,
    subject: cleanText(decodeEntities(header(msg, "Subject"))),
    text,
    links,
  };
}

// Workday's "Daily Digest" bundles several notifications (maybe for different
// jobs) into one email, each ending "Click here to view the notification
// details." Split them so every notification is classified on its own; the
// notification's own title becomes the subject. Anything else passes through.
export function expandDigest(facts: EmailFacts): EmailFacts[] {
  if (!/daily digest/i.test(facts.subject) || !/(?:^|\.)myworkday\.com$/.test(facts.fromAddress.split("@")[1] ?? "")) {
    return [facts];
  }
  const marker = /Notifications \(\d+\)/i.exec(facts.text);
  if (!marker) return [facts];
  const parts = facts.text
    .slice(marker.index + marker[0].length)
    .split(/click here to view the notification details\.?/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 40);
  if (parts.length === 0) return [facts];
  return parts.map((part, i) => {
    const [title, ...rest] = part.split("\n");
    return { ...facts, gmailId: `${facts.gmailId}#${i + 1}`, subject: title.trim(), text: rest.join("\n").trim() };
  });
}
