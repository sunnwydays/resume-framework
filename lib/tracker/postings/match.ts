// "Is this posting already in the tracker?" Same fuzzy company and role
// matching as the Gmail scan and the spreadsheet import.

import { companyCloseness, roleCloseness } from "@/lib/tracker/email/match";
import type { Application } from "@/lib/tracker/format";

export const COMPANY_MATCH = 85;
export const ROLE_MATCH = 50;

// A role that carries its location or company ("Software Engineer Intern
// (Summer 2027 - Austin)", "SWE - (Mountain View, CA)") would otherwise be told
// apart from the same job by those words alone.
function withoutWords(role: string, ...sources: (string | null | undefined)[]): string {
  const words = sources.flatMap((s) => (s ?? "").split(/[^\p{L}\p{N}]+/u)).filter((w) => w.length >= 3);
  if (words.length === 0) return role;
  return role.replace(new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${words.join("|")})(?![\p{L}\p{N}])`, "giu"), " ");
}
const withoutCityState = (role: string) => role.replace(/\([^()]*,\s*[A-Za-z]{2}\)/g, " ");

// The closest application with the same company and a similar role, or null.
// A role with nothing distinguishing ("Software Engineer Intern") matches
// other such roles at 50: weak, but not a clash.
export function matchPosting<A extends Pick<Application, "company" | "role"> & { id?: string }>(
  p: { company: string; role: string; location?: string | null },
  applications: A[],
  // application id -> location of the posting it was made from
  appLocations?: Map<string, string>
): A | null {
  const postingRole = withoutWords(withoutCityState(p.role), p.location, p.company);
  let best: { app: A; score: number } | null = null;
  for (const app of applications) {
    const company = companyCloseness(p.company, app.company);
    if (company < COMPANY_MATCH) continue;
    const appRole = withoutWords(withoutCityState(app.role), app.company, app.id ? appLocations?.get(app.id) : null);
    const role = roleCloseness(postingRole, appRole);
    if (role < ROLE_MATCH) continue;
    const score = role * 1000 + company;
    if (!best || score > best.score) best = { app, score };
  }
  return best?.app ?? null;
}
