// Tidies job titles pulled from a posting ("Software Engineer Intern, Test
// Automation (Summer 2027)" -> "SWE, Test Automation"). Three independent
// trims, all on by default in the add form.

export interface RoleTrimOptions {
  term: boolean;
  intern: boolean;
  shorten: boolean;
}

export const DEFAULT_TRIMS: RoleTrimOptions = { term: true, intern: true, shorten: true };

export const TRIM_LABELS: Record<keyof RoleTrimOptions, string> = {
  term: "Trim term",
  intern: "Trim intern",
  shorten: "Shorten title",
};

// For a setting kept as text: the trims that are on, comma-separated.
export const trimsToString = (o: RoleTrimOptions) =>
  (Object.keys(TRIM_LABELS) as (keyof RoleTrimOptions)[]).filter((k) => o[k]).join(",");

export function trimsFromString(s: string): RoleTrimOptions {
  const on = new Set(s.split(","));
  return { term: on.has("term"), intern: on.has("intern"), shorten: on.has("shorten") };
}

const SEASON = "(?:spring|summer|fall|autumn|winter)";
const SEASONS = `${SEASON}(?:\\s*[/&,-]\\s*${SEASON})*`;
// "Summer 2027", "Summer '27", "2027 Summer", "Fall/Winter 2026".
const TERM = `(?:${SEASONS}\\s*(?:20|')?\\d\\d|20\\d\\d\\s*${SEASONS})`;
const SEP = "[\\s,\\-–—|:/]";

function trimTerm(role: string): string {
  return (
    role
      // (Summer 2027), [Fall 2026 - Toronto]: any bracket naming a season or year
      .replace(new RegExp(`\\s*[(\\[][^)\\]]*(?:${SEASON}|20\\d\\d)[^)\\]]*[)\\]]`, "gi"), "")
      // "- Summer 2027 Internship" hanging off the end
      .replace(new RegExp(`${SEP}+${TERM}(?:\\s+(?:intern(?:ship)?|co-?op))?\\s*$`, "i"), "")
      // "Summer 2027 Software Engineer Intern"
      .replace(new RegExp(`\\b${TERM}${SEP}*`, "gi"), "")
      // A bare year: "2027 Internship State Estimation", "SWE Intern - 2027"
      .replace(new RegExp(`\\b20[2-3]\\d\\b${SEP}*`, "g"), "")
  );
}

// Drops "Intern", "Internship" and "Intern Program" (and a "/" or "&" joining
// it to a neighbour: "Intern/Co-op" -> "Co-op"). Everything in the tracker is
// an internship, so the word is noise.
function trimIntern(role: string): string {
  return role.replace(
    /(?:[/&]\s*)?\bintern(?:ship)?s?(?:\s+(?:program|opportunity|position|role))?\b(?:\s*[/&])?/gi,
    ""
  );
}

function shorten(role: string): string {
  return role
    .replace(
      /\b(front[\s-]*end|back[\s-]*end|full[\s-]*stack)\s+(?:software\s+)?(?:developer|engineer(?:ing)?)\b/gi,
      (_, kind: string) => {
        const k = kind.toLowerCase().replace(/[\s-]+/g, "");
        return `${k === "frontend" ? "Front End" : k === "backend" ? "Back End" : "Fullstack"} SWE`;
      }
    )
    .replace(/\bsoftware\s+development\s+engineer(?:ing)?\b/gi, "SDE")
    .replace(/\bsoftware\s+(?:engineer(?:ing)?|developer)\b/gi, "SWE");
}

function tidy(role: string): string {
  return role
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s+([,;:])/g, "$1")
    .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(new RegExp(`^${SEP}+|${SEP}+$`, "g"), "")
    .trim();
}

export function trimRole(role: string, opts: RoleTrimOptions): string {
  let out = role;
  if (opts.term) out = trimTerm(out);
  if (opts.intern) out = trimIntern(out);
  if (opts.shorten) out = shorten(out);
  out = tidy(out);
  // A trim should never erase the title entirely.
  return out || role.trim();
}
