// The parts of one OA / interview: "Coding Challenge, 100 min" then "Work
// Simulation, 45 min", each with optional sub-parts one level down ("Code
// writing", "AI assistant in a repo"). Stored as `assessments.sections`
// (jsonb); the deadline, link, status and outcome stay on the assessment,
// so a multi-part OA is still one OA everywhere else (Do first, stats).

export interface Section {
  id: string;
  title: string;
  minutes: number | null;
  details: string | null; // what it is
  notes: string | null; // how it went; edited in the detail panel, not the form
  parts: Section[]; // always empty on a sub-part
}

export const newSectionId = (): string => globalThis.crypto.randomUUID();

export function newSection(title = "", makeId = newSectionId): Section {
  return { id: makeId(), title, minutes: null, details: null, notes: null, parts: [] };
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// The stored value, read defensively: anything malformed is dropped, sub-parts
// below the second level are dropped, and a missing id gets a stable one.
export function sectionsOf(value: unknown, depth = 0, prefix = "s"): Section[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v, i): Section[] => {
    if (!v || typeof v !== "object") return [];
    const o = v as Record<string, unknown>;
    const title = text(o.title);
    if (!title) return [];
    const id = text(o.id) ?? `${prefix}${i}`;
    const minutes =
      typeof o.minutes === "number" && Number.isFinite(o.minutes) && o.minutes >= 0 ? Math.round(o.minutes) : null;
    return [
      {
        id,
        title,
        minutes,
        details: text(o.details),
        notes: text(o.notes),
        parts: depth === 0 ? sectionsOf(o.parts, 1, `${id}.`) : [],
      },
    ];
  });
}

// What the editor hands back, ready to save: blank titles dropped, text
// trimmed, empty strings as null.
export function cleanSections(sections: Section[]): Section[] {
  return sectionsOf(sections);
}

// A section's own minutes, else the sum of its parts'. Null when nothing says.
function minutesOf(s: Section): number | null {
  if (s.minutes != null) return s.minutes;
  return sumMinutes(s.parts);
}

