import type { AtsMeta, AtsParseResponse, AtsResumeData } from "@/lib/types";

// Keys that mark an object as Affinda resume data; used to tell a bare `data`
// object from some unrelated JSON.
const RESUME_KEYS = [
  "rawText",
  "workExperience",
  "education",
  "skills",
  "contact",
  "person",
  "projects",
];

const ARRAY_FIELDS = [
  "education",
  "workExperience",
  "projects",
  "skills",
  "achievements",
] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Turns pasted Affinda JSON into the same shape /api/ats-parse returns, so the
// rest of the app doesn't care where it came from. Accepts the full response
// ({ data, meta }), a bare `data` object, or either wrapped in a one-item array.
// Fields the UI iterates over are defaulted so a trimmed paste can't crash it.
export function parseAtsJson(input: string): AtsParseResponse {
  const trimmed = input.trim();
  if (!trimmed) return { error: "Paste the JSON from Affinda first." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    const reason = e instanceof Error ? ` (${e.message})` : "";
    return {
      error: `That isn't valid JSON${reason}. Copy the whole JSON output from Affinda, including the outer braces.`,
    };
  }

  if (Array.isArray(parsed) && parsed.length === 1) parsed = parsed[0];
  if (!isRecord(parsed)) {
    return { error: "Expected a JSON object from Affinda, not a list or a bare value." };
  }

  if (isRecord(parsed.error) || typeof parsed.error === "string") {
    return { error: "That JSON is an Affinda error response, not a parsed resume." };
  }

  const wrapped = isRecord(parsed.data);
  const data = (wrapped ? parsed.data : parsed) as Record<string, unknown>;
  if (!RESUME_KEYS.some((k) => k in data)) {
    return {
      error:
        "That JSON doesn't look like an Affinda resume parse (no workExperience, education, skills, contact or rawText).",
    };
  }

  const filled: Record<string, unknown> = { ...data };
  for (const key of ARRAY_FIELDS) {
    if (!Array.isArray(filled[key])) filled[key] = [];
  }
  if (!isRecord(filled.contact)) filled.contact = {};
  if (!isRecord(filled.person)) filled.person = {};
  if (typeof filled.rawText !== "string") filled.rawText = "";

  const meta = wrapped && isRecord(parsed.meta) ? (parsed.meta as AtsMeta) : undefined;
  return { data: filled as AtsResumeData, ...(meta && { meta }) };
}
