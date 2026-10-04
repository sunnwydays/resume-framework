import { MOVE_CHANNELS, channelLabel, type MoveChannel } from "@/lib/tracker/format";
import { BLANKS, BLANK_META, LINKEDIN_NOTE_LIMIT, type TemplateFields } from "@/lib/tracker/templates";

// The prompt for "Draft with Claude" in the Arbitrage workshop, and the
// validation of what the browser sends. Pure, so both are unit-tested; the
// route only adds the API call.

export const DRAFT_MAX_FIELD = 1000;
export const DRAFT_MAX_TEMPLATE = 4000;

export interface DraftRequest {
  channel: MoveChannel;
  fields: TemplateFields;
  templateBody: string;
  notes: string;
}

const str = (v: unknown, max: number): string | null =>
  v === undefined || v === null ? "" : typeof v === "string" && v.length <= max ? v.trim() : null;

export function parseDraftRequest(body: unknown): { ok: true; value: DraftRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Expected a JSON object" };
  const b = body as Record<string, unknown>;
  if (typeof b.channel !== "string" || !(b.channel in MOVE_CHANNELS)) {
    return { ok: false, error: "Unknown channel" };
  }
  const fields: TemplateFields = {};
  const rawFields = (b.fields ?? {}) as Record<string, unknown>;
  if (typeof rawFields !== "object") return { ok: false, error: "fields must be an object" };
  for (const key of BLANKS) {
    const v = str(rawFields[key], DRAFT_MAX_FIELD);
    if (v === null) return { ok: false, error: `Invalid ${key} (text, at most ${DRAFT_MAX_FIELD} characters)` };
    if (v) fields[key] = v;
  }
  const templateBody = str(b.templateBody, DRAFT_MAX_TEMPLATE);
  if (templateBody === null) return { ok: false, error: `Invalid template (at most ${DRAFT_MAX_TEMPLATE} characters)` };
  const notes = str(b.notes, DRAFT_MAX_FIELD);
  if (notes === null) return { ok: false, error: `Invalid notes (text, at most ${DRAFT_MAX_FIELD} characters)` };
  if (!fields.name && !fields.company) {
    return { ok: false, error: "Fill in at least their name or company" };
  }
  return { ok: true, value: { channel: b.channel as MoveChannel, fields, templateBody, notes } };
}

export const DRAFT_SYSTEM = [
  "You write short outreach messages for a student or new grad's job search: LinkedIn DMs, cold emails to startup founders and engineers, and notes to alumni.",
  "Reply with the message only: no preamble, no alternatives, no commentary, and no placeholders like [Your Name].",
  "Use only the facts you're given about the sender. Never invent experience, projects, numbers, schools or mutual connections; if something is missing, write around it.",
  "Keep the sender's ask. Be specific to the recipient, warm and plain: no buzzwords, no flattery, no exclamation-mark enthusiasm.",
].join(" ");

function lengthRule(channel: MoveChannel): string {
  if (channel === "linkedin") {
    return `Keep it under ${LINKEDIN_NOTE_LIMIT} characters (LinkedIn's connection-note limit), in one short paragraph.`;
  }
  if (channel === "email") {
    return "Start with a line \"Subject: ...\", then a blank line, then 3 to 5 sentences.";
  }
  return "Keep it to 3 to 5 sentences.";
}

export function buildDraftPrompt(req: DraftRequest): { system: string; user: string } {
  const lines = [`Channel: ${channelLabel(req.channel)}`, lengthRule(req.channel), ""];
  for (const key of BLANKS) {
    if (req.fields[key]) lines.push(`${BLANK_META[key].label}: ${req.fields[key]}`);
  }
  if (req.notes) lines.push("", `Extra context from the sender: ${req.notes}`);
  if (req.templateBody) {
    lines.push(
      "",
      "Their starting template (blanks in {braces}). Improve it and fill it in, keeping its structure and ask:",
      "<template>",
      req.templateBody,
      "</template>"
    );
  }
  lines.push("", "Write the message.");
  return { system: DRAFT_SYSTEM, user: lines.join("\n") };
}
