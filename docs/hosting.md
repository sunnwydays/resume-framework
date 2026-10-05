# Hosting the job tracker

The tracker runs on the same Vercel project as the resume app
(`resume-framework`, production deploys from `main`). The code side is in
`CLAUDE.md` ("Job tracker"); this is the part that lives in dashboards.

## Vercel environment variables (Production; Preview too if you use previews)

| Var | Value from | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | Public by design. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local` | Public by design; RLS is the guard. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `.env.local` | Public by design. |
| `NEXT_PUBLIC_GMAIL_IGNORE_DOMAINS` | `.env.local` | Ends up in the public JS bundle (accepted). |
| `ANTHROPIC_API_KEY` | Anthropic console | Mark it **Sensitive**. |
| `TRACKER_ALLOWED_EMAILS` | your sign-in email | New. Server-only, comma-separated. Unset = nobody can use the tracker in production. |
| `AFFINDA_API_KEY` | (already set) | Resume parser. |

Do **not** add `SUPABASE_DB_URL` (a direct database password, used only by
`npm run test:db`) or `GOOGLE_CLIENT_SECRET` (unused: the token flow needs
no secret). `VOYAGE_API_KEY` is on Vercel but nothing reads it, so it can be
deleted.

`NEXT_PUBLIC_*` values are inlined at build time: add them **before** the
deploy that ships the tracker, or redeploy afterwards.

## Supabase (project `job-tracker`)

- **Authentication → Sign In / Providers:** turn **"Allow new users to sign
  up" off**. The existing account keeps working.
- **Authentication → URL Configuration:** Site URL
  `https://resume-framework.vercel.app`; Redirect URLs add
  `https://resume-framework.vercel.app/tracker/auth/confirm` and keep
  `http://localhost:3000/tracker/auth/confirm`.
- The built-in email sender only mails project team members and is heavily
  rate-limited, which is fine for one user. Open the magic link in the same
  browser that requested it (the PKCE exchange needs a cookie set there).

## Google Cloud (the Gmail OAuth client)

- Credentials → the OAuth web client → **Authorized JavaScript origins**: add
  `https://resume-framework.vercel.app`. No redirect URI is needed.
- Keep the consent screen in **Testing** with your Gmail as a test user.
  `gmail.readonly` is a restricted scope; publishing would need Google's
  verification.

## Anthropic console

Set a monthly spend limit on the workspace or key used in production (the
draft route's rate limit is in memory, so it isn't a real cap). Optionally
use a separate key just for Vercel.

## Vercel project

Keep **Vercel Authentication** on for preview deployments: previews serve
the tracker too.

## Checks after a deploy

- The resume page's "Job tracker" link goes to `/tracker`, then the login
  page; the tracker's "← Resume Framework" link goes back.
- Sign in with the allowlisted email: the link arrives, you land on
  `/tracker`, and your data shows. Sign out in the nav works on every
  tracker page.
- Request a link for a different email: the form still says "check your
  email", no mail is sent, and `select count(*) from auth.users` is
  unchanged.
- `curl -X POST https://resume-framework.vercel.app/api/tracker/draft`
  returns 401; `/api/dev-mocks` returns 404.
- `curl -I https://resume-framework.vercel.app/tracker/login` shows
  `X-Frame-Options`, `frame-ancestors` and `X-Robots-Tag`.
- **Scan Gmail** opens Google's popup (confirms the origin was added).
- **Draft with Claude** works; a link lookup on a Greenhouse URL works and
  `http://127.0.0.1` is refused.
- Supabase security advisor: nothing new.
