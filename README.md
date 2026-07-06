# Resume Review Agent

A multi-agent resume review tool. You paste a resume and a job description,
tune a few sliders, and three AI agents — a **Reviser**, a **Sentiment
Checker**, and a **Recruiter** — iterate on your resume until it passes a
scored recruiter review (or you hit the iteration cap). You then approve,
revise with feedback, or step through it section by section, and export as
plain text (ATS-safe) or a styled PDF.

## Running it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

You'll need an [Anthropic API key](https://console.anthropic.com/settings/keys).
Paste it into the "Anthropic API key" field in the left config panel — it's
stored only in your browser's `localStorage` and is sent only to the
Anthropic API (via this app's own server-side proxy route). Nothing is
persisted server-side.

## Using it

1. **Paste your resume** (or upload a PDF) and the **job description** (paste
   text, or paste a posting URL and click Fetch).
2. Optionally add **additional experience details** not on the resume —
   projects, metrics, context the Reviser can draw on instead of guessing.
3. Tune the config panel:
   - **Model** — Opus 4.8 (best), Sonnet 5 (fast/smart), or Haiku 4.5 (cheap)
   - **Industry preset** — sets the recruiter's scoring lens and a default vibe
   - **Sliders** — Detail (descriptive ↔ focused), Honesty (true-to-life ↔
     fabricated — see below), Voice (formal ↔ conversational), Risk (safe ↔
     bold)
   - **Style toggles** — no em-dashes, no semicolons, max bullet length,
     custom rule
   - **Max iterations** (1–5)
   - **Custom system prompt** (advanced, collapsible) — replaces the default
     Reviser/Sentiment instructions; recruiter scoring logic and your slider
     settings still apply on top
4. Click **Run review pipeline** and watch the iteration log: JD keywords
   extracted, gap analysis, then each iteration's scores, tone check, style
   fixes, and diff from the previous version.
5. When it finishes (recruiter-approved or max iterations reached), **Export**
   as `.txt` or PDF, **Revise with feedback** (re-runs the loop with your
   notes), or **Section-by-section review** (edit one section at a time, each
   edit gets its own tone check).

### About the Honesty slider

- **Low (true-to-life):** framing stays literal; nothing is inferred beyond
  what's in your material.
- **Middle (exaggerated):** the Reviser can strengthen framing and infer
  reasonable scale/context — every such stretch is tagged `[assumed]`.
- **High (fabricated):** the Reviser may invent plausible supporting details
  outright — every invention is tagged `[fabricated]`. Employers, titles, and
  dates stay real.

Flags are highlighted in the preview so you can review them before exporting;
exports strip all flags automatically.

## Tech stack

Next.js (App Router) + TypeScript + Tailwind CSS, calling the Anthropic API
via `@anthropic-ai/sdk` from a server-side route handler.

For architecture details and where to look when extending this app, see
[`CLAUDE.md`](./CLAUDE.md).
