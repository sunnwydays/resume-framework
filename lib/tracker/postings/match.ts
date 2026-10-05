// "Is this posting already in the tracker?" Same fuzzy company and role
// matching as the Gmail scan and the spreadsheet import.

import { companyCloseness, roleCloseness } from "@/lib/tracker/email/match";
import type { Application } from "@/lib/tracker/format";

export const COMPANY_MATCH = 85;
export const ROLE_MATCH = 50;

// The closest application with the same company and a similar role, or null.
// A role with nothing distinguishing ("Software Engineer Intern") matches
// other such roles at 50: weak, but not a clash.
export function matchPosting<A extends Pick<Application, "company" | "role">>(
  p: { company: string; role: string },
  applications: A[]
): A | null {
  let best: { app: A; score: number } | null = null;
  for (const app of applications) {
    const company = companyCloseness(p.company, app.company);
    if (company < COMPANY_MATCH) continue;
    const role = roleCloseness(p.role, app.role);
    if (role < ROLE_MATCH) continue;
    const score = role * 1000 + company;
    if (!best || score > best.score) best = { app, score };
  }
  return best?.app ?? null;
}
