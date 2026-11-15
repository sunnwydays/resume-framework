// "Hide every posting from this company": an explicit list Sunny builds from a
// dismiss, never inferred from counts. Hides only `new` postings (a saved or
// applied one is a decision already made), derived every render from the list.

import { companyCloseness } from "@/lib/tracker/email/match";
import type { JobPosting, PostingMute } from "@/lib/tracker/format";
import { COMPANY_MATCH } from "@/lib/tracker/postings/match";

// The mute this posting falls under, or null.
export function mutedCompany(posting: Pick<JobPosting, "company" | "state">, mutes: PostingMute[]): PostingMute | null {
  if (posting.state !== "new") return null;
  return mutes.find((m) => companyCloseness(posting.company, m.company) >= COMPANY_MATCH) ?? null;
}
