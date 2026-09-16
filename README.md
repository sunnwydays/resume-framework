# Resume Review Agent

Stage 1: an ATS resume parser. Paste your resume text or upload a PDF, and
see exactly what a real resume-parsing engine (Affinda) extracts from it —
contact info, work experience, education, skills, etc. — the same way an
applicant tracking system would.

This is the first stage of a larger planned tool; the multi-agent review
pipeline (Reviser/Sentiment Checker/Recruiter) that used to live here has
been removed to keep the app focused on parsing for now. See
[`docs/archived-review-pipeline.md`](./docs/archived-review-pipeline.md) for
what it did and how to rebuild it.

## Running it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

You'll need an [Affinda API key](https://www.affinda.com/) set as
`AFFINDA_API_KEY` in `.env.local` — the parse request is made server-side
(`app/api/ats-parse/route.ts`), so the key is never exposed to the browser.

## Using it

1. Choose **Text** or **PDF** and provide your resume.
2. Click **Run ATS parse**. The raw parser JSON and a formatted breakdown
   (contact/personal info, education, work experience, projects, skills,
   achievements, plus anything else the parser returned) are both shown.
3. **Load ats sample (dev)** loads a canned Affinda response
   (`lib/mocks/affindaSample.json`) without hitting the API, for UI work.

## Tech stack

Next.js (App Router) + TypeScript + Tailwind CSS. `app/api/ats-parse/route.ts`
proxies the resume to Affinda's resume-parser API server-side.

For architecture details and where to look when extending this app, see
[`CLAUDE.md`](./CLAUDE.md).
