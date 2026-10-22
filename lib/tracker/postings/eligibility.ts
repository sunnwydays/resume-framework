// Can Sunny take this job at all? Only US postings can fail: defense work and
// clearance-gated roles need US citizenship, which a Canadian on a J-1 isn't.
// The posting page's own flags ("U.S. Citizen Only", clearance required) count
// too, and so does a description that says the employer won't sponsor a visa:
// Sunny would need one. Derived on every render, and every list and phrase
// lives in ELIGIBILITY_RULES so tuning is one place.

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

  // A description sentence that mentions sponsorship and a negation is a "no
  // sponsorship" line ("not eligible for visa sponsorship", "without current or
  // future sponsorship", "unable to sponsor"). A positive one ("supportive of
  // immigration sponsorship") has no negation. "Company-sponsored" benefits
  // and "the sponsor" (a program's) aren't about visas.
  sponsorship: /(?<![-\w])sponsor(?:s|ed|ing|ship)?\b/i,
  sponsorshipNegation: /\b(?:not|no|unable|without|cannot|nor)\b|n['’]t\b/i,
  sponsorshipIgnore: /\b(?:the|a) sponsor\b/i,
  // A remote posting's region is often unclear; its sponsorship line still
  // counts when the description names the US.
  mentionsUs: /United States|\bU\.S\.|\bUSA?\b/,
};

// The first sentence of the description that says there's no sponsorship.
export function noSponsorshipLine(description: string | null | undefined): string | null {
  if (!description) return null;
  const rules = ELIGIBILITY_RULES;
  // A sentence ends after a lowercase word, so "the U.S. without…" stays whole.
  for (const raw of description.split(/\n|(?<=[a-z]{2}[.!?])\s+(?=[A-Z])/)) {
    const sentence = raw.replace(/^[\s\-•*+]+/, "").trim();
    if (rules.sponsorship.test(sentence) && rules.sponsorshipNegation.test(sentence) && !rules.sponsorshipIgnore.test(sentence)) {
      return sentence;
    }
  }
  return null;
}

function clip(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
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
  if (region === "unknown" && p.description && rules.mentionsUs.test(p.description)) {
    const line = noSponsorshipLine(p.description);
    if (line) return { level: "no", why: `The description says "${clip(line)}"` };
  }
  if (region !== "us") return { level: "ok" };

  const company = rules.ineligibleCompanies.find((c) => companyCloseness(p.company, c) >= rules.companyMatch);
  if (company) return { level: "no", why: `${company} is a defense employer; roles there need a clearance or US citizenship` };

  const title = rules.ineligibleTitle.exec(p.role);
  if (title) return { level: "no", why: `The title mentions "${title[0]}"` };

  if (p.citizen_only) return { level: "no", why: "The posting page says U.S. citizens only" };
  if (p.clearance_required) return { level: "no", why: "The posting page says a security clearance is required" };

  const sponsorship = noSponsorshipLine(p.description);
  if (sponsorship) return { level: "no", why: `The description says "${clip(sponsorship)}"` };

  if (p.categories && rules.ineligibleCategories.test(p.categories)) {
    return { level: "no", why: `The company's industry is listed as "${p.categories}": US aerospace and defense roles need US citizenship (ITAR)` };
  }

  const category = p.categories ? rules.checkCategories.exec(p.categories) : null;
  if (category) return { level: "check", why: `The company's industry is listed as "${p.categories}": check it doesn't need a clearance` };

  return { level: "ok" };
}
