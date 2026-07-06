# CLAUDE.md

Agent-facing context for this codebase. Read this before making changes —
it covers the architecture, the pipeline contract, and decisions that aren't
obvious from the code alone.

## What this is

A Next.js app that runs a 3-agent resume review loop against the Anthropic
API: **Reviser** (rewrites), **Sentiment Checker** (tone gate), **Recruiter**
(scored approval gate). The loop runs client-side; each agent call is one
request to `/api/agent`, which proxies to `messages.create` with structured
outputs (`output_config.format: json_schema`) so every agent response is
schema-validated JSON, not freeform text to parse.

Full plan/history: none checked in — this file + the code is the source of
truth. See `README.md` for user-facing usage.

## Request flow

```
Browser (app/page.tsx, React state machine)
 └─ lib/pipeline.ts: runPipeline() — async generator, yields PipelineEvent
     ├─ POST /api/agent      (per agent call: Reviser / Sentiment / Recruiter /
     │                         keyword-extraction / gap-analysis)
     └─ POST /api/fetch-jd   (server-side JD URL fetch, avoids browser CORS)
```

`runPipeline` is the only place that sequences agent calls. The API routes
are dumb proxies — `/api/agent` takes `{model, system, user, schema}` and
returns `{data}` or `{error}`; it does not know about the resume domain.

## Pipeline contract (`lib/pipeline.ts`)

Pre-processing (once per fresh run, skipped on a feedback re-run via
`resumeFrom`):
1. **Keyword extraction** — 10-15 JD keywords + required skills, fed into
   every later Reviser/Recruiter call so they don't re-derive them each
   iteration.
2. **Gap analysis** — compares resume+extra details to the JD:
   present-and-strong / undersold / missing / irrelevant, plus a strategic
   brief. This is the Reviser's brief, not a blank rewrite instruction.

Loop (`iteration` 1..`settings.maxIterations`):
1. **Reviser** writes the full resume JSON. Context includes: JD keywords,
   gap brief, its own previous resume + diff summary of what changed last
   time, the recruiter's structured critique from last iteration (see
   below), and an **aggressiveness directive** keyed to iteration number
   (iteration 1 = free restructuring, final iterations = surgical only —
   see `aggressivenessDirective` in `lib/prompts.ts`). This exists because
   `temperature`/sampling params are rejected outright on current Claude
   models, so "cool down over iterations" has to be prompt-injected instead.
2. **Sentiment Checker** scores tone/vibe match. If `tone_ok: false`, the
   Reviser reruns once with the sentiment issues + suggested replacements.
3. **Style rules** (`lib/styleRules.ts`) run as a deterministic
   post-processing pass — regex-based em-dash/semicolon rewriting and
   bullet truncation. This is the code-enforced backstop behind the
   prompt-injected style directives; every fix is logged as a `StyleFix` for
   the UI audit trail.
4. **Recruiter** returns a structured critique, not freeform notes:
   overall scores (jd_alignment/clarity/impact/ats_keywords), **per-section
   scores with indexed weak items**, missing keywords, weak bullets,
   structural issues, critical flags. See `RECRUITER_SCHEMA` in
   `lib/schemas.ts`. This structure is what lets the Reviser make surgical
   edits on iteration 2+ instead of re-guessing what to fix.
5. **Approval is enforced in code, not by the model's own `approved` field.**
   `runPipeline` overwrites `recruiter.approved` based on
   `all four scores >= 7 && critical_flags.length === 0`. Don't trust the
   model's self-reported `approved` — always recompute it.

`diffResumes` (`lib/diff.ts`) produces the section/bullet-level diff between
iterations, used both for the UI's "changes from previous version" and as
the "what you changed last iteration" text fed back to the Reviser.

## Prompt assembly (`lib/prompts.ts`)

