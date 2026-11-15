// Masters / PhD-only postings, read from the title or the description. Hidden
// by default (Sunny is an undergrad); MBA is left out on purpose, and a title
// that also names an undergrad route ("[UG/Masters]") isn't flagged.

import { quoted, sentences } from "@/lib/tracker/postings/eligibility";

export const DEGREE_RULES = {
  grad: /\bmasters?\b|\bmaster['’]s\b|\bMS\b|\bph\.?d\b|\bdoctoral\b|\bgraduate students?\b|\(graduate\)|\bsummer associate\b/i,
  undergrad: /\bbachelors?\b|\bbachelor['’]s\b|\bundergrad\w*|\bUG\b|\bBS\b/i,
  // Description: a grad degree named. Bare "master" / "mastery" never match.
  descGrad: /\bmasters\b|\bmaster['’]s\b|\bph\.?d\b|\bgraduate degree\b/i,
  // "MS" is case-sensitive ("Ms." and "ms" don't hit) and not Microsoft.
  descMs: /\bMS\b(?!\s+(?:Office|Excel|Word|Teams|Project|SQL|Access|Azure|Dynamics|Outlook|Power))/,
  // Anywhere in the description, an undergrad route cancels the rule.
  descUndergrad: /\bbachelors?\b|\bbachelor['’]s\b|\bundergrad\w*|\bBS\b|\bB\.S\b|\bassociate['’]?s degree\b/i,
  // The sentence has to require something, not just mention the degree.
  descRequirement:
    /\b(?:enrolled|enrollment|pursuing|pursuit|degree program|must|required|requires?|graduate with|graduating|currently)\b|\b(?:graduate|master['’]?s|masters|ph\.?d) degree in\b/i,
  // "preferred" and the like soften it into a nice-to-have.
  descSoft: /\b(?:preferred|a plus|nice to have|bonus|desirable|ideally)\b/i,
};

function titleGradDegree(role: string): string | null {
  const hit = DEGREE_RULES.grad.exec(role);
  if (!hit || DEGREE_RULES.undergrad.test(role)) return null;
  // "Summer Analyst" is the undergrad title and doesn't match; "Summer
  // Associate" is grad whatever its casing.
  const words = /^summer associate$/i.test(hit[0]) ? "Summer Associate" : hit[0];
  return `The title says "${words}"`;
}

// The first description sentence that requires a Master's / MS / PhD / graduate
// degree, only when the description never mentions an undergrad route.
export function gradDegreeLine(description: string | null | undefined): string | null {
  if (!description || DEGREE_RULES.descUndergrad.test(description)) return null;
  const r = DEGREE_RULES;
  return (
    sentences(description).find(
      (s) => (r.descGrad.test(s) || r.descMs.test(s)) && r.descRequirement.test(s) && !r.descSoft.test(s)
    ) ?? null
  );
}

// Why this posting is a grad-degree role (the title, else the description's
// sentence), or null. The title wins when both hit.
export function postingGradDegree(role: string, description?: string | null): string | null {
  const title = titleGradDegree(role);
  if (title) return title;
  const line = gradDegreeLine(description);
  return line ? quoted(line) : null;
}
