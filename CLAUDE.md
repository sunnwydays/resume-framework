# CLAUDE.md

Agent-facing context for this codebase. Read this before making changes —
it covers the architecture and decisions that aren't obvious from the code
alone.

## What this is

(Also hosts a separate, local-only job tracker at `/tracker`. See "Job
tracker" below. Everything else in this file is about the resume app.)

A Next.js app, currently at **Stage 1 of a planned multi-stage redesign**:
an ATS resume parser. The user pastes resume text or uploads a PDF, the app
sends it server-side to Affinda's resume-parsing API, and displays both the
raw JSON and a formatted breakdown of what was extracted. See
`README.md` for user-facing usage.

The app previously had a client-driven 3-agent review pipeline (Reviser /
Sentiment Checker / Recruiter, calling the Anthropic API) layered on top of
this. That pipeline and all its supporting UI/lib code were removed
2026-09-16 to simplify the app down to just Stage 1. It is fully documented
for recreation in `docs/archived-review-pipeline.md` — read that before
rebuilding anything resembling it, rather than re-deriving the design from
scratch. The literal code is recoverable from git history if needed
(`git log --all --full-history -- lib/pipeline.ts`, pre-removal commit).

## Planned stages (design decisions live in project memory, not here)

1. **ATS Parser** (this stage) — parse + display, transparency-first, with
   a planned quality gate before proceeding (not built yet — currently just
   parses and displays, no gate).
2. **Crafting Bench** — AI suggests edits (doesn't auto-apply), modular
   content blocks, banked content.
3. **Fine Revision** — a narrow JD-keyword pass after Stage 2 (not yet
   designed in detail).

## Request flow

```
Browser (app/page.tsx)
 ├─ components/SectionNav.tsx    — sticky jump-to-section nav (rail on lg+,
 │                                  strip below), badges from the report
 ├─ components/InputSection.tsx — resume text/PDF input, triggers the parse
 │   └─ POST /api/ats-parse       (server-side Affinda call)
 └─ components/AtsResult.tsx     — renders the parsed result (raw JSON +
                                    formatted breakdown)
```

`app/page.tsx` holds the `resumeText` / `resumePdf` / `atsResult` state,
derives `report = buildAtsReport(atsResult)` once (`lib/atsReport.ts`), and
passes it to both `SectionNav` and `AtsResult` so the nav badges and the
breakdown read the same numbers. There's no pipeline orchestrator at this
stage — `InputSection` calls `/api/ats-parse` directly.

## `app/api/ats-parse/route.ts`

Accepts multipart form data (`file` or `text`), forwards it to
`https://resume-parser.us1.affinda.com/v1/resumes/parse` with
`AFFINDA_API_KEY` (server-side env var — never sent to the browser), and
returns Affinda's JSON response as-is (or `{error}` on failure). No
normalization/reshaping happens here; `AtsResult.tsx` renders whatever
shape comes back, falling back to a generic recursive renderer
(`GenericValue`/`OtherFields`) for any field it doesn't have a dedicated
layout for — this is deliberate so unexpected Affinda fields still show up
instead of silently vanishing.

## Types (`lib/types.ts`)

`Ats*` types describe the Affinda response shape, typed strictly only for
the fields `AtsResult.tsx` actually reads (contact, person, education,
workExperience, projects, skills, achievements, rawText); everything else
is `[key: string]: unknown` and falls through to the generic renderer.
`AtsParseResponse = AtsParseResult | { error: string }`.

## Review + grade (`lib/atsReview.ts`, `lib/atsGrade.ts`, `lib/atsReport.ts`)

- **`lib/atsReview.ts`** — pure rule functions (`reviewPerson`,
  `reviewContact`, `reviewEducation`, `reviewWorkExperiences`,
  `reviewProjects`, `reviewAchievements`, `reviewRawText`, `reviewMeta`)
  that inspect the parsed data and return `AtsIssue`s tagged
  `critical | minor | info`, keyed by section/field/entry. `AtsResult.tsx`
  shows the issues inline next to each field.
- **`lib/atsReport.ts`** — `buildAtsReport(result)` runs every review rule
  and `gradeSections` once and returns everything in one `AtsReport`
  object; `page.tsx` calls it and hands the report down. Also owns
  `sectionId(label)`, the anchor-id convention (`section-work-experience`)
  shared by `<Section id>`, the score card's "By section" links, and
  `SectionNav`. The section label list in `buildAtsReport` is the one
  place that fixes section order.
- **`lib/atsGrade.ts`** — turns those issues into a score: 100 minus
  `SEVERITY_PENALTY` per issue (critical 10, minor 3, info 0: info is a note,
  not a deduction), every
  occurrence counts, **not floored** (negative scores are intentional).
  `GRADE_BANDS` maps the score to a label/tone. `flattenSectionReview` /
  `flattenEntriesReview` adapt the review shapes; `gradeSections` produces
  the total plus a per-section breakdown. To change the weights or bands,
  edit those two constants — nothing else hardcodes them.

## Components

- **`components/WhyThisExists.tsx`** — static "Why this exists" block in
  the page header: a row of sourced ATS-filtering stat cards, then a
  "What we learned digging into this" section with deeper, less-repeated
  findings (the 7.4s figure is the *first skim* not total attention span;
  ATS is a searchable database, not an auto-reject gate; headers/footers/
  tables get silently dropped or scrambled; application volume, not bots,
  explains most of the "vanished into a void" feeling). Keep every claim
  linked to its source, and don't add the unsourced "75% auto-rejected"
  myth back as a fact — it's called out explicitly as debunked.
- **`components/InputSection.tsx`** — text/PDF radio toggle, textarea or
  file upload, "Run ATS parse" button (posts `FormData` to
  `/api/ats-parse`), and a dev-only "Load ats sample" button that loads
  `lib/mocks/affindaSample.json` without hitting the API.
- **`components/AtsResult.tsx`** — renders a `ScoreCard` (grade from
  `lib/atsGrade.ts`, not affected by the "Hide errors" toggle), then a
  formatted breakdown by section (contact/personal, education, work
  experience, projects, skills as hoverable pills, achievements) with
  inline issues, a generic fallback renderer for anything not explicitly
  laid out, and the raw JSON dump at the bottom. Takes the `report` from
  `page.tsx` rather than computing it. Exports `TONE_STYLES` (grade colors)
  and `SCROLL_MARGIN` (so anchor targets clear the mobile nav strip).
- **`components/SectionNav.tsx`** — one item per section (`Upload`, `Score`,
  then the graded sections, `Skills`, `Raw output`). Sticky left rail on
  `lg+` (grid placement is passed in via `railClassName`), sticky
  horizontally-scrolling strip below `lg`. Before a parse only `Upload` is a
  live link. After a parse: score number tinted by band, entry counts for
  list sections, and a red/amber dot for sections with critical/minor
  issues. Scroll-spy is a rAF-throttled scroll listener, not
  IntersectionObserver, so the last item can become active at page bottom.
  Three gotchas already hit: don't wrap the component in a `div` in
  `page.tsx` (sticky can't stick past its parent); the rail's grid
  placement must start at `row-start-1` with `row-span-2` (spanning the
  header's row too), not `row-start-2` — otherwise its sticky containing
  block only begins at the content row, so it doesn't appear/stick until
  you've scrolled down to Upload instead of being visible from page load;
  and don't `scrollIntoView` the active pill (Chrome scrolls the page to a
  sticky child's static position) — it sets `scrollLeft` by hand.

## Known constraints / don't re-litigate these

- **API key handling**: `AFFINDA_API_KEY` is a server-side env var
  (`.env.local`, gitignored) — not user-supplied, not client-side. This is
  the current policy for new integrations generally (server secrets are
  fine), a deliberate reversal of an earlier "never persist a key
  server-side" stance from when the app had a client-supplied Anthropic
  key.
- **`lib/mocks/affindaSample.json`** — a canned Affinda response used only
  by the dev "Load ats sample" button in `InputSection.tsx`, not otherwise
  wired into anything.
- If you're about to add back tone/style/scoring logic, fabrication
  sliders, PDF export, or an iteration loop, check
  `docs/archived-review-pipeline.md` first — that design already exists and
  was deliberately scoped out, not abandoned.

## Job tracker (`/tracker`, separate track)

A personal job-application tracker that lives in this app but is **not
part of the resume-framework stages**. Single user (Sunny), local-only for
now: `proxy.ts` returns 404 for `/tracker/*` and `/api/tracker/*` when
`NODE_ENV === "production"`, and otherwise refreshes the Supabase session
and redirects signed-out requests to `/tracker/login` (401 for the API).
The proxy matcher only covers tracker paths; the resume pages never hit it.

- **Backend**: Supabase project `job-tracker` (ref `zcsfiovwomnkdhnfkoqk`,
  ca-central-1), email magic-link auth, `NEXT_PUBLIC_SUPABASE_URL` +
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. The page talks
  to Supabase directly from the browser (`lib/supabase/client.ts`); RLS
  (`user_id = auth.uid()`) on every table is the access control. Clients
  are created lazily (`supabase()` in `lib/tracker/useTracker.ts`) so the
  build doesn't need the env vars.
- **Schema**: `applications`, `assessments` (OAs / video interviews /
  interviews: one table, `kind` column, any number per application, plus
  `difficulty` 1–5, `outcome` waiting/passed/failed, `score`, `prep_notes`,
  `reflection`), `assessment_questions` (per assessment, `source`
  expected/asked, with an answer), `status_changes` (history), `time_log`
  (time spent per day), and for the Arbitrage page `moves` and
  `message_templates` (below).
  Status, kind, outcome and question-source values are check constraints
  mirrored by `STATUSES` / `ASSESSMENT_KINDS` / `OUTCOMES` /
  `QUESTION_SOURCES` in `lib/tracker/format.ts` (and the move channel /
  stage / waiting-on values by `MOVE_CHANNELS` / `MOVE_STAGES` /
  `WAITING_ON`); change both together.
  `lib/tracker/database.types.ts` is generated; regenerate after schema
  changes.
- **Timestamps are database triggers**, not app code: changing
  `applications.status` sets `status_changed_at` and logs a
  `status_changes` row (users have no insert policy on it); completing an
  assessment sets `completed_at`. Each change is tagged with an `origin`
  (`manual | import | email`), read from the `app.status_origin`
  transaction setting. The `import_rows(jsonb)` RPC sets it to `import`,
  so imports keep their given dates (or none) instead of "now". Both are
  user-editable afterwards: `status_changed_at` ("Rejected on" etc.) in
  `ApplicationDetail`, `completed_at` ("Submitted" for OAs) in
  `AssessmentForm`. Editing `status_changed_at` doesn't touch the matching
  `status_changes` row (no update policy), so the timeline reads the current
  status's date from the application row instead. A future
  Gmail integration should do the same with `email`, and should *suggest*
  status changes rather than apply them.
- **Time spent** (`components/tracker/TimeTracker.tsx`,
  `lib/tracker/useTimeLog.ts`): a stopwatch plus +1m/+5m/+15m buttons and
  a manual "Set…" for today's total. Stored in `time_log` (one row per user
  per local day), written only through the `add_time` / `set_time` RPCs
  (atomic upsert, floored at 0). The running stopwatch's start time lives
  in localStorage, not the database, so it survives reloads; a stretch is
  only written when stopped, all to the day it's stopped on.
- **Assessments tab** (`components/tracker/AssessmentsTable.tsx`): every
  OA / interview across applications, sortable, with a mouse-only hover
  preview card (fixed-position, rendered outside the table) and click to
  expand. The expanded panel is `AssessmentDetail.tsx`, the same one each
  application row shows for its rounds; it uses a container query because
  it's narrower there. Its long text fields save on blur. `AssessmentForm`
  edits only the core facts (no notes field, so it can't overwrite notes
  edited in the panel). Both tables sort via `components/tracker/sorting.tsx` (the header
  button and hook) over the pure `lib/tracker/sorting.ts` (`sortRows`, the
  per-column sort values, `nextStep`).
  Its default sort is "Do first" (`lib/tracker/priority.ts`): tiered, not a
  score. Dated pending ones by deadline (important counts a day earlier),
  then undated, then ones overdue >72h; ties go to the shorter, then easier.
  Completed ones and ones whose application is rejected/withdrawn are
  unranked. Ranks are computed over the rows on screen.
- **Role types** (`lib/tracker/roles.ts`): derived from `applications.role`
  every time, never stored (no DB column). One type per role, first match
  wins in `ROLE_TYPES` order, so specific types (robotics, ML, infra…) sit
  above the general SWE catch-all. The patterns are tuned to how roles are
  actually typed ("swe", "sde", "swd", "front end", "be", "mle", "robo");
  to fix a misfile, edit them and re-run the classifier over a list of real
  roles. Shown as a sortable Type column and used by filters and stats.
- **Filters** (`lib/tracker/filters.ts`, `components/tracker/FilterBar.tsx`):
  search and role type are shared by both tabs and decide what the stats
  describe; status, hide rejected, applied-within, has-steps, no-reply,
  outcome, important and overdue only narrow the table. Stats ignore those on
  purpose: hiding rejected rows would inflate every success rate.
- **Stats** (`lib/tracker/stats.ts`, `components/tracker/stats/`): pure
  functions feeding a collapsible panel per tab (open state in
  localStorage). Hand-rolled charts, no chart library; colors are the
  `--viz-*` tokens in `globals.css`. "How far they got" uses the furthest
  stage reached (status, status history, assessment kinds), so a rejected
  row still counts for the OA it got. Imported rows often lack status dates,
  so every timing fact uses only dated rows and says "from n of N".
- **Link lookup** (`lib/tracker/extract.ts`, `POST /api/tracker/extract`):
  deterministic, no AI by design. Order: ATS APIs from the URL (Greenhouse,
  Lever, Ashby, Workday `cxs` JSON), then JSON-LD `JobPosting`, then
  og:title/`<title>` parsing, then a company guess from the domain. It
  never errors on a miss; it returns `missing` fields, which the add form
  highlights and focuses. Known misses: IBM careers (bot wall), LinkedIn
  (usually), and Ashby boards embedded via JS (e.g. Superhuman). The
  looked-up role is tidied client-side by `lib/tracker/trimRole.ts` (trim
  term, trim intern, shorten title; three checkboxes under the Role field,
  all on by default); the server still returns the raw title.
- **Export** (`lib/tracker/export.ts`): XLSX is written with ExcelJS (the
  community SheetJS build can't write styles); CSV is still plain SheetJS
  rows. Each sheet has a summary block (title, stat tiles, a fixed set of
  facts over *all* rows, ignoring the on-screen filters) above an Excel
  table with colored status/outcome cells, real date cells, clickable
  links, and wrapped notes. Every stat is a live formula over the tables
  (structured refs, `_xlfn.AGGREGATE` for median/min) built as an `Expr`
  alongside the same calculation in JS, which becomes the cached result
  (Protected View doesn't recalculate). Formulas can only see the sheet, so
  there's no status history: these follow current status + listed
  assessments (matched by company + role) and can differ slightly from the
  app's stats panel. The table is padded to at least 300 rows so typed-in
  rows are inside it and get counted. The header
  row is therefore not row 1, which re-import tolerates (header must stay
  within the first 15 rows; nothing in the summary may look like a Company
  column). Dates are written as local wall-clock Excel dates to round-trip
  through `parseDate`/`parseDateTime`. The template shares the layouts, adds
  header hover notes (the field hints) and dropdowns for enum columns.
- **Import** (`lib/tracker/io.ts`): SheetJS (installed from the
  cdn.sheetjs.com tarball, not npm's stale `xlsx`), dynamically imported.
  The header row is the first with a company-like column plus one other
  known column, so title and totals rows above it are skipped. Columns are
  matched against `APP_FIELDS` / `ASSESSMENT_FIELDS` (suggested label plus
  aliases; these also drive the import dialog's column guide and the
  template download): exact alias, then whole-word keyword, then one typo
  ("Roll", "Compnay"), best score first. Unmatched columns are appended to
  notes as "Header: value" rather than dropped, and the preview shows how
  each column was read. The import dialog has a "check the columns" step
  before the row preview: every column gets a "Goes to" menu (a field, or
  Notes), each sheet a "Read as" menu (applications / assessments / skip),
  and "Continue" freezes the plan. Choices are `ImportOverrides`
  (per sheet name: `kind`, and column index → field key or null) passed to
  `buildImportPlan`; picking a field another column holds swaps the two, and
  changing a sheet's kind drops its column overrides. A sheet with no
  recognized header can still be read by choosing a type (its first row
  becomes the headers). Questions are one per line, "question → answer".
  Slashed dates are day-first, or month-first when the "month" is over 12;
  an impossible date reads as none, since one bad value would make Postgres
  reject the whole `import_rows` call. A blank or unreadable Applied date
  becomes today (local calendar, with a warning in the preview). CSV text is
  decoded in `readSheets` (UTF-8, falling back to Windows-1252) and read with
  `raw: true`, because SheetJS otherwise garbles accents and guesses dates
  (month-first, and shifted by the UTC offset). Assessment durations accept
  "90", "1h 30m", "1:30" (`parseMinutes`). Assessments attach to
  applications by company + role, then company alone, then a 5+ digit job
  ID shared with a posting URL. Anything ambiguous is left for the user to
  pick in the preview with `ApplicationPicker.tsx`, a searchable popover
  (not a `<select>`) that lists `suggestApplications()` results first
  (company closeness: same name, prefix, contains, one typo; matching role
  ranks higher) and then every application; unmatched rows also get
  one-click suggestion chips. Export headers are valid import aliases, so
  round-trips dedupe. A red "Clear all…" button next to Export (for
  repeated import testing) deletes every application via
  `deleteAllApplications`; assessments, questions and history go with them
  by cascade. `ClearAllDialog.tsx` makes it three steps (continue, tick an
  acknowledgement, type "delete all").
- **Arbitrage page (`/tracker/arbitrage`)**: the "spend little time, get
  outsized return" side of the job search (DMs, founder emails, warm intros,
  proof-of-work projects, events) instead of cold applying. A top nav
  (`components/tracker/TrackerNav.tsx`, in `app/tracker/layout.tsx`) links it
  with the main tracker. The unit is a **move** (`moves` table): a channel,
  who/what, minutes spent, the furthest **stage** reached (sent → replied →
  conversation → positive → interview → offer; closing keeps the stage),
  `waiting_on` (whose turn), follow-ups, and an optional link to an
  application (**ON DELETE SET NULL**, the one FK that doesn't cascade).
  `linkedin`/`email`/`warm`/`other` are outreach (they count in the reply
  funnel and get follow-up nudges); `project`/`community` are effort.
  - The `moves_before_write` trigger stamps `updated_at`, bumps
    `last_touch_at` on a stage / waiting_on / follow_ups change (not on notes
    or time), and sets `replied_at` the first time the stage leaves `sent`.
    Time is added with the atomic `add_move_minutes` RPC.
  - Pure logic, all unit-tested: `lib/tracker/arbitrage.ts` (the funnel,
    reward per hour by channel vs a cold-apply baseline at a flat
    minutes-per-application, per-template reply rates, this week),
    `lib/tracker/nextSteps.ts` (rule-based to-dos, thresholds as constants at
    the top: replies waiting on you, follow-ups after 3 days up to 2, nudges
    after 7, referral asks, weak templates, weekly target, a project every 14
    days, rebalancing), `lib/tracker/templates.ts` (built-in templates with
    `{name} {company} {about} {hook} {ask}` blanks), and
    `lib/tracker/draftPrompt.ts`. A linked application lifts a move's stage
    (`effectiveStage`: OA → positive, interview → interview, offer → offer)
    and leaves the cold baseline.
  - **Next steps are rules, not AI, on purpose.** The one AI piece is the
    workshop's "Draft with Claude" (`POST /api/tracker/draft`,
    `ANTHROPIC_API_KEY`, `claude-opus-5-5` at low effort with server-side
    fallback, rate-limited per user). It only fills an editable box; nothing
    is ever sent. Saved templates are `message_templates` rows; built-ins
    live in code with `builtin:` keys.
  - Per-viewer settings (minutes per application, weekly target, "about
    you") are in localStorage via `lib/tracker/useLocalSetting.ts`.
  - The Playbook panel's numbers are sourced (Ashby, Huntr, Pin); keep every
    claim linked, same rule as `WhyThisExists`.
- **Gmail scan (in progress; the database and review UI are not built
  yet)** (`lib/tracker/email/`). Finds what Sunny applied to, rejections and
  OA/interview invites in their inbox, and will *suggest* tracker updates
  (never auto-applied; status changes go through the trigger with origin
  `email`). No AI: keyword and template rules only. The browser gets a
  short-lived read-only Google token (Google Identity Services,
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; held in memory, nothing stored or
  scheduled) and reads Gmail directly (`gmail.ts`). Pipeline, all pure
  except `gmail.ts`: `parse.ts` (Gmail message -> `EmailFacts`: headers, text,
  links with anchor text; `expandDigest` splits Workday's multi-notification
  digests) -> `classify.ts` (`RULES` holds *every* phrase, sender list and
  the Gmail search terms, so tuning is one place; the body decides, since
  rejections often open with "Thank you for your application"; returns a
  kind or an ignore reason) -> `fields.ts` (company, role, job id, link,
  deadline or completion time; sender-specific templates first, then generic
  ones, then sender-domain guesses, and each value records its origin) ->
  `group.ts` (`matchApplications`: job id in a posting URL, then company, then
  role; `groupIntoJobs`: one `JobGroup` per job with forward-only status
  steps, assessment actions and missing-date fills; recomputed on every
  render, so accepting one job makes the next match the new row).
  `match.ts` holds the fuzzy company/role matching shared with the import.
  Gotchas learned from the real inbox: one company sends many roles (a
  thread is not a job; match on role and job id); "may not be able to reach
  out to every applicant" is a confirmation, not a rejection; LinkedIn's
  plain text is empty but its tracking URLs name the mail type; some
  employers' links are tracking redirects, so assessment links are chosen by
  anchor text. Personal sender domains to ignore (e.g. Sunny's school) live in
  `NEXT_PUBLIC_GMAIL_IGNORE_DOMAINS` in `.env.local`, not in `RULES`.
  **Tune the rules with the dev inspector at `/tracker/gmail-debug`**
  (404 in production): a dry-run scan that shows every fetched email with
  what the rules read from it, and "Copy as test fixture" for each mislabel.
  Fixtures in `tests/unit/email-*.test.ts` use made-up companies in the shape
  of real emails; never commit real names, addresses, requisition numbers or
  message text, and keep comment examples fictional too (the repo is public).

## Testing

Vitest 3 (4+ needs a newer Node than the 20.15 here) plus fast-check for
property tests. Config is `vitest.config.mts`; tests live in `tests/`.

- **`npm test`** — unit tests, no network, a few seconds. **Run it after any
  change under `lib/` or to a component's logic.** Every file runs in
  `America/Toronto` (DST), and the date-heavy ones (`DATE_SENSITIVE` in the
  config) run again in `Pacific/Auckland`, where the local day differs from
  the UTC day for half of every day, so a local-vs-UTC bug fails one of them.
- **`npm run test:db`** — against the live Supabase project, ~35 s. **Run it
  after any migration, and before touching the status triggers or
  `import_rows` (e.g. for the Gmail work).** Needs `SUPABASE_DB_URL` (the
  Session pooler string) in `.env.local`; without it, or if it can't connect,
  the db tests skip with a warning instead of failing, so check for that
  warning before trusting a green run.
- `npm run test:watch`, `npm run test:coverage` (unit tests only).

What's covered: every pure module under `lib/tracker/` (formats, roles,
role trimming, do-first priority, filters, sorting, stats, import/export,
link lookup against a fake `fetch`, arbitrage, next steps, templates, the
draft prompt), `lib/ats*` and `lib/rateLimit.ts`;
the import and export round trip through real XLSX/CSV bytes; and, in the
database, RLS on every table, the status/completion triggers, `import_rows`
(fed by the app's real plan builder), the time-log functions, the moves
trigger and `add_move_minutes`, and a schema contract (the check constraints
must equal `STATUSES` / `ASSESSMENT_KINDS` / `OUTCOMES` / `QUESTION_SOURCES` /
`EXTRACT_SOURCES` / `MOVE_CHANNELS` / `MOVE_STAGES` / `WAITING_ON`, and
`database.types.ts` must have the same columns and nullability as the
database).

Rules of the road:

- A bug fix comes with a test that fails without it. `it.todo(...)` lines
  are known gaps left on purpose; don't delete them, fix and convert them.
- Logic worth testing goes in a pure `lib/` module, not a `"use client"`
  component or hook (that's why `lib/tracker/sorting.ts` exists and
  `components/tracker/sorting.tsx` only has the React parts).
- `tests/unit/ats-grade.test.ts` pins how the four sample resumes grade. If
  a rule or weight changes on purpose, update those numbers; if they move
  unexpectedly, a rule changed behavior.
- Fixtures (`tests/helpers/fixtures.ts`) are typed against the database
  rows, so a schema change fails to compile in the tests until updated.
- DB tests can't change real data: each test is one transaction that is
  always rolled back, with its own throwaway users (acting as them via the
  `authenticated` role + JWT claims, so RLS applies as in the app), and the
  helper refuses any SQL containing `commit`. Keep every query scoped to the
  test's own users. `tests/db/harness.test.ts` tests the harness itself.
- Where code and data disagree about dates: the importer validates every
  date, number and enum before building the payload, because one bad value
  makes Postgres reject the whole `import_rows` call (`all or nothing` tests
  pin this).

## Extending this

- **Stage 1 gate / heuristic parser / overlay**: not built yet. See project
  memory (`redesign-stage1-ats-parser`, `redesign-stage1-kickoff-prompt`)
  for the reference-parser set (Affinda + a second engine API + an in-house
  heuristic), the "pass" definition (structural completeness across
  references, not exact match), and what's already been decided vs. still
  open.
- **New Affinda field to surface explicitly**: add it to the relevant `Ats*`
  interface in `lib/types.ts` and a dedicated `Field`/`Section` in
  `AtsResult.tsx` — anything not added still appears via the generic
  fallback, so this is a display upgrade, not a correctness fix.
- **New API integration**: use a server-side env var for its key
  (`process.env.*`, never a client header) per the current API-key policy.
