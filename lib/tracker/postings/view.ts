// A posting plus everything derived from it: region, eligibility, term,
// length, level, role type, and the application it already matches. Computed
// once per render and shared by the filters, the sort and the table. Sunny's
// hand edits (edits.ts) are applied here: text edits before the rules run,
// derived overrides after.

import type { Application, JobPosting } from "@/lib/tracker/format";
import { editsOf, readLengthInput, readTermInput, withTextEdits, type EditField } from "@/lib/tracker/postings/edits";
import { postingEligibility, type Eligibility } from "@/lib/tracker/postings/eligibility";
import { postingLevel, type LevelResult } from "@/lib/tracker/postings/level";
import { matchPosting } from "@/lib/tracker/postings/match";
import { postingRegion, type RegionResult } from "@/lib/tracker/postings/region";
import { postingLength, postingTerm, type Length, type Term } from "@/lib/tracker/postings/term";
import { roleType, type RoleType } from "@/lib/tracker/roles";

export interface PostingView {
  posting: JobPosting; // with the text edits in place
  parsed: JobPosting; // the row as the parser stored it
  edited: EditField[]; // fields Sunny set by hand
  region: RegionResult;
  eligibility: Eligibility;
  term: Term | null; // "Summer 2027", when the title or the posting page says
  length: Length | null; // in months, when the title or the posting page says
  level: LevelResult; // intern, new grad, experienced, or not stated, and why
  roleType: RoleType;
  // The application it was marked applied as, else the closest match.
  tracked: Application | null;
}

const BY_HAND = "Set by you";

// What the rules say about a posting, ignoring any derived overrides.
export function ruleValues(posting: JobPosting) {
  return {
    region: postingRegion(posting),
    term: postingTerm(posting.role, { startText: posting.start_text, seenAt: posting.first_seen_at }),
    length: postingLength(posting.role, posting.length_text),
    level: postingLevel(posting.role, posting.level_text),
    roleType: roleType(posting.role),
  };
}

export function postingView(parsed: JobPosting, applications: Application[], byId?: Map<string, Application>): PostingView {
  const edits = editsOf(parsed);
  const posting = withTextEdits(parsed, edits);
  const rules = ruleValues(posting);
  const region = edits.region ? { region: edits.region, why: BY_HAND } : rules.region;
  const apps = byId ?? new Map(applications.map((a) => [a.id, a]));
  return {
    posting,
    parsed,
    edited: Object.keys(edits) as EditField[],
    region,
    eligibility: postingEligibility(posting, region.region),
    term: edits.term !== undefined ? (readTermInput(edits.term ?? "", posting.first_seen_at) ?? null) : rules.term,
    length: edits.length !== undefined ? (readLengthInput(edits.length ?? "") ?? null) : rules.length,
    level: edits.level ? { level: edits.level, why: BY_HAND } : rules.level,
    roleType: edits.role_type ?? rules.roleType,
    tracked: (posting.application_id ? apps.get(posting.application_id) : undefined) ?? matchPosting(posting, applications),
  };
}

export function buildPostingViews(postings: JobPosting[], applications: Application[]): PostingView[] {
  const byId = new Map(applications.map((a) => [a.id, a]));
  return postings.map((p) => postingView(p, applications, byId));
}

// Postings that need a decision first, then the ones already in the tracker,
// each keeping its order.
export function splitTracked(views: PostingView[]): { open: PostingView[]; tracked: PostingView[] } {
  return { open: views.filter((v) => !v.tracked), tracked: views.filter((v) => v.tracked) };
}

// New or saved postings that match an application: "Mark them applied" links
// each to its application. Dismissed ones stay dismissed.
export function trackedToMark(views: PostingView[]): { posting: JobPosting; app: Application }[] {
  return views.flatMap(({ posting, tracked }) =>
    tracked && (posting.state === "new" || posting.state === "saved") ? [{ posting, app: tracked }] : []
  );
}
