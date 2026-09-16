# Archived: 3-agent review pipeline (Reviser / Sentiment / Recruiter)

Removed 2026-09-16 to simplify the app down to Stage 1 (ATS parsing:
`InputSection` + `AtsResult`). This is not a live feature description —
it's a recreation guide. The code itself is gone from the working tree;
recover it from git history (`git log --all --full-history -- lib/pipeline.ts`
before this removal commit) if you want the literal implementation back
instead of rebuilding from this description.

## What it was

A client-driven loop (`lib/pipeline.ts` `runPipeline`, an async generator)
that iterated a resume through three Claude agent calls per round until a
recruiter agent approved it or `maxIterations` was hit:

1. **Keyword extraction** (once, only if a JD was supplied) — 10-15 JD
   keywords + required skills + a role summary.
2. **Gap analysis** (once) — classified the candidate's material into
   present-and-strong / present-but-undersold / missing-entirely /
   present-but-irrelevant, plus a strategic brief for the Reviser.
3. **Reviser** — rewrote the full resume as JSON (`name`, `contact`,
   `summary`, `sections[]` of `{title, items[]}`). Prompt included: JD
   keywords, gap brief, its own previous version + a diff summary of what it
   changed last time, the recruiter's structured critique from the prior
   iteration, and an **aggressiveness directive** keyed to iteration number
   (iteration 1 = free restructuring, later iterations = surgical edits
   only to flagged items). This existed because `temperature`/sampling
   params 400 on current Claude models, so "cool down over iterations" had
   to be prompt-injected.
4. **Sentiment Checker** — scored tone/vibe match against a target vibe
   (industry preset or user-typed `vibePrompt`) and slider settings. If
   `tone_ok: false`, the Reviser reran once with the issues + suggested
   replacements folded in.
5. **Style rules** (`lib/styleRules.ts`, deterministic, code-enforced) —
   regex-based em-dash → comma/colon rewriting, semicolon → period
   splitting, and bullet-length truncation (appends `[TRIMMED]`). Backstop
   behind prompt-injected style directives since the model didn't always
   comply; every fix logged as a `StyleFix` for an audit trail in the UI.
6. **Recruiter** — returned a structured critique, not freeform notes:
   overall 0-10 scores (`jd_alignment`, `clarity`, `impact`,
   `ats_keywords`), per-section scores with indexed weak items, missing
   keywords, weak bullets, structural issues, critical flags (dealbreakers).
   **Approval was enforced in code, not the model's self-reported
   `approved` field** — `runPipeline` overwrote it with
   `all four scores >= 7 && critical_flags.length === 0`.

`diffResumes`/`diffSummaryText` (`lib/diff.ts`) produced a section/bullet
-level diff between iterations (added/removed/changed), used both for the
"changes from previous version" UI and as the "what you changed last
iteration" text fed back into the next Reviser call.

Every agent call went through `callAgent()` → `POST /api/agent`
(`app/api/agent/route.ts`), a dumb proxy to `messages.create` with
`output_config.format: json_schema` so every response was schema-validated
JSON (schemas in `lib/schemas.ts`: `RESUME_SCHEMA`, `KEYWORD_SCHEMA`,
`GAP_SCHEMA`, `SENTIMENT_SCHEMA`, `RECRUITER_SCHEMA`). It retried once with
an explicit schema-reminder suffix on a JSON `SyntaxError` only. The
Anthropic key arrived per-request via an `x-anthropic-key` header, sourced
client-side from `localStorage` (`lib/storage.ts`, `Settings.apiKey`) —
never persisted server-side.

## Prompt assembly (`lib/prompts.ts`)

- `PRESETS` (industry dropdown: software/product/design/finance/consulting/
  general) set the recruiter's scoring lens (`recruiterLens`) and a default
  vibe seed, overridden by `settings.vibePrompt` if the user typed one
  (`effectiveVibe()`).
- Four sliders (0..1 floats, 0.5 = neutral), mapped to concrete prompt
  directives via `sliderDirectives()`: descriptive↔focused (bullet length),
  honesty (3-tiered: <0.34 literal, 0.34-0.66 exaggerated with `[assumed]`
  tags, ≥0.67 fabrication unlocked with `[fabricated]` tags —
  `fabricationUnlocked(settings)` checked the top tier), formal↔
  conversational, safe↔bold word choice.
- Style toggles (no em-dashes, no semicolons, max bullet length, a free-text
  custom rule) injected as "mandatory" directives via
  `styleRuleDirectives()`, doubled by the code-enforced `styleRules.ts` pass.
