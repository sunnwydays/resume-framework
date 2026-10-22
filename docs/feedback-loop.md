# Feedback loop

The tracker guesses a lot (which postings fit, what an email is and which job it belongs to, how an import's columns map, what a drafted message should say). When Sunny corrects or confirms a guess, the app saves it as a labeled example in `feedback_events`, so the rules can be tuned from a batch of real corrections instead of one pasted example at a time.

## The idea

Each event is a triple: **what the app guessed, what Sunny chose, and the input it was looking at**, plus an optional reason.

- Capture at decision time, as a snapshot. The rules re-run on every render and rows get edited, so the event copies the guess and its input at the click.
- Confirmations count too. An accept with nothing changed (`changed = []`) is how often a rule is right; without those you can't tell a 5% miss rate from a 50% one.
- Store a pointer when the source lasts, a copy when it doesn't. Emails stay in Gmail, so an event keeps the `gmail_id` (the "no email bodies stored" rule holds). Jobright pages vanish, so their text is copied into `job_postings.description`.
- Logging never blocks the action. `lib/tracker/feedback/client.ts` swallows its own errors.
- `app_version` is the git SHA (`NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, `dev` locally), so a review can skip mistakes a later commit already fixed.

## What's captured

| Surface | Action | Where | guess | final |
|---|---|---|---|---|
| `posting` | `dismiss`, `save`, `applied`, `restore` | `PostingsTable` -> `app/tracker/postings/page.tsx` | derived region, eligibility, term, length, level, role type, and why | (the action is the label); context holds the posting row incl. `description` |
| `posting` | `edit` | `PostingEditRow` (the row's ✎) -> `onEdit` in the page | company, role, location, pay, region, level, term, length, role type as the row showed them | the same after the edit; `changed` lists what differs, `context.set_by_hand` what Sunny changed in the form (the rest moved with the text under it), `context.posting` is the parsed row |
| `email` | `accept` | `EmailJobCard.accept()` / `EmailReview.acceptReady()` | the target the rules picked, the default ticks, the prefilled company/role | the chosen target, the actual ticks, the typed company/role |
| `email` | `dismiss`, `mute` | `EmailReview.dismiss()`, the card's Mute menu | the card's plan | (the action) |
| `import` | `map` | `ImportExport.commit()` | the automatic column mapping, sheet type, assessment targets | what was imported |
| `draft` | `sent` | `Workshop.logAsSent()` | Claude's draft | the text logged as sent, plus `edit_ratio` |

Dismisses show optional **reason chips** under the undo banner (`components/tracker/feedback/ReasonChips.tsx`; reasons in `lib/tracker/feedback/posting.ts` and `email.ts`). Each reason names the rule file it implicates, or `taste` when it's a preference rather than a rule miss. The two kinds are shown apart: "The app got it wrong" chips on one row, the `taste` ones on a "Not for me" row below it. A chip that names a derived value (`field`: region, term, length, level, role type) opens a "Should be:" box; what Sunny types is saved in `final` (`{"region": "US"}`) and `changed`, next to the `guess` it corrects (`labelUpdate` in `events.ts`). Undoing an action stamps `undone_at` (a correction signal, not a label).

Table: `feedback_events` (RLS: own rows only). `surface` and `action` are check constraints mirrored by `FEEDBACK_SURFACES` / `FEEDBACK_ACTIONS` in `lib/tracker/feedback/events.ts`; reasons are plain code constants, no migration to add one. There's no FK to postings or emails on purpose, so "Clear all" doesn't erase the labels.

## Reviewing in a batch

Run `/review-feedback` (project skill, `.claude/skills/review-feedback/SKILL.md`). It reads unreviewed events with read-only SQL, groups them by surface and reason, reads the original emails through the Gmail connector using `gmail_id`, proposes rule changes with anonymised test fixtures (the repo is public: never commit real names, ids or text), and after the change is committed marks the events it covered (`reviewed_at`, `review_ref`).

Useful queries:

```sql
-- what's waiting, by surface / action / reason
select surface, action, coalesce(reason, '(none)') as reason, count(*)
from feedback_events where reviewed_at is null and undone_at is null
group by 1, 2, 3 order by 4 desc;

-- how often are accepted cards unchanged, per version?
select app_version, count(*) filter (where changed = '{}') as unchanged, count(*) as total
from feedback_events where surface = 'email' and action = 'accept' group by 1;
```

## Training later

With a few hundred reviewed events, `guess` / `final` / `context` can be exported as JSONL: few-shot examples for a classifier prompt, or a dataset for a small model. The rules stay the source of truth until a model beats them on the held-back events.

## Later (not built; each starts from a spot that already holds both the guess and the final value)

- [ ] **Email kind can't be corrected on a card.** A rejection read as a confirmation can only be dismissed (the dismiss reason is the stopgap). Add a "Wrong type?" select that re-plans the card. Start: `EmailJobCard.tsx` (kind pill), `group.ts` (`STATUS_FOR`, `ASSESSMENT_FOR`).
- [ ] **Assessment details on email cards are read-only** (kind, title, due date, duration, sections), and cards can't be split or merged. Start: `EmailJobCard.tsx`, `payload.ts` (`assessmentPayload`).
- [ ] **Missed emails leave no trace.** Emails the rules ignored are never stored. Save `gmail_id` plus `reason` for ignored mail, or add a "report a missed email". Start: `GmailScan.tsx` (the `!a.kind` skip), `rows.ts` (`toRow`).
- [ ] **Role type can't be overridden on applications** (postings can, through the row's ✎), only worked around by renaming the role. Start: `lib/tracker/roles.ts`.
- [ ] **Sections parse vs edits.** The parsed sections are thrown away on fill, so edits can't be told from the parse. Start: `SectionsEditor.tsx` `fill()`, `sections.ts` `parseSections`.
- [ ] **Link lookup diffs.** `AddApplication.save()` already holds the extracted fields (and their origins) and the final draft. Record the diff and the role trims. Start: `AddApplication.tsx`, `extract.ts`.
- [ ] **Fixes made after an accept** (`ApplicationDetail`, `AssessmentForm`) aren't tied back to the email that caused them.
- [ ] **Undo from the application page** doesn't stamp `undone_at` on the accept's event (only the review tab's Undo does). Start: `ApplicationDetail.tsx`, `EmailReview.undoLast`.
- [ ] **No rules for pay or "not the kind of role I want" yet.** The `pay` and `role-taste` dismiss reasons are `taste`: collected so a pattern can show up in the data, with nothing to tune. Once there are enough, they could become a pay floor or a wanted-role filter. Start: `lib/tracker/postings/` (new rule file), `ReasonChips` data from `feedback_events`.
- [ ] **Postings saved/applied before this shipped have no `description`** (only `new` ones are re-read). Re-reading saved ones would need `readDetails` to include them.
