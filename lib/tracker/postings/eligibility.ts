// Can Sunny take this job at all? Only US postings can fail: defense work and
// clearance-gated roles need US citizenship, which a Canadian on a J-1 isn't.
// The posting page's own flags ("U.S. Citizen Only", clearance required) count
// too, and so does a description that requires US citizenship or a green card.
// Separately, `postingSponsorship` reads a description that says the employer
// won't sponsor a visa: Sunny would need one, but that's a policy, not the law,
// so it has its own filter chip. Derived on every render, and every list and
// phrase lives in ELIGIBILITY_RULES so tuning is one place.

import { companyCloseness } from "@/lib/tracker/email/match";
import type { Region } from "@/lib/tracker/postings/region";

export const ELIGIBILITY_RULES = {
  // Employers whose roles need a clearance or US citizenship (ITAR and
  // friends). Matched with companyCloseness, so "RTX Corporation" and
  // "Raytheon, an RTX Business" both hit.
  ineligibleCompanies: [
    "RTX", "Raytheon", "Collins Aerospace", "Pratt & Whitney", "Lockheed Martin", "Northrop Grumman",
    "General Dynamics", "L3Harris", "BAE Systems", "Leidos", "SAIC", "CACI", "Booz Allen Hamilton",
    "Huntington Ingalls", "Anduril", "SpaceX", "Blue Origin", "MITRE", "Sandia", "Lawrence Livermore",
    "Los Alamos", "Johns Hopkins APL",
  ],
  companyMatch: 85,

  // Titles that say so outright.
  ineligibleTitle: /clearance|\bTS\/SCI\b|\bsecret\b|\bU\.?S\.?\s+citizen|\bUS\s+persons?\b|\bITAR\b/i,

  // Industries that are a "no" on their own: US aerospace and defense roles
  // almost all carry an ITAR / export-control citizenship line.
  ineligibleCategories: /defen[cs]e|military|aerospace|\bspace\b|national security/i,

  // Industries worth a second look ("check"), not a "no".
  checkCategories: /government/i,

  // A description sentence that requires US citizenship, a green card or "US
  // person" status (ITAR, export control, federal contracts). No visa gets
  // Sunny in, so it's a "no". If the same sentence lets some visa holders in
  // ("…or an MS student on F1 CPT"), it's a visa policy: sponsorship instead.
  citizenship: /\b(?:U\.?S\.?|United States)\s+(?:citizen(?:ship|s)?|persons?|nationals?)\b|\bpermanent residents?\b|\bgreen card\b|\bITAR\b|\bexport control/i,
  citizenshipRequired: /\b(?:must|requires?|required|only)\b/i,
  citizenshipWaived: /\bnot\s+(?:required|necessary|needed)\b/i,
  visa: /\bvisas?\b|\b[FJ]-?1\b|\bCPT\b|\bOPT\b|\bH-?1B\b/i,

  // A description sentence that mentions sponsorship and a negation is a "no
  // sponsorship" line ("not eligible for visa sponsorship", "without current or
  // future sponsorship", "unable to sponsor"). A positive one ("supportive of
  // immigration sponsorship") has no negation. "Company-sponsored" benefits
  // and "the sponsor" (a program's) aren't about visas.
  sponsorship: /(?<![-\w])sponsor(?:s|ed|ing|ship)?\b/i,
  sponsorshipNegation: /\b(?:not|no|unable|without|cannot|nor)\b|n['’]t\b/i,
  sponsorshipIgnore: /\b(?:the|a) sponsor\b/i,
  // A remote posting's region is often unclear; its description still counts
  // when it names the US.
  mentionsUs: /United States|\bU\.S\.|\bUSA?\b/,
};

// The description's sentences, bullets stripped. A sentence ends after a
// lowercase word, so "the U.S. without…" stays whole.
function sentences(description: string): string[] {
  return description
    .split(/\n|(?<=[a-z]{2}[.!?])\s+(?=[A-Z])/)
    .map((s) => s.replace(/^[\s\-•*+]+/, "").trim())
    .filter(Boolean);
}

function citizenshipSentence(s: string): boolean {
  const rules = ELIGIBILITY_RULES;
  return rules.citizenship.test(s) && rules.citizenshipRequired.test(s) && !rules.citizenshipWaived.test(s);
}

// The first sentence that requires US citizenship or a green card, with no
// visa route.
export function citizenshipLine(description: string | null | undefined): string | null {
  if (!description) return null;
  return sentences(description).find((s) => citizenshipSentence(s) && !ELIGIBILITY_RULES.visa.test(s)) ?? null;
}

// The first sentence that says there's no sponsorship, or a citizenship rule
// that only some visa holders get past.
export function noSponsorshipLine(description: string | null | undefined): string | null {
  if (!description) return null;
  const rules = ELIGIBILITY_RULES;
  return (
    sentences(description).find(
      (s) =>
        (rules.sponsorship.test(s) && rules.sponsorshipNegation.test(s) && !rules.sponsorshipIgnore.test(s)) ||
        (citizenshipSentence(s) && rules.visa.test(s))
    ) ?? null
  );
}

function clip(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const quoted = (line: string) => `The description says "${clip(line)}"`;

// The description is read for US postings, and for unclear-region (mostly
// remote) ones that name the US.
function readsDescription(p: { description?: string | null }, region: Region): boolean {
  return region === "us" || (region === "unknown" && !!p.description && ELIGIBILITY_RULES.mentionsUs.test(p.description));
}

export type EligibilityLevel = "ok" | "check" | "no";

export interface Eligibility {
  level: EligibilityLevel;
  why?: string;
}

interface Eligible {
  company: string;
  role: string;
  categories: string | null;
  citizen_only?: boolean | null;
  clearance_required?: boolean | null;
  description?: string | null;
}

export function postingEligibility(p: Eligible, region: Region): Eligibility {
  const rules = ELIGIBILITY_RULES;
  if (region === "unknown" && readsDescription(p, region)) {
    const line = citizenshipLine(p.description);
    if (line) return { level: "no", why: quoted(line) };
  }
  if (region !== "us") return { level: "ok" };

  const company = rules.ineligibleCompanies.find((c) => companyCloseness(p.company, c) >= rules.companyMatch);
  if (company) return { level: "no", why: `${company} is a defense employer; roles there need a clearance or US citizenship` };

  const title = rules.ineligibleTitle.exec(p.role);
  if (title) return { level: "no", why: `The title mentions "${title[0]}"` };

  if (p.citizen_only) return { level: "no", why: "The posting page says U.S. citizens only" };
  if (p.clearance_required) return { level: "no", why: "The posting page says a security clearance is required" };

  const citizenship = citizenshipLine(p.description);
  if (citizenship) return { level: "no", why: quoted(citizenship) };

  if (p.categories && rules.ineligibleCategories.test(p.categories)) {
    return { level: "no", why: `The company's industry is listed as "${p.categories}": US aerospace and defense roles need US citizenship (ITAR)` };
  }

  const category = p.categories ? rules.checkCategories.exec(p.categories) : null;
  if (category) return { level: "check", why: `The company's industry is listed as "${p.categories}": check it doesn't need a clearance` };

  return { level: "ok" };
}

// Why the posting won't sponsor Sunny's visa (the quoted sentence), or null.
export function postingSponsorship(p: { description?: string | null }, region: Region): string | null {
  if (!readsDescription(p, region)) return null;
  const line = noSponsorshipLine(p.description);
  return line ? quoted(line) : null;
}
