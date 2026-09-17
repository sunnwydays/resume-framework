# CLAUDE.md

Agent-facing context for this codebase. Read this before making changes —
it covers the architecture and decisions that aren't obvious from the code
alone.

## What this is

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
 ├─ components/InputSection.tsx — resume text/PDF input, triggers the parse
 │   └─ POST /api/ats-parse       (server-side Affinda call)
 └─ components/AtsResult.tsx     — renders the parsed result (raw JSON +
                                    formatted breakdown)
```

`app/page.tsx` just holds the `resumeText` / `resumePdf` / `atsResult`
state and renders these two components. There's no pipeline orchestrator at
this stage — `InputSection` calls `/api/ats-parse` directly.

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

## Review + grade (`lib/atsReview.ts`, `lib/atsGrade.ts`)

- **`lib/atsReview.ts`** — pure rule functions (`reviewPerson`,
  `reviewContact`, `reviewEducation`, `reviewWorkExperiences`,
  `reviewProjects`, `reviewAchievements`, `reviewRawText`, `reviewMeta`)
  that inspect the parsed data and return `AtsIssue`s tagged
  `critical | minor | info`, keyed by section/field/entry. `AtsResult.tsx`
  calls these at render time and shows the issues inline next to each
  field.
- **`lib/atsGrade.ts`** — turns those issues into a score: 100 minus
  `SEVERITY_PENALTY` per issue (critical 10, minor 3, info 1), every
  occurrence counts, **not floored** (negative scores are intentional).
  `GRADE_BANDS` maps the score to a label/tone. `flattenSectionReview` /
  `flattenEntriesReview` adapt the review shapes; `gradeSections` produces
  the total plus a per-section breakdown. To change the weights or bands,
  edit those two constants — nothing else hardcodes them.

## Components

- **`components/InputSection.tsx`** — text/PDF radio toggle, textarea or
  file upload, "Run ATS parse" button (posts `FormData` to
  `/api/ats-parse`), and a dev-only "Load ats sample" button that loads
  `lib/mocks/affindaSample.json` without hitting the API.
- **`components/AtsResult.tsx`** — renders a `ScoreCard` (grade from
  `lib/atsGrade.ts`, not affected by the "Hide errors" toggle), then a
  formatted breakdown by section (contact/personal, education, work
  experience, projects, skills as hoverable pills, achievements) with
  inline issues, a generic fallback renderer for anything not explicitly
  laid out, and the raw JSON dump at the bottom.

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
