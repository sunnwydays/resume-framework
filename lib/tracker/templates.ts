import type { MoveChannel } from "@/lib/tracker/format";

// Outreach templates with {blank} fields. Built-ins live here; the user's own
// are rows in message_templates. A move remembers which one it came from
// (`template_key`) so the workshop can show each template's reply rate.

export const BLANKS = ["name", "company", "about", "hook", "ask"] as const;
export type Blank = (typeof BLANKS)[number];
export type TemplateFields = Partial<Record<Blank, string>>;

export const BLANK_META: Record<Blank, { label: string; placeholder: string }> = {
  name: { label: "Their name", placeholder: "Priya" },
  company: { label: "Company", placeholder: "Acme" },
  about: { label: "About you (one line)", placeholder: "a CS student at Waterloo who builds developer tools" },
  hook: {
    label: "Hook (why them, specifically)",
    placeholder: "I read your post on moving search to Postgres and tried the approach on my own project.",
  },
  ask: { label: "The ask", placeholder: "Would you be open to a 15-minute chat next week?" },
};

// LinkedIn connection requests cap the note at 300 characters.
export const LINKEDIN_NOTE_LIMIT = 300;

export interface BuiltInTemplate {
  key: string;
  name: string;
  channel: MoveChannel;
  body: string;
}

export const BUILT_IN_PREFIX = "builtin:";

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    key: "builtin:coffee-chat",
    name: "Coffee chat (engineer)",
    channel: "linkedin",
    body: "Hi {name}, I'm {about}. {hook} I'd love to hear how you like working at {company}. {ask}",
  },
  {
    key: "builtin:founder-email",
    name: "Founder email",
    channel: "email",
    body:
      "Subject: Quick idea for {company}\n\n" +
      "Hi {name},\n\n" +
      "{hook}\n\n" +
      "I'm {about}, and I'd love to help {company} build this. {ask}\n\n" +
      "Thanks for reading!",
  },
  {
    key: "builtin:warm-note",
    name: "Warm intro / alumni",
    channel: "warm",
    body: "Hi {name}! {hook} I'm {about} and I'm really interested in what {company} is doing. {ask}",
  },
  {
    key: "builtin:built-this",
    name: "Built this for you",
    channel: "email",
    body:
      "Subject: I built something for {company}\n\n" +
      "Hi {name},\n\n" +
      "{hook}\n\n" +
      "I'm {about}. {ask}",
  },
  {
    key: "builtin:follow-up",
    name: "Polite follow-up",
    channel: "linkedin",
    body: "Hi {name}, bumping this in case it got buried. {ask} Totally understand if now's not a good time!",
  },
];

export function isBuiltIn(key: string): boolean {
  return key.startsWith(BUILT_IN_PREFIX);
}

const BLANK_RE = /\{(\w+)\}/g;

// Fills every blank that has a value; blanks without one stay visible as
// {name} so it's obvious what's missing.
export function fillTemplate(body: string, fields: TemplateFields): string {
  return body.replace(BLANK_RE, (whole, key: string) => {
    const value = fields[key as Blank]?.trim();
    return value ? value : whole;
  });
}

// The blanks a template uses, in order of first appearance.
export function blanksIn(body: string): string[] {
  return [...new Set([...body.matchAll(BLANK_RE)].map((m) => m[1]))];
}

export function missingFields(body: string, fields: TemplateFields): string[] {
  return blanksIn(body).filter((key) => !fields[key as Blank]?.trim());
}

// A move's target from the workshop fields: "Priya (Acme)", or whichever of
// the two is filled in.
export function joinTarget(name?: string, company?: string): string {
  const n = name?.trim() ?? "";
  const c = company?.trim() ?? "";
  return n && c ? `${n} (${c})` : n || c;
}

// The reverse, for pre-filling the workshop from a move. A target without
// "(Company)" is taken as the name.
export function splitTarget(target: string): { name: string; company: string } {
  const m = /^(.*\S)\s*\(([^()]+)\)$/.exec(target.trim());
  return m ? { name: m[1].trim(), company: m[2].trim() } : { name: target.trim(), company: "" };
}

// Characters as LinkedIn counts them (code points, so an emoji is one).
export function messageLength(text: string): number {
  return [...text].length;
}

// The part of a message after an email's "Subject:" line.
export function splitSubject(text: string): { subject: string | null; body: string } {
  const m = /^Subject:[ \t]*(.*)\r?\n\r?\n?/i.exec(text);
  return m ? { subject: m[1].trim(), body: text.slice(m[0].length) } : { subject: null, body: text };
}
