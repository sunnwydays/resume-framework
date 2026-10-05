# Resume Framework

Stage 1 of a planned 3-stage tool: an ATS resume parser. Paste your resume
text or upload a PDF, and see exactly what a real resume-parsing engine
(Affinda) extracts from it: contact info, work experience, education,
skills, etc. Just like how an applicant tracking system would. Extracted
fields are reviewed and given a 0-100 parse
score, broken down by section, and tips provided.

## Screenshots

**Landing page**: why an ATS parser matters, with sourced stats

![Landing page with sourced ATS stats](./public/demo_screenshots/01-landing.png)

**Upload**: paste text or drop a PDF, or load one of the built-in sample
resumes

![Resume upload with sample resumes](./public/demo_screenshots/02-upload.png)

**Score**: a 0-100 parse score with a per-section and per-issue-type
breakdown:

![ATS parse score breakdown](./public/demo_screenshots/03-score.png)

**Inline issues**: flagged fields (missing data, mismatched emails,
low-confidence extractions) shown next to the parsed value itself:

![Personal info section with inline parse issues](./public/demo_screenshots/04-personal-info-issues.png)

## Planned stages

1. **ATS Parser**: parse + display, transparency-first.
2. **Crafting Bench**: The app holds your hand in editing your resume section-by-section, bullet-by-bullet. Need help? AI can help. Results in a database of content to swap in and out.
3. **Fine Revision**: a quick job description keyword substition after Stage 2 for every job you apply for.

The multi-agent review pipeline (Reviser/Sentiment Checker/Recruiter) that
used to live here has been removed to keep the app focused on parsing for
now. See
[`docs/archived-review-pipeline.md`](./docs/archived-review-pipeline.md) for
what it did and how to rebuild it.

## Running it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

You'll need an [Affinda API key](https://www.affinda.com/) set as
`AFFINDA_API_KEY` in `.env.local`. the parse request is made server-side
(`app/api/ats-parse/route.ts`).

## Using it

1. Choose **Text** or **PDF** and provide your resume, or click **Load
   sample** on one of the built-in sample resumes.
2. Click **Run ATS parse**. You'll get a 0-100 **ATS parse score** (with a
   by-section and by-issue-type breakdown), plus a formatted breakdown
   (contact/personal info, education, work experience, projects, skills,
   achievements) with issues flagged inline next to the field they apply
   to, and the raw parser JSON at the bottom.
3. The sticky section nav on the side jumps to each section and shows
   entry counts plus a dot for any section with flagged issues.
4. In dev, a **Dev mocks** panel lists any JSON files dropped into
   `lib/mocks` and loads one straight into the app without hitting the API.

## Job tracker

A separate, private tool at [`/tracker`](https://resume-framework.vercel.app/tracker)
(linked from the top of the resume page): job applications plus their OAs /
video interviews / interviews, with automatic status-change timestamps,
paste-a-link detail lookup, a Gmail scan that suggests updates from
rejections and invites, a Postings page that dedupes job-alert emails, an
"Arbitrage" page for DMs and warm intros, stats, and CSV/XLSX import/export.

It's single-user. Sign-in is a Supabase magic link, sign-ups are off, and
only emails on `TRACKER_ALLOWED_EMAILS` get in. The rest of the setup is in
[`docs/hosting.md`](./docs/hosting.md). Locally it needs
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in
`.env.local` (and `TRACKER_ALLOWED_EMAILS` is optional in dev).

### Tracker screenshots

**Applications**: one row per application, with status, role type, and the
OAs/interviews under each row:

![Applications table](./public/demo_screenshots/tracker/01-applications.png)

**Add by link**: paste a posting URL and the company, role and location fill
in:

![Add an application from a link](./public/demo_screenshots/tracker/02-add-from-link.png)

**Assessments**: every OA and interview, sorted "do first", with a hover
preview and an expandable panel for questions, prep and reflection:

![Assessments tab](./public/demo_screenshots/tracker/03-assessments.png)

**Stats**: how far applications got, reply rates, and timing:

![Stats panel](./public/demo_screenshots/tracker/04-stats.png)

**Gmail scan**: suggested updates from the inbox, with undo:

![Gmail scan review](./public/demo_screenshots/tracker/05-gmail-scan.png)

**Postings**: Jobright alert emails turned into one deduped row per job,
filterable by US / not US:

![Postings page](./public/demo_screenshots/tracker/06-postings.png)

**Arbitrage**: outreach moves, the reply funnel, and rule-based next steps:

![Arbitrage page](./public/demo_screenshots/tracker/07-arbitrage.png)

## Tech stack

Next.js (App Router) + TypeScript + Tailwind CSS. `app/api/ats-parse/route.ts`
proxies the resume to Affinda's resume-parser API server-side.

For architecture details and where to look when extending this app, see
[`CLAUDE.md`](./CLAUDE.md).