- `settings.userSystemPrompt`, if set, replaced the default Reviser/
  Sentiment base system prompt entirely. It deliberately never touched the
  Recruiter prompt — the recruiter gate was not user-configurable, by
  product spec.

## UI components

- **`components/ApprovalBar.tsx`** — shown once a final status (`approved`
  or `max_iterations_reached`) was reached. Buttons: export `.txt`
  (ATS-safe plain text, strips `[assumed]/[fabricated]/[TRIMMED]` markers),
  export PDF, "revise with feedback" (reveals a textarea, re-runs the
  pipeline from the current state with the typed feedback as
  `userFeedback`), and "section-by-section review".
- **`components/IterationLog.tsx`** — collapsible per-iteration cards:
  JD keywords, gap analysis, recruiter scoreboard (embeds `Scoreboard`),
  critical flags, missing keywords, weak bullets, sentiment/tone result,
  style fixes applied, and the diff from the previous version. Showed a
  spinner + current phase label while running.
- **`components/Scoreboard.tsx`** — four horizontal score bars (JD
  alignment/clarity/impact/ATS keywords) 0-10 with a color ramp
  (red/amber/emerald) and a marker line at the 7/10 approval threshold,
  plus a row of per-section scores.
- **`components/SectionReview.tsx`** — post-approval manual editing flow:
  steps through Summary + each section one at a time in a textarea: on
  "Next", if the user edited that step's text, it ran a scoped Sentiment
  check (`checkSectionTone` in `lib/pipeline.ts`) on just that section
  before advancing, surfacing tone issues + suggested replacements (user
  could accept and move on anyway, or re-edit).
- **`components/ResumePreview.tsx`** — serif-styled visual resume render
  (name/contact/summary/sections), with a `Flagged` inline renderer that
  either strips `[assumed]/[fabricated]/[TRIMMED]` markers or highlights
  them as small colored badges depending on a `showFlags` toggle. Used
  `forwardRef` so `lib/export.ts`'s `downloadPdf` could hand its DOM node to
  `html2pdf.js`.

## Export (`lib/export.ts`)

- `stripFlags()` — regex-strips the three annotation markers, used by both
  export paths.
- `resumeToPlainText()` / `downloadText()` — builds an ATS-safe plain-text
  `.txt` from the `ResumeJson`.
- `downloadPdf(element)` — dynamically imports `html2pdf.js` and renders a
  given DOM node (the `ResumePreview` ref) to a letter-size PDF. The caller
  (`app/page.tsx`) hid flag markers and waited a 50ms `setTimeout` before
  capturing, to let React re-render without them first.

## Also removed alongside this (dead even before this cleanup)

- **`lib/pdfExtract.ts`** — `extractPdfText(file: File): Promise<string>`,
  client-side PDF-to-text via `pdfjs-dist`, walking each page's text items
  and reconstructing line breaks from Y-coordinate jumps. Was already
  unreferenced — the PDF upload path sent the raw `File` to `/api/ats-parse`
  instead of converting it to text first.
- **`app/api/fetch-jd/route.ts`** — `POST` route that server-side-fetched a
  job-posting URL (to dodge browser CORS) and regex-stripped it to plain
  text, returning a 422 with a "paste instead" message if the extracted
  text was under 200 chars (JS-rendered page heuristic). Was already
  unreferenced — no JD-URL input existed in the UI at the time of removal.

## `Settings` fields this pipeline used (also removed from `lib/types.ts`)

`model`, `preset`, `vibePrompt`, `userSystemPrompt`, `descriptiveFocused`,
`honesty`, `formalConversational`, `safeBold`, `noEmDashes`, `noSemicolons`,
`maxBulletLength`, `customRule`, `maxIterations`, and `apiKey` (the
client-supplied Anthropic key). Also removed: `PresetKey`, `MODELS`,
`ResumeJson`, `ResumeSection`, `KeywordExtraction`, `GapAnalysis`,
`SentimentResult`, `WeakItem`, `SectionScore`, `RecruiterResult`,
`StyleFix`, `DiffEntry`, `IterationRecord`, `PipelineEvent`, and
`lib/storage.ts` (localStorage persistence for `Settings`, now unused since
there's nothing left in `Settings` to persist).

## Recreating this later

Structural skeleton is intact in this doc — schemas, prompt shapes, the
approval-threshold logic, and the component responsibilities. The one
design decision worth re-confirming before rebuilding rather than assuming
it still holds: whether the API key should go back to the client-supplied
`x-anthropic-key` header, or move server-side (see the project's
`server-side-secrets-ok` note/memory — the ATS-parse route already uses a
server-side `AFFINDA_API_KEY` env var, so consistency argues for
`ANTHROPIC_API_KEY` as a server env var too if this pipeline comes back).
