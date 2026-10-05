// Can Sunny take this job at all? Only US postings can fail: defense work and
// clearance-gated roles need US citizenship, which a Canadian on a J-1 isn't.
// No sponsorship check yet (that would need the posting text). Derived on
// every render, and every list and phrase lives in ELIGIBILITY_RULES so
// tuning is one place.

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

  // Industries worth a second look ("check"), not a "no".
  checkCategories: /defen[cs]e|military|government|aerospace|space|national security/i,
};

export type EligibilityLevel = "ok" | "check" | "no";

export interface Eligibility {
  level: EligibilityLevel;
  why?: string;
}

interface Eligible {
  company: string;
  role: string;
  categories: string | null;
}

export function postingEligibility(p: Eligible, region: Region): Eligibility {
  if (region !== "us") return { level: "ok" };
  const rules = ELIGIBILITY_RULES;

  const company = rules.ineligibleCompanies.find((c) => companyCloseness(p.company, c) >= rules.companyMatch);
  if (company) return { level: "no", why: `${company} is a defense employer; roles there need a clearance or US citizenship` };

  const title = rules.ineligibleTitle.exec(p.role);
  if (title) return { level: "no", why: `The title mentions "${title[0]}"` };

  const category = p.categories ? rules.checkCategories.exec(p.categories) : null;
  if (category) return { level: "check", why: `The company's industry is listed as "${p.categories}": check it doesn't need a clearance` };

  return { level: "ok" };
}
