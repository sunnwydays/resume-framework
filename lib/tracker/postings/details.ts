// What a Jobright posting page says that the alert email doesn't: the start
// line ("Start in 2027 Winter"), the sentence naming the length ("16-week
// internship program") and the seniority ("New Grad", with the employment
// type), and Jobright's own flags for "U.S. Citizen Only" and clearance. The
// alert's title often has none of them. The page is fetched
// server-side (no CORS); only what term.ts and level.ts can read is kept, as
// text, so tuning their rules applies to postings already read. The page's
// summary fields are also kept as `description`, so feedback on a posting
// (why it was dismissed) has the text the decision was made on.

import { lengthFromText, postingTerm } from "@/lib/tracker/postings/term";

export interface PostingDetails {
  startText: string | null;
  lengthText: string | null;
  levelText: string | null; // "New Grad, Mid Level · Full-time"
  // Jobright's own flags (the "U.S. Citizen Only" tag). A page that doesn't
  // carry the flag reads as false, so it counts as read.
  citizenOnly: boolean;
  clearanceRequired: boolean;
  // Jobright's summary, responsibilities, qualifications, skills and benefits,
  // as plain text. It has no full job description, only these.
  description: string | null;
}

const MAX_DESCRIPTION = 20_000;

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

function listOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v : v && typeof v === "object" ? (v as { skill?: unknown }).skill : null))
    .flatMap((v) => (typeof v === "string" && v.trim() ? [v.trim()] : []));
}

// The page's descriptive fields as labelled plain text, or null when it has none.
export function describeJob(job: object): string | null {
  const j = job as Record<string, unknown>;
  const qualifications = (j.qualifications ?? {}) as { mustHave?: unknown; preferredHave?: unknown };
  const sections: [string, string[]][] = [
    ["Summary", listOf([j.jobSummary])],
    ["Responsibilities", [...listOf([j.jdResponsibilitySummary]), ...listOf(j.coreResponsibilities)]],
    ["Must have", listOf(qualifications.mustHave)],
    ["Preferred", listOf(qualifications.preferredHave)],
    ["Skills", listOf(j.skillSummaries)],
    ["Core skills", listOf(j.jdCoreSkills)],
    ["Education", listOf(j.educationSummaries)],
    ["Benefits", listOf(j.benefitsSummaries)],
  ];
  const body = sections
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => `${label}\n${items.map((i) => `- ${i}`).join("\n")}`)
    .join("\n\n");
  return body ? body.slice(0, MAX_DESCRIPTION) : null;
}

// Null when the page isn't a posting (a bot wall, a login page, changed markup),
// so the caller can try again later instead of recording "nothing stated".
export function parseJobrightPage(html: string): PostingDetails | null {
  const match = NEXT_DATA.exec(html);
  if (!match) return null;
  let job: unknown;
  try {
    job = JSON.parse(match[1])?.props?.pageProps?.dataSource?.jobResult;
  } catch {
    return null;
  }
  if (!job || typeof job !== "object") return null;

  const start = (job as { internHireDate?: unknown }).internHireDate;
  const startText = typeof start === "string" && postingTerm("", { startText: start }) ? start.trim() : null;

  let lengthText: string | null = null;
  for (const text of strings(job)) {
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (lengthFromText(sentence)) {
        lengthText = sentence.trim().slice(0, 300);
        break;
      }
    }
    if (lengthText) break;
  }

  const { jobSeniority, employmentType } = job as { jobSeniority?: unknown; employmentType?: unknown };
  const levelText = [text(jobSeniority), text(employmentType)].filter(Boolean).join(" · ").slice(0, 100) || null;
  const { isCitizenOnly, isClearanceRequired } = job as { isCitizenOnly?: unknown; isClearanceRequired?: unknown };
  return { startText, lengthText, levelText, citizenOnly: isCitizenOnly === true, clearanceRequired: isClearanceRequired === true, description: describeJob(job) };
}

const JOBRIGHT_JOB = /^https:\/\/jobright\.ai\/jobs\/info\/[0-9a-f]{24}\/?$/i;

// Only Jobright posting pages are fetched: the route makes outbound requests
// on the caller's behalf, so it must not take any URL.
export function isJobrightJobUrl(url: string): boolean {
  return JOBRIGHT_JOB.test(url);
}

export async function fetchPostingDetails(url: string, fetchImpl: typeof fetch = fetch): Promise<PostingDetails | null> {
  if (!isJobrightJobUrl(url)) return null;
  try {
    const res = await fetchImpl(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; job-tracker)", accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? parseJobrightPage(await res.text()) : null;
  } catch {
    return null;
  }
}