- Four sliders (0..1 floats, 0.5 = neutral) map to concrete directives via
  `sliderDirectives()`. The **Honesty slider is 3-tiered, not 2**: <0.34
  literal, 0.34-0.66 exaggerated (stretches must be tagged `[assumed]`),
  >=0.67 fabrication unlocked (invented details must be tagged
  `[fabricated]`). `fabricationUnlocked(settings)` checks the top tier.
- Style toggles (em-dash/semicolon/max-length/custom rule) are injected as
  "mandatory" directives AND enforced again in code by `styleRules.ts` — two
  layers because the model doesn't always comply with prompt-only rules.
- `settings.userSystemPrompt`, if set, **replaces** the default
  Reviser/Sentiment base prompt. It does **not** touch the Recruiter prompt
  (`recruiterPrompt()` never reads `userSystemPrompt`) — the recruiter gate
  is intentionally not user-configurable, matching the original product
  spec's guardrail. Don't wire `userSystemPrompt` into `recruiterPrompt`.
- `PRESETS` (industry dropdown) set the recruiter's scoring lens
  (`recruiterLens`) and a default vibe seed, overridden by
  `settings.vibePrompt` if the user typed one (`effectiveVibe()`).

## Schemas (`lib/schemas.ts`)

Every agent has a matching JSON Schema used as `output_config.format`. If
you add a field to an agent's return shape, update the schema AND the
matching type in `lib/types.ts` — they're not derived from each other.
Schemas use `additionalProperties: false` + `required` throughout, which the
API requires for structured outputs.

## API routes

- `app/api/agent/route.ts` — reads the API key from the `x-anthropic-key`
  request header (never from env, never persisted server-side). Retries
  once with an explicit schema-reminder suffix if the model's JSON fails to
  parse (`SyntaxError` only — other errors propagate). Maps
  `Anthropic.APIError` subclasses to user-facing messages.
- `app/api/fetch-jd/route.ts` — server-side fetch + regex-based HTML-to-text
  (no DOM parser dependency). Returns a 422 with a "paste instead" message if
  extracted text is under 200 chars (catches JS-rendered job pages).

## Known constraints / don't re-litigate these

- **Model IDs**: `claude-opus-4-8` / `claude-sonnet-5` / `claude-haiku-4-5`
  (`lib/types.ts` MODELS). The original product spec named
  `claude-sonnet-4-6`/`claude-opus-4-6` — those are superseded; don't revert.
- **No `temperature`/`top_p`/`top_k`** on current-generation models — sending
  them 400s. Aggressiveness/creativity control is prompt-injected via
  `aggressivenessDirective`, not sampling params.
- **`max_tokens: 16000`, non-streaming** in `/api/agent` — fine for
  structured-output JSON responses of this size; if you raise it much past
  ~16k you'll need to switch to streaming per the Anthropic SDK's guidance.
- PDF export (`lib/export.ts` `downloadPdf`) temporarily hides flag markers
  (`showFlags`) before capturing the DOM node — there's a 50ms `setTimeout`
  to let React re-render first. If flags show up in exported PDFs, that
  timing race is the first place to look.
- `pdfjs-dist` is pinned to `4.10.38` (not latest) — v5+ requires Node 22,
  this project targets Node 20.

## Extending this

- **New agent step**: add its prompt builder to `lib/prompts.ts`, its schema
  to `lib/schemas.ts`, its type to `lib/types.ts`, and call it from
  `runPipeline` in `lib/pipeline.ts`, yielding a new `PipelineEvent` variant
  if the UI needs to show it.
- **New slider/toggle**: add to `Settings` in `lib/types.ts` +
  `DEFAULT_SETTINGS`, add UI in `components/ConfigPanel.tsx`, wire the
  directive into `sliderDirectives()`/`styleRuleDirectives()` in
  `lib/prompts.ts`, and if it needs code enforcement (like the toggles), add
  it to `lib/styleRules.ts`.
- **New export format**: `lib/export.ts` is the only place exports live;
  both current formats strip `[assumed]/[fabricated]/[TRIMMED]` via
  `stripFlags()` — reuse that for any new format.
