// A posting plus everything derived from it: region, eligibility, and the
// application it already matches. Computed once per render and shared by the
// filters, the sort and the table.

import type { Application, JobPosting } from "@/lib/tracker/format";
import { postingEligibility, type Eligibility } from "@/lib/tracker/postings/eligibility";
import { matchPosting } from "@/lib/tracker/postings/match";
import { postingRegion, type RegionResult } from "@/lib/tracker/postings/region";
import { postingLength, postingTerm, type Length, type Term } from "@/lib/tracker/postings/term";

export interface PostingView {
  posting: JobPosting;
  region: RegionResult;
  eligibility: Eligibility;
  term: Term | null; // "Summer 2027", when the title or the posting page says
  length: Length | null; // in months, when the title or the posting page says
  // The application it was marked applied as, else the closest match.
  tracked: Application | null;
}

export function buildPostingViews(postings: JobPosting[], applications: Application[]): PostingView[] {
  const byId = new Map(applications.map((a) => [a.id, a]));
  return postings.map((posting) => {
    const region = postingRegion(posting);
    return {
      posting,
      region,
      eligibility: postingEligibility(posting, region.region),
      term: postingTerm(posting.role, { startText: posting.start_text, seenAt: posting.first_seen_at }),
      length: postingLength(posting.role, posting.length_text),
      tracked: (posting.application_id ? byId.get(posting.application_id) : undefined) ?? matchPosting(posting, applications),
    };
  });
}

// Postings that need a decision first, then the ones already in the tracker,
// each keeping its order.
export function splitTracked(views: PostingView[]): { open: PostingView[]; tracked: PostingView[] } {
  return { open: views.filter((v) => !v.tracked), tracked: views.filter((v) => v.tracked) };
}