function sumMinutes(sections: Section[]): number | null {
  const known = sections.map(minutesOf).filter((m): m is number => m != null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

export const totalMinutes = (sections: Section[]): number | null => sumMinutes(sections);

// The assessment's minutes after its sections change: they follow the
// sections' total while blank or still equal to the old total; a number typed
// by hand stays.
export function nextDuration(current: number | null, before: Section[], after: Section[]): number | null {
  const follows = current == null || current === totalMinutes(before);
  return follows ? totalMinutes(after) ?? current : current;
}

// The edit form doesn't touch notes (they're written in the detail panel), so
// a saved section keeps the notes it has now, matched by id.
export function keepNotes(next: Section[], current: Section[]): Section[] {
  const notes = new Map<string, string | null>();
  for (const s of current) {
    notes.set(s.id, s.notes);
    for (const p of s.parts) notes.set(p.id, p.notes);
  }
  const keep = (s: Section): Section => ({
    ...s,
    notes: notes.has(s.id) ? notes.get(s.id)! : s.notes,
    parts: s.parts.map(keep),
  });
  return next.map(keep);
}

export function setSectionNotes(sections: Section[], id: string, notes: string | null): Section[] {
  return sections.map((s) =>
    s.id === id ? { ...s, notes } : { ...s, parts: s.parts.map((p) => (p.id === id ? { ...p, notes } : p)) }
  );
}

export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// "3 sections" for one-line views; empty when there are none.
export function sectionsLabel(value: unknown): string {
  const n = sectionsOf(value).length;
  return n ? `${n} section${n === 1 ? "" : "s"}` : "";
}

// Everything searchable in them.
export function sectionText(sections: Section[]): string[] {
  return sections.flatMap((s) => [s.title, s.details, s.notes, ...sectionText(s.parts)]).filter((v): v is string => !!v);
}

// ------------------------------------------------------------ text format

// For the export's Sections column (and parseSections reads it back):
//   Coding Challenge (100 min) – Two problems
//     Notes: ran out of time on the second
//     - Code writing
//     - AI assistant in a repo (50 min)
const flat = (s: string) => s.replace(/\s*\n\s*/g, " / ");

function line(s: Section): string {
  return `${s.title}${s.minutes != null ? ` (${s.minutes} min)` : ""}${s.details ? ` – ${flat(s.details)}` : ""}`;
}

export function formatSections(sections: Section[]): string {
  const out: string[] = [];
  for (const s of sections) {
    out.push(line(s));
    if (s.notes) out.push(`  Notes: ${flat(s.notes)}`);
    for (const p of s.parts) {
      out.push(`  - ${line(p)}`);
      if (p.notes) out.push(`    Notes: ${flat(p.notes)}`);
    }
  }
  return out.join("\n");
}

const UNIT = String.raw`(?:hours?|hrs?|h|minutes?|mins?|m)\b`;
const DURATION = new RegExp(
  String.raw`(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b(?:\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?|m)\b)?|(\d+)\s*(?:minutes?|mins?|m)\b`,
  "i"
);

// The first duration in the text, in minutes: "takes 100 minutes", "1.5 hours",
// "1h 30m". A range ("60-90 minutes") reads as its upper end.
export function findMinutes(s: string): number | null {
  const m = DURATION.exec(s);
  if (!m) return null;
  if (m[4]) return parseInt(m[4], 10);
  return Math.round(parseFloat(m[1]) * 60) + (m[3] ? parseInt(m[3], 10) : 0);
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const isShort = (s: string) => words(s) <= 8 && s.length <= 60 && !/[.,;:!?]$/.test(s);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// "Coding Challenge (100 min)" / "Work Simulation - 45 minutes" -> the name.
function cleanTitle(s: string): string {
  const t = s
    .replace(new RegExp(String.raw`\s*\([^)]*\d\s*${UNIT}[^)]*\)`, "i"), "")
    .replace(new RegExp(String.raw`\s*[,:–—-]\s*(?:about\s+|approx\.?\s+|~\s*)?[\d.]+\s*${UNIT}\s*$`, "i"), "")
    .replace(/[\s:–—-]+$/, "")
    .trim();
  return t || s.trim();
}

// What follows the title, minus a leading time clause, since the minutes box
// has it: "typically takes 45 minutes, work through…" -> "Work through…". A
// bare time only goes when a separator or the end follows it, so "2 hours of
// pair programming" stays whole.
const APPROX = String.raw`(?:about\s+|around\s+|approximately\s+|up\s+to\s+|~\s*)?`;
const TIME = String.raw`[\d.]+\s*(?:minutes?|mins?|hours?|hrs?|h|m)\b`;
const LEADING_TIME = [
  new RegExp(
    String.raw`^(?:this\s+(?:\w+\s+)?(?:section|part|portion|exercise|assessment|round|step)\s+)?(?:will\s+)?(?:typically\s+|usually\s+|should\s+)?(?:takes?|lasts?)\s+${APPROX}${TIME}\s*[,;:.–—-]*\s*`,
    "i"
  ),
  new RegExp(String.raw`^${APPROX}${TIME}\s*(?:[,;:.–—-]+\s*|$)`, "i"),
];

function cleanDetails(s: string): string | null {
  const t = s.trim();
  const rx = LEADING_TIME.find((r) => r.test(t));
  if (!rx) return t || null;
  const rest = t.replace(rx, "").trim();
  return rest ? capitalize(rest) : null;
}

// "Title – what it is". An en/em dash always splits (it's what the export
// writes); a hyphen or colon only when what follows is more than a name, so
// "Part 1: Coding (60 min)" stays one title.
function splitHeading(line: string): { title: string; rest: string } | null {
  for (const sep of [/\s+[–—]\s+/, /\s+-\s+/, /:\s+/]) {
    const m = sep.exec(line);
    if (!m) continue;
    const title = line.slice(0, m.index);
    const rest = line.slice(m.index + m[0].length);
    if (!isShort(title.replace(/\([^)]*\)/g, "").trim()) || /[.!?]\s/.test(title)) return null;
    if (sep.source.includes("–") || !isShort(rest)) return { title, rest };
    return null;
  }
  return null;
}

interface Item {
  title: string;
  minutes: number | null;
  details: string | null;
}

function readItem(line: string, bulleted: boolean): Item | null {
  const head = splitHeading(line);
  if (head) {
    return {
      title: cleanTitle(head.title),
      minutes: findMinutes(head.title) ?? findMinutes(head.rest),
      details: cleanDetails(head.rest),
    };
  }
  if (bulleted || isShort(line)) return { title: cleanTitle(line), minutes: findMinutes(line), details: null };
  return null;
}

// "One will be a code writing question, and in the other you will have
// access to an AI assistant" -> two sub-parts.
function cleanPart(s: string): string {
  return capitalize(
    s
      .trim()
      .replace(/^you(?:'ll|\s+will)\s+/i, "")
      .replace(/^(?:have\s+access\s+to|be\s+given|be\s+asked\s+to|work\s+(?:with|on)|use|get)\s+/i, "")
      .replace(/^(?:a|an|the)\s+/i, "")
  );
}

export function proseParts(details: string, makeId = newSectionId): Section[] {
  const m =
    /\bone\s+(?:will\s+be|is)\s+(.+?),?\s+and\s+(?:in\s+)?the\s+other(?:\s+(?:will\s+be|is))?,?\s+(.+?)(?:\.(?:\s|$)|$)/i.exec(
      details
    );
  if (!m) return [];
  return [cleanPart(m[1]), cleanPart(m[2])].filter(Boolean).map((t) => newSection(t, makeId));
}

const BULLET = /^(?:[-*•·◦▪‣–—]|\d{1,2}[.)]|\(?[a-z][.)])\s+/i;

// Pasted text (an invite email's breakdown) or the export's Sections column,
// into sections. A line is a section when it reads like "Title – what it is",
// is a bullet, or is short enough to be a name; other lines add to the
// previous one's details. The first bullet/indent style seen is the top
// level; a different one under it is a sub-part. A section with no sub-parts
// whose details say "one will be…, and the other…" gets those two as parts.
export function parseSections(input: string, makeId = newSectionId): Section[] {
  const out: Section[] = [];
  let topStyle: string | null = null;
  let last: Section | null = null;
  for (const raw of input.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indent = /^\s*/.exec(raw)![0].replace(/\t/g, "  ").length;
    let text = raw.trim();

    const notes = /^notes:\s*(.*)$/i.exec(text);
    if (notes) {
      if (last && notes[1].trim()) last.notes = last.notes ? `${last.notes}\n${notes[1].trim()}` : notes[1].trim();
      continue;
    }

    const bullet = BULLET.exec(text);
    if (bullet) text = text.slice(bullet[0].length).trim();
    const item = text && readItem(text, !!bullet);
    if (!item) {
      const more = cleanDetails(text);
      if (last && more) last.details = last.details ? `${last.details} ${more}` : more;
      continue;
    }

    const style = `${indent >= 2 ? ">" : ""}${bullet ? bullet[0].trim().replace(/\d+|[a-z]/gi, "1") : ""}`;
    topStyle ??= style;
    const section: Section = { id: makeId(), ...item, notes: null, parts: [] };
    const parent = out[out.length - 1];
    if (style !== topStyle && parent) parent.parts.push(section);
    else out.push(section);
    last = section;
  }
  for (const s of out) {
    if (!s.parts.length && s.details) s.parts = proseParts(s.details, makeId);
  }
  return out;
}
