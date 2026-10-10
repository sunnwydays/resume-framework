import { scanNudge } from "@/lib/tracker/email/scan";
import { todayISO, type Application, type Assessment, type JobPosting, type Move } from "@/lib/tracker/format";
import { nextSteps, type NextStep, type NextStepKind } from "@/lib/tracker/nextSteps";
import { DEFAULT_POSTING_FILTERS, matchesPostingFilters } from "@/lib/tracker/postings/filters";
import { buildPostingViews } from "@/lib/tracker/postings/view";
import { prioritize } from "@/lib/tracker/priority";
import { plural } from "@/lib/tracker/stats";

// The "Today" card on the tracker page: what needs you right now, gathered
// from data the tracker already has. Nothing here is stored or scheduled.

export const MAX_ASSESSMENTS = 3;
export const MAX_STEPS = 3;

// Next steps about a person waiting on you or a thread going cold. The habit
// nudges (send more, start a project, rebalance, rework a template) are
// weekly concerns; they stay on the Arbitrage page instead of nagging daily.
const PEOPLE_STEPS: NextStepKind[] = ["reply", "follow_up", "nudge", "close", "referral"];

export interface TodayAssessment {
  assessment: Assessment;
  application: Application | undefined;
  reason: string; // "due in 5h · important · 45 min"
}

export interface TodayInput {
  applications: Application[];
  assessments: Assessment[];
  moves: Move[];
  postings: JobPosting[];
  allPostings?: boolean; // count every new posting, not just the ones matching the default filters
  pendingEmails: number; // Gmail suggestion cards waiting for review
  lastScanAt: string | null;
  now: number;
}

export interface TodayBrief {
  assessments: TodayAssessment[]; // the top few, best next pick first
  moreAssessments: number; // open ones beyond those
  steps: NextStep[];
  moreSteps: number;
  pendingEmails: number;
  newPostings: number;
  otherPostings: number;
  scan: { text: string; stale: boolean };
  // One line for the collapsed card.
  summary: string;
  // Nothing needs you (the scan's age doesn't count: it's a nudge, not a task).
  empty: boolean;
}

export function buildToday({ applications, assessments, moves, postings, allPostings = false, pendingEmails, lastScanAt, now }: TodayInput): TodayBrief {
  const appsById = new Map(applications.map((a) => [a.id, a]));
  const ranked = prioritize(assessments, appsById, now);
  const open = assessments
    .filter((a) => ranked.has(a.id))
    .sort((a, b) => ranked.get(a.id)!.rank - ranked.get(b.id)!.rank);
  const top = open.slice(0, MAX_ASSESSMENTS).map((a) => ({
    assessment: a,
    application: appsById.get(a.application_id),
    reason: ranked.get(a.id)!.reason,
  }));

  const people = nextSteps(moves, applications, now).filter((s) => PEOPLE_STEPS.includes(s.kind));

  // A posting you can't take (defense, clearance) or already track isn't news.
  // By default only the ones the Postings page shows on load count (its default
  // filters: summer 2027 or no term, internship or no level, up to 4 months or
  // no length), so tuning those defaults tunes this number too.
  const fresh = buildPostingViews(postings, applications).filter(
    (v) => v.posting.state === "new" && !v.tracked && v.eligibility.level !== "no"
  );
  const matching = fresh.filter((v) => matchesPostingFilters(v, DEFAULT_POSTING_FILTERS)).length;
  const newPostings = allPostings ? fresh.length : matching;

  const scan = scanNudge(lastScanAt, pendingEmails, now);
  const empty = open.length === 0 && people.length === 0 && pendingEmails === 0 && newPostings === 0;

  const parts: string[] = [];
  if (open.length) parts.push(`${plural(open.length, "assessment")} to do`);
  if (people.length) parts.push(`${people.length} to reply or follow up`);
  if (pendingEmails) parts.push(`${plural(pendingEmails, "email")} to review`);
  if (newPostings) parts.push(plural(newPostings, "new posting"));

  return {
    assessments: top,
    moreAssessments: open.length - top.length,
    steps: people.slice(0, MAX_STEPS),
    moreSteps: Math.max(0, people.length - MAX_STEPS),
    pendingEmails,
    newPostings,
    // What the other setting would show, for the card's toggle.
    otherPostings: allPostings ? matching : fresh.length,
    scan,
    summary: empty ? "Nothing needs you today" : parts.join(" · "),
    empty,
  };
}

// The card opens by itself the first time you visit on a given day and stays
// open until you say you're done; it comes back the next day.
export function showsToday(dismissedDay: string, now: number): boolean {
  return dismissedDay !== todayISO(now);
}
