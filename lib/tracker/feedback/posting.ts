import { changedKeys, toJson, type FeedbackInsert, type FeedbackReason } from "@/lib/tracker/feedback/events";
import type { EditField } from "@/lib/tracker/postings/edits";
import { formatLength } from "@/lib/tracker/postings/term";
import type { PostingView } from "@/lib/tracker/postings/view";

export const POSTING_DISMISS_REASONS: FeedbackReason[] = [
  { key: "no-sponsor", label: "No sponsor", rule: "lib/tracker/postings/eligibility.ts" },
  { key: "not-eligible", label: "Citizens / clearance only", rule: "lib/tracker/postings/eligibility.ts" },
  { key: "degree", label: "Needs a degree I don't have", rule: "lib/tracker/postings/eligibility.ts" },
  {
    key: "wrong-level",
    label: "Level",
    rule: "lib/tracker/postings/level.ts",
    field: "level",
    fixPlaceholder: "e.g. Intern",
    fixSuggestions: ["Intern", "New grad", "Experienced", "Not stated"],
  },
  { key: "wrong-term", label: "Term", rule: "lib/tracker/postings/term.ts", field: "term", fixPlaceholder: "e.g. Summer 2027" },
  {
    key: "wrong-length",
    label: "Length",
    rule: "lib/tracker/postings/term.ts",
    field: "length",
    fixPlaceholder: "e.g. 4 months",
  },
  {
    key: "wrong-region",
    label: "Region",
    rule: "lib/tracker/postings/region.ts",
    field: "region",
    fixPlaceholder: "e.g. US",
    fixSuggestions: ["US", "Canada", "Elsewhere"],
  },
  { key: "role-type", label: "Type column", rule: "lib/tracker/roles.ts", field: "role_type", fixPlaceholder: "e.g. Data" },
  { key: "role-taste", label: "Not my kind of role", rule: "taste" },
  { key: "company", label: "Company", rule: "taste" },
  { key: "location", label: "Don't want this location", rule: "taste" },
  { key: "pay", label: "Pay", rule: "taste" },
  // Not a rule miss either: the alert was right, it just closed before Sunny got to it.
  { key: "closed", label: "Posting closed", rule: "taste" },
  { key: "other", label: "Other", rule: "taste" },
];

export type PostingFeedbackAction = "dismiss" | "restore" | "save" | "applied";

// The parsed row (description included), without the user id.
function parsedRow(view: PostingView) {
  const { user_id: _user, ...row } = view.parsed;
  void _user;
  return row;
}

// What the app had worked out about a posting when Sunny acted on it, plus the
// posting as parsed. Rules are re-derived on every render, so this is the only
// record of what they said at the time. Values Sunny set by hand are listed in
// `edited` (a dismiss of an edited row is judged on the edited values).
export function postingFeedback(view: PostingView, action: PostingFeedbackAction): FeedbackInsert {
  const { posting, region, eligibility, term, length, level, tracked } = view;
  return {
    surface: "posting",
    action,
    subject_id: posting.id,
    guess: toJson({
      region: region.region,
      region_why: region.why,
      eligibility: eligibility.level,
      eligibility_why: eligibility.why ?? null,
      no_sponsorship: view.noSponsorship,
      term: term?.label ?? null,
      length,
      level: level.level,
      level_why: level.why,
      role_type: view.roleType,
    }),
    context: toJson({ posting: parsedRow(view), edited: view.edited, tracked_application_id: tracked?.id ?? null }),
  };
}

// The values the edit form shows, in the form Sunny typed them.
function shown(view: PostingView) {
  const { posting, region, level, term, length } = view;
  return {
    company: posting.company,
    role: posting.role,
    location: posting.location,
    pay: posting.pay,
    region: region.region,
    level: level.level,
    term: term?.label ?? null,
    length: length ? formatLength(length) : null,
    role_type: view.roleType,
  };
}

// A hand edit: what the row showed before against after, and which fields
// changed. `set_by_hand` is what Sunny changed in the form; a field in
// `changed` but not in it moved because the text under it did (a role edit
// that changes the level). Text fields point at the parser
// (lib/tracker/postings/parse.ts), derived ones at their rule file.
export function postingEditFeedback(before: PostingView, after: PostingView, touched: EditField[], reset = false): FeedbackInsert | null {
  const guess = shown(before);
  const final = shown(after);
  const changed = changedKeys(guess, final);
  if (changed.length === 0) return null;
  return {
    surface: "posting",
    action: "edit",
    subject_id: before.posting.id,
    guess: toJson({ ...guess, region_why: before.region.why, level_why: before.level.why }),
    final: toJson(final),
    changed,
    context: toJson({
      posting: parsedRow(before),
      edits_before: before.parsed.edits,
      edits_after: after.parsed.edits,
      set_by_hand: touched,
      reset,
    }),
  };
}
