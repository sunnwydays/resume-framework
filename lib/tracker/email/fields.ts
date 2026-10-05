// Pulls company, role, job id, assessment link and deadline out of an email.
// Same philosophy as lib/tracker/extract.ts: deterministic templates, in
// priority order, and every value remembers which template found it so the
// inspector (and the review card) can say "from Greenhouse subject".

import { RULES } from "@/lib/tracker/email/classify";
import { companyCloseness } from "@/lib/tracker/email/match";
import type { EmailKind } from "@/lib/tracker/format";
import type { EmailFacts } from "@/lib/tracker/email/parse";

export type FieldName = "company" | "role" | "jobId" | "link" | "dueAt" | "completedAt";

export interface EmailFields {
  company: string | null;
  role: string | null;
  jobId: string | null;
  link: string | null;
  dueAt: string | null;
  completedAt: string | null;
  // "Globex Frontend Challenge Assessment": CodeSignal names the test, not the company.
  assessmentTitle: string | null;
  origins: Partial<Record<FieldName, string>>;
}

// ---------------------------------------------------------------------------
// Dates and deadlines

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_MDY = new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d\\d))?\\b`, "i");
const DATE_DMY = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\.?(?:,?\\s+(20\\d\\d))?\\b`, "i");
const DATE_ISO = /\b(20\d\d)-(\d\d)-(\d\d)\b/;
const TIME = /\b(\d{1,2})(?::(\d\d))?\s*([ap])\.?m\.?(?![a-z])|\b([01]?\d|2[0-3]):([0-5]\d)\b/gi;
const TZ = /\b(P[SD]T|PT|E[SD]T|ET|C[SD]T|CT|M[SD]T|MT|UTC|GMT)\b/;

const TZ_FIXED: Record<string, number> = {
  UTC: 0, GMT: 0, EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420,
};
const TZ_STANDARD: Record<string, number> = { PT: -480, ET: -300, CT: -360, MT: -420 };

// US daylight saving: second Sunday of March to first Sunday of November.
function usDst(year: number, month: number, day: number): boolean {
  const sunday = (m: number, nth: number) => {
    const first = 1 + ((7 - new Date(Date.UTC(year, m, 1)).getUTCDay()) % 7);
    return first + 7 * (nth - 1);
  };
  if (month > 2 && month < 10) return true;
  if (month === 2) return day >= sunday(2, 2);
  if (month === 10) return day < sunday(10, 1);
  return false;
}

function tzOffsetMinutes(tz: string, y: number, m: number, d: number): number {
  if (tz in TZ_FIXED) return TZ_FIXED[tz];
  return TZ_STANDARD[tz] + (usDst(y, m, d) ? 60 : 0);
}

interface Found {
  y: number;
  m: number;
  d: number;
  index: number;
  end: number;
}

function findDate(slice: string, ref: Date): Found | null {
  const iso = DATE_ISO.exec(slice);
  if (iso) return { y: +iso[1], m: +iso[2] - 1, d: +iso[3], index: iso.index, end: iso.index + iso[0].length };
  const hit = [
    ((r) => (r ? { r, month: r[1], day: r[2], year: r[3] } : null))(DATE_MDY.exec(slice)),
    ((r) => (r ? { r, month: r[2], day: r[1], year: r[3] } : null))(DATE_DMY.exec(slice)),
  ]
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.r.index - b.r.index)[0];
  if (!hit) return null;
  const month = MONTHS[hit.month.toLowerCase()];
  let year = hit.year ? +hit.year : ref.getUTCFullYear();
  // "by October 9" with no year: the next such date after the email arrived.
  if (!hit.year && new Date(Date.UTC(year, month, +hit.day)).getTime() < ref.getTime() - 180 * 86_400_000) year++;
  return { y: year, m: month, d: +hit.day, index: hit.r.index, end: hit.r.index + hit.r[0].length };
}

// Date plus the time and zone written near it. No time means end of that day.
export function findDateTime(slice: string, ref: Date): string | null {
  const date = findDate(slice, ref);
  if (!date) return null;
  const times = [...slice.matchAll(TIME)].map((t) => {
    let h: number;
    let min: number;
    if (t[3]) {
      h = (+t[1] % 12) + (t[3].toLowerCase() === "p" ? 12 : 0);
      min = t[2] ? +t[2] : 0;
    } else {
      h = +t[4];
      min = +t[5];
    }
    const at = t.index ?? 0;
    return { h, min, gap: at < date.index ? date.index - (at + t[0].length) : at - date.end };
  });
  const near = times.filter((t) => t.gap >= -2 && t.gap <= 30).sort((a, b) => a.gap - b.gap)[0];
  const [h, min] = near ? [near.h, near.min] : [23, 59];
  const tz = TZ.exec(slice)?.[1];
  const when = tz
    ? new Date(Date.UTC(date.y, date.m, date.d, h, min) - tzOffsetMinutes(tz, date.y, date.m, date.d) * 60_000)
    : new Date(date.y, date.m, date.d, h, min);
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

const DEADLINE_WORDS =
  /(?:end\s+login\s+date\/time|deadline(?:\s+is)?|complete\w*[^.]{0,80}?\bby|\bby|\bbefore|\buntil|due(?:\s+(?:on|by))?|expires?(?:\s+on)?|no\s+later\s+than)\s*:?\s*/gi;

// An interview invite carries the time it is scheduled for, not a deadline.
const SCHEDULE_WORDS = /(?:scheduled\s+(?:for|on)|will\s+(?:be\s+)?(?:held\s+)?on|date(?:\s*(?:and|&)\s*time)?:|\bon)\s*:?\s*/gi;

export function findDeadline(text: string, receivedAt: string, interview = false): { at: string; origin: string } | null {
  const ref = new Date(receivedAt);
  for (const word of text.matchAll(interview ? SCHEDULE_WORDS : DEADLINE_WORDS)) {
    const start = (word.index ?? 0) + word[0].length;
    const at = findDateTime(text.slice(start, start + 70), ref);
    if (at) return { at, origin: `deadline: "${word[0].trim().slice(0, 30)}"` };
  }
  // "within 14 calendar days": counted from the day the email arrived.
  const within =
    /(?:after|in)\s+(\d+)\s+(?:calendar\s+|business\s+)?days[^.]{0,60}?expire/i.exec(text) ??
    /within\s+(\d+)\s+(?:calendar\s+|business\s+)?days/i.exec(text);
  if (within) {
    const days = +within[1];
    if (days > 0 && days <= 60) {
      return { at: new Date(ref.getTime() + days * 86_400_000).toISOString(), origin: `"${within[0].trim().slice(0, 40)}"` };
    }
  }
  return null;
}

// "completed the Globex Frontend Challenge Assessment on September 26th, 6:34 pm PDT"
export function findCompletion(text: string, receivedAt: string): string | null {
  const m = /completed\b[^.]{0,120}?\bon\s+/i.exec(text);
  if (!m) return null;
  const start = m.index + m[0].length;
  return findDateTime(text.slice(start, start + 60), new Date(receivedAt));
}

// ---------------------------------------------------------------------------
// Company, role, job id

const GENERIC_HOSTS = new Set([
  "mail", "email", "e", "no-reply", "noreply", "careers", "jobs", "talent", "recruiting", "hire", "hr", "notifications",
  "notify", "us", "ca", "eu", "www", "app", "ats", "reply", "em", "send", "info", "update", "updates",
]);

const titleCase = (s: string) => s.replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

// Words that make a phrase a job title (or "Application"), never a company.
const titleWords = /\b(?:intern|interns|internship|internships|co-?op|engineer|developer|analyst|position|role|opportunity|applications?)\b/i;

function tidyCompany(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/^your\s+/i, "")
    .replace(/\b(?:recruiting|recruitment|careers|talent acquisition|talent|hiring team|hiring|team|jobs|hr|here)\b\s*$/i, "")
    .replace(/^[\s"'*_-]+|[\s"'*_.,:;!-]+$/g, "")
    .trim();
  // Needs to start like a name (rules out captured sentence fragments), and a
  // job title is never the company: "interest in the Software Engineer Intern".
  return cleaned.length >= 2 &&
    cleaned.length <= 60 &&
    /^[A-Z0-9]/.test(cleaned) &&
    !titleWords.test(cleaned) &&
    !/[/|]/.test(cleaned)
    ? cleaned
    : null;
}

function tidyRole(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/^(?:the\s+)?(?:position|role)\s+(?:of\s+)?/i, "")
    .replace(/^\d{5,9}\s+/, "")
    .replace(/\((?:job\s+|req(?:uisition)?\s+)?(?:id|number|#)[^)]*\)/gi, "")
    .replace(/\b(?:R-?\d{5,}|REQ-?\d{4,}|CAND-\d+)\b/gi, "")
    .replace(/\s[-–]\s*\d{5,8}\s*$/g, "")
    .replace(/\s+-\s*$/g, "")
    .replace(/^[\s"'*_-]+|[\s"'*_.,:;!-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // A sentence fragment ("Initech and giving us the") is not a title. The
  // lowercase-only words stay case-sensitive so "(US)" survives.
  if (/\b(?:you|your|giving|thank|thanks|opportunity)\b/i.test(cleaned) || /\b(?:we|us|our)\b/.test(cleaned)) return null;
  if (/^(?:the|a|an|this|our)$/i.test(cleaned)) return null;
  // "apply for that requires an assessment", "applying for other positions in the future"
  if (/^(?:that|which|who|it|these|those|other|any|all|more|future)\b/i.test(cleaned)) return null;
  return cleaned.length >= 3 && cleaned.length <= 140 ? cleaned : null;
}

// A name that ends at the end of the sentence: "at Hooli.com. Your passion…"
const CO = String.raw`(\S[\w&'.\- ]{0,44}?(?:,? (?:LLC|Inc|Ltd|Corp)\.?)?)(?=\s*(?:[.!,;:]\s|[.!,;:]?$|\s+(?:where|for|and|as|is|has|was|team|using|via|through)\b))`;
// A role: not across a sentence break, and not starting with an article (so
// "applying for the role of X" can't capture just "the").
const RO = String.raw`((?!(?:the|our|an?|this|your|my)\s)(?:(?!\.\s|!\s).){3,120}?)`;
const WORD = String.raw`(?:position|role|opportunity|opening)`;

interface Candidate {
  field: "company" | "role" | "jobId";
  value: string | null;
  origin: string;
}

function companyFromAddress(address: string): { value: string; origin: string } | null {
  const [local, host = ""] = address.split("@");
  // Workday and iCIMS put the employer in the address: acme@myworkday.com, acme+autoreply@talent.icims.com
  if (/(?:^|\.)(?:myworkday\.com|icims\.com)$/.test(host)) {
    const tenant = local.split("+")[0];
    if (tenant.length >= 2) return { value: tenant.length <= 3 ? tenant.toUpperCase() : titleCase(tenant), origin: `${host.endsWith("icims.com") ? "iCIMS" : "Workday"} address (guess)` };
  }
  if ([...RULES.atsDomains, ...RULES.assessmentDomains].some((d) => host === d || host.endsWith(`.${d}`))) return null;
  const labels = host.split(".");
  let root = labels.length >= 3 && labels[labels.length - 1].length === 2 && ["co", "com", "org", "ac"].includes(labels[labels.length - 2])
    ? labels[labels.length - 3]
    : labels[labels.length - 2];
  // careers.acme.com -> acme; mail.globex.jobs -> globex
  if (!root || GENERIC_HOSTS.has(root)) return null;
  root = root.replace(/^(?:email|mail|careers|jobs)-?/, "");
  // xyz.com -> XYZ, ge.com -> GE; longer names read better title-cased.
  const name = root.length <= 3 ? root.toUpperCase() : titleCase(root);
  return root.length >= 2 ? { value: name, origin: "sender domain (guess)" } : null;
}

function candidates(f: EmailFacts): Candidate[] {
  const subject = f.subject.replace(/^\s*(?:re|fwd?):\s*/i, "").replace(/^[^\w[(]+/, "").trim();
  const flat = f.text.replace(/\s+/g, " ");
  const out: Candidate[] = [];
  const add = (field: Candidate["field"], value: string | null | undefined, origin: string) => {
    const tidy = field === "company" ? tidyCompany(value) : field === "role" ? tidyRole(value) : value?.trim() || null;
    if (tidy) out.push({ field, value: tidy, origin });
    // A role written "SW Developer Intern - 170003" carries its job id.
    const trailingId = field === "role" && value ? /\s[-–]\s*(\d{5,8})\s*$/.exec(value.trim()) : null;
    if (trailingId) out.push({ field: "jobId", value: trailingId[1], origin: `${origin} (trailing id)` });
    // …and "09999999 Software Engineering Intern" leads with it (Workday).
    const leadingId = field === "role" && value ? /^\s*(\d{5,9})\s+\S/.exec(value) : null;
    if (leadingId) out.push({ field: "jobId", value: leadingId[1], origin: `${origin} (leading id)` });
  };
  const sender = f.fromAddress;

  // ---- Subject templates (the most reliable: the sender wrote them for this) --
  let m: RegExpExecArray | null;
  if ((m = /^Your application (?:for|to) (.+?) at (.+?)$/i.exec(subject))) {
    add("role", m[1], "subject");
    add("company", m[2], "subject");
  }
  if ((m = /^Thank you for your application (?:for|to) (.+?) at (.+?)$/i.exec(subject))) {
    add("role", m[1], "subject");
    add("company", m[2], "subject");
  }
  // Example: "Thanks for applying to Software Engineer Intern (Req ID 300003) at Massive Dynamic!"
  if ((m = /^Thank(?:s| you) for applying to (.+?) at (.+?)!?$/i.exec(subject))) {
    add("role", m[1], "subject");
    add("company", m[2], "subject");
    const id = /\(req(?:uisition)?\s*(?:id|#)?:?\s*([\w-]+)\)/i.exec(m[1]);
    if (id) add("jobId", id[1], "subject");
  }
  // Workday: "You were not selected for <Role> at <Company>"
  if ((m = /^You were not selected for (.+?) at (.+?)$/i.exec(subject))) {
    add("role", m[1], "subject");
    add("company", m[2], "subject");
  }
  // Workday: "Your application to <Role> is in!"
  if ((m = /^Your application to (.+?) is in!?$/i.exec(subject))) add("role", m[1], "subject");
  // Workday: "<Company> Application Update for <Role> (Job ID: 055555 )"
  if ((m = /^(.+?) Application Update for (.+?)(?:\s*\(Job ID:?\s*([\w-]+)\s*\))?$/i.exec(subject))) {
    add("company", m[1], "subject");
    add("role", m[2], "subject");
    if (m[3]) add("jobId", m[3], "subject");
  }
  // Workday: "Status Update - R10000001 2027 Software Engineer Intern – Springfield IL"
  if ((m = /^Status Update\s*[-–]\s*(R-?\d+)\s+(.+)$/i.exec(subject))) {
    add("jobId", m[1], "subject");
    add("role", m[2], "subject");
  }
  // LinkedIn: "Your application to <Role> at <Company>" is covered above. Ashby/Greenhouse relays:
  // "Cyberdyne | HackerRank AI Instructions | Software Engineer Intern (AI / ML) - Spring 2027"
  if (/ashbyhq\.com$/.test(sender) && (m = /^(.+?) \| .+? \| (.+)$/.exec(subject))) {
    add("company", m[1], "Ashby subject");
    add("role", m[2], "Ashby subject");
  }
  if (/ashbyhq\.com$/.test(sender) && (m = /^(.+?) \| (?:Confirmation|Next steps|Update)/i.exec(subject))) {
    add("company", m[1], "Ashby subject");
  }
  // CodeSignal: "Globex invited you to take Globex Frontend Challenge Assessment on CodeSignal"
  if ((m = /^(.+?) invited you to take (.+?) on (?:CodeSignal|HackerRank)/i.exec(subject))) add("company", m[1], "assessment subject");
  // CodeSignal: "Reminder: Globex is waiting for your Globex Frontend Challenge Assessment result on CodeSignal"
  if ((m = /^Reminder:\s*(.+?) is waiting for your (.+?) result\b/i.exec(subject))) add("company", m[1], "assessment subject");
  // Company-first and verb-first company subjects. "Thank you for applying to
  // Technology Internship" names the job, not the employer.
  if ((m = /^Thank(?:s| you)(?: so much)? for applying (?:to|at|with) (.+?)!?$/i.exec(subject))) {
    add(titleWords.test(m[1]) ? "role" : "company", m[1], "subject");
  }
  // "Gringotts Application", "Hooli Application- Sam Lee"
  if ((m = /^(?!(?:Update|An update|Your|Status|New)\b)([A-Z][\w&.' ]{1,40}?) Application(?:\s*[-–].*)?$/.exec(subject))) {
    add("company", m[1], "subject");
  }
  if ((m = /^You(?:'|’)?re In!?\s*Thanks For Applying To (.+?)$/i.exec(subject))) add("company", m[1], "subject");
  if ((m = /^Thank you for your interest in ([^,]+?)(?:,\s*[A-Z][\w ]+)?!?$/i.exec(subject))) add("company", m[1], "subject");
  // "…for <Role>" is a title; "…to <Company>" is a name.
  if ((m = /^Thank you for your application for (.+?)!?$/i.exec(subject))) add("role", m[1], "subject");
  if ((m = /^Thank you for your application to (.+?)!?$/i.exec(subject))) add("company", m[1], "subject");
  // BigCo: "…for completion Sam W - 170003 - SW Developer Intern | Platform-as-a-Service"
  if ((m = /\s[-–]\s(\d{5,8})\s[-–]\s(.+)$/.exec(subject))) {
    add("jobId", m[1], "subject");
    add("role", m[2], "subject");
  }
  // BigCo: "You have successfully submitted your BigCo job application - Software Developer Intern 2027"
  if ((m = /\bjob application\s*[-–]\s*(.+)$/i.exec(subject))) add("role", m[1], "subject");
  // Indeed Apply: "Indeed Application: Robotics Intern"; the employer is the
  // label of the link to its Indeed company page (…/cmp/<name>).
  if ((m = /^Indeed Application:\s*(.+)$/i.exec(subject))) {
    add("role", m[1], "Indeed subject");
    const employer = f.links.find((l) => /indeed\.[a-z.]+\/cmp\//i.test(l.url) && l.label);
    if (employer) add("company", employer.label, "Indeed company link");
  }
  // VidCruiter: "Sam, you are moving forward to a Video Interview with Umbrella for the Summer 2027 Umbrella Software Engineering Intern position"
  if ((m = /\bwith ([A-Z][\w&'. -]{1,40}?) for the (.+?) (?:position|role)$/.exec(subject))) {
    add("company", m[1], "subject");
    add("role", m[2], "subject");
  }
  // HackerRank invite: the test name is the only role hint, "Your HackerRank [Spring 2027] AI/ML SWE Intern Coding Test Invitation"
  if (/hackerrank/.test(sender) && (m = /^Your HackerRank (.+?)\s+(?:Test\s+)?Invitation$/i.exec(subject))) {
    add("role", m[1], "HackerRank test name");
  }
  // HackerRank sends the employer's role title: "Software Engineer Intern (Core) at Cyberdyne"
  if (/hackerrank/.test(sender) && (m = /^(.+?) at (.+?)$/.exec(subject))) {
    add("role", m[1], "HackerRank subject");
    add("company", m[2], "HackerRank subject");
  }
  if ((m = /^(?:Update on|An update from) (?:your )?(.+?)(?: application)?$/i.exec(subject))) add("company", m[1], "subject");
  if ((m = /^(.+?) (?:Application Update|Internship Update|Application Status)\b/i.exec(subject))) add("company", m[1], "subject");
  if ((m = /\bApplication (?:Confirmation|received)\s*[-–]\s*(.+)$/i.exec(subject))) add("company", m[1], "subject");
  if ((m = /^(?:Application Confirmation|Application received)\b.*\bfor (.+?) position$/i.exec(subject))) add("role", m[1], "subject");
  if ((m = /^Your application for (.+?) has been received/i.exec(subject))) add("role", m[1], "subject");
  // Job id in a subject: "... - 170003 - SW Developer Intern ...", "... - Summer 2027 - 3000009 ."
  if ((m = /\s[-–]\s(\d{5,8})(?=\s*[-–.]|\s*$)/.exec(subject))) add("jobId", m[1], "subject");

  // ---- Body templates ------------------------------------------------------
  // BigCo states the job up front, "Ref: 170001 - Software Developer Intern 2027 Dear Sam W,";
  // read it before the generic sentences, which can latch onto boilerplate.
  if ((m = /\bRef:?\s*(\d{5,})\s*[-–]\s*(.+?)\s+Dear\b/.exec(flat))) {
    add("jobId", m[1], "body: Ref");
    add("role", m[2], "body: Ref - role");
  }
  // RippleMatch: "After reviewing your profile, Vandelay Industries would like
  // to move forward with next steps for the position: Import Analyst Intern."
  if ((m = /\b([A-Z][\w&'.-]*(?: [A-Z][\w&'.-]*){0,3}) would like to (?:move forward|proceed)\b[^.]{0,60}?\b(?:position|role):\s*(.+?)(?=\.\s|\.$|$)/.exec(flat))) {
    add("company", m[1], "body: … would like to move forward");
    add("role", m[2], "body: … would like to move forward");
  }
  const co = `(?:\\s+(?:here\\s+)?(?:at|with)\\s+${CO})?`;
  const roleThenWord = (lead: string, origin: string) => {
    const r = new RegExp(`${lead}${RO}\\s+${WORD}\\b${co}`, "i").exec(flat);
    if (!r) return;
    add("role", r[1], origin);
    if (r[2]) add("company", r[2], origin);
  };
  roleThenWord(String.raw`\bapplication\s+(?:to|for)\s+(?:the\s+|our\s+)?`, "body: application for the … position");
  roleThenWord(String.raw`\b(?:apply|applying|applied)\s+(?:for|to)\s+(?:the\s+|our\s+)?`, "body: applying for the … position");
  roleThenWord(String.raw`\binterest\s+in\s+(?:the\s+|our\s+)?`, "body: interest in the … role");
  if ((m = new RegExp(String.raw`\b(?:position|role)\s+of\s+(?:the\s+)?${RO}(?=\s+(?:at|with|in)\s+[A-Z]|\.\s|\.$|\s+has\s|$)(?:\s+(?:at|with)\s+${CO})?`, "i").exec(flat))) {
    add("role", m[1], "body: role of …");
    if (m[2]) add("company", m[2], "body: role of …");
  }
  if ((m = new RegExp(String.raw`\b(?:received|submitted)\s+(?:your\s+)?application\s+for\s+(?:the\s+|our\s+)?${RO}(?=\s+has\s+been\s+received|,\s+and\b|,\s+we\b|\.\s|\.$|!|$)`, "i").exec(flat))) {
    add("role", m[1], "body: received your application for …");
  }
  // "apply for Engineering Internship at Hooli.com." ("for", not "to": "applying to X" names the company)
  if ((m = new RegExp(String.raw`\b(?:apply|applying|applied)\s+for\s+(?:the\s+|our\s+)?${RO}(?:\s+(?:at|with)\s+${CO})?(?=[.!]\s|[.!]$|$)`, "i").exec(flat))) {
    add("role", m[1], "body: applying for …");
    if (m[2]) add("company", m[2], "body: applying for …");
  }
  // "your application for Software Development Engineer Internships at this time."
  if ((m = new RegExp(String.raw`\byour\s+application\s+for\s+(?:the\s+|our\s+)?${RO}(?=\s+at\s+this\s+time|\s+has\s+been\b|,|\.(?:\s|$)|!|$)`, "i").exec(flat))) {
    add("role", m[1], "body: your application for …");
  }
  // Oscorp: "…for the position Software Engineering Internship - Summer 2027 - 3000009 ."
  if ((m = new RegExp(String.raw`\bthe\s+(?:position|role)\s+(?!of\b)${RO}(?=\s+[-–]\s+\d{5,8}\b)`, "i").exec(flat))) {
    add("role", m[1], "body: the position …");
  }
  // Company from the body.
  for (const [pattern, origin] of [
    [new RegExp(String.raw`\bthank(?:s| you)(?: so much)? for (?:applying|your (?:continued )?interest|choosing)(?: to| in| at| with)(?: joining)?(?: the)?\s+${CO}`, "i"), "body: thanks for applying to …"],
    [new RegExp(String.raw`\binterest in (?:joining |working (?:at|for|with) )${CO}`, "i"), "body: interest in joining …"],
    [new RegExp(String.raw`\binvited by (?:someone|a recruiter|the team) (?:from|at) ([A-Z][\w&'.-]*(?: [A-Z][\w&'.-]*){0,3})(?= to\b|[.,!])`), "body: invited by … from"],
    [/\bSent from ([A-Z][\w&'.-]*(?: [A-Z][\w&'.-]*){0,3}) through (?:CodeSignal|HackerRank|Codility)\b/, "body: sent from … through"],
    [new RegExp(String.raw`\bapplication to ${CO}(?=\s*[.,!])`, "i"), "body: application to …"],
    [new RegExp(String.raw`\bcareers?\s+(?:with|at)\s+${CO}`, "i"), "body: career with …"],
    [new RegExp(String.raw`\b(?:HR|hiring|recruiting|talent)\s+team\s+at\s+${CO}`, "i"), "body: team at …"],
    [new RegExp(String.raw`\b(?:the|our) (?:\w+ ){0,3}(?:team|programs?|recruiting|recruitment|talent acquisition|hiring team) (?:at|of) ${CO}\s*$`, "i"), "body: signature"],
    [new RegExp(String.raw`\byour (?:recent )?application to (?:the )?(?:[^.]{0,80}?) (?:at|with) ${CO}`, "i"), "body: application … at"],
  ] as const) {
    const r = pattern.exec(flat);
    if (r) add("company", r[1], origin);
  }
  // Signature line: "…Early Talent Programs at Vandelay" – last 160 chars only.
  const tail = flat.slice(-200);
  if ((m = new RegExp(String.raw`(?:team|programs?|recruiting|recruitment|talent acquisition|hiring team)\s+at\s+${CO}\s*(?:$|\[)`, "i").exec(tail))) {
    add("company", m[1], "body: signature");
  }
  // "You have not been selected … at Wayne Enterprises" etc. handled via subject; "<Company> Talent Acquisition Team"
  if ((m = /([A-Z][\w&'.-]*(?: [A-Z][\w&'.-]*){0,3}) (?:Talent Acquisition|Recruiting|Campus Recruiting|Early Careers)(?: Team)?\b/.exec(flat.slice(-400)))) {
    add("company", m[1], "body: signature");
  }

  // ---- Job ids ---------------------------------------------------------------
  const ids: [RegExp, string][] = [
    [/\bRef:?\s*(\d{5,})\b/i, "body: Ref"],
    [/\((?:job\s+)?ID:?\s*([\w-]{5,})\)/i, "body: (ID)"],
    [/\bReq(?:uisition)?\b\s*(?:ID|#|number)?:?\s*([\w-]{4,})\b/i, "body: Req ID"],
    [/\bJob\s*(?:ID|number|#|no\.?):?\s*([\w-]{4,})\b/i, "body: Job ID"],
    [/\b(R-?\d{5,})\b/, "body: Workday id"],
    [/\bCAND-(\d+)\b/, "body: candidate id"],
  ];
  const idText = `${subject}\n${flat}`;
  for (const [pattern, origin] of ids) {
    const r = pattern.exec(idText);
    if (r) add("jobId", r[1], origin);
  }

  // ---- Fallbacks (least reliable last) ----------------------------------------
  // The display name minus department words: "Stark Workday Notifications" ->
  // "Stark", "Gringotts Inc. Careers" -> "Gringotts Inc.", "Early Career
  // Talent Support" -> nothing useful.
  const fromDomain = companyFromAddress(sender);
  const display = tidyCompany(
    f.fromName
      .replace(
        /\b(?:no[- ]?reply|do[- ]not[- ]reply|notifications?|workday|greenhouse|ashby|lever|icims|careers?|early careers?|recruiting|recruitment|talent(?: acquisition)?|hiring(?: team)?|team|hr|jobs|support|people|assessments?)\b/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim()
  );
  const host = sender.split("@")[1] ?? "";
  const isPlatform =
    (display && /linkedin|hackerrank|codesignal|indeed/i.test(display)) ||
    RULES.relayDomains.some((d) => host === d || host.endsWith(`.${d}`));
  // On a company's own domain the domain is the safer guess (a display name
  // there is often a recruiter or a department); use the display name only
  // when it agrees with the domain, for its nicer spelling ("Zephyr" over
  // "Flyzipline"). On an ATS or Workday address the display name is all there is.
  const domainIsOwn = fromDomain?.origin === "sender domain (guess)";
  const displayAgrees = display && fromDomain && companyCloseness(display, fromDomain.value) >= 60;
  if (display && !isPlatform && (!domainIsOwn || displayAgrees)) add("company", display, "sender name (guess)");
  if (fromDomain) add("company", fromDomain.value, fromDomain.origin);
  return out;
}

// ---------------------------------------------------------------------------

function assessmentTitleOf(f: EmailFacts): string | null {
  let m: RegExpExecArray | null;
  if ((m = /^Assessment completed:\s*(.+)$/i.exec(f.subject))) return m[1].trim();
  if ((m = /^(.+?) invited you to take (.+?) on /i.exec(f.subject))) return m[2].trim();
  if ((m = /^Reminder:\s*(.+?) is waiting for your (.+?) result\b/i.exec(f.subject))) return m[2].trim();
  if ((m = /Reminder:\s*(.+?) from (.+?) is still pending/i.exec(f.subject.replace(/\s+/g, " ")))) return m[1].trim();
  return null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function pickLink(f: EmailFacts): { url: string; origin: string } | null {
  const usable = f.links.filter(
    (l) => !/unsubscribe|privacy|preferences|mailto:|support\.|help\.|\/faq/i.test(l.url + " " + l.label)
  );
  const platform = usable.find((l) => RULES.assessmentDomains.some((d) => hostOf(l.url).endsWith(d)));
  if (platform) return { url: platform.url, origin: "assessment platform link" };
  // BigCo-style tracking redirects: the anchor text says what the link is.
  const labelled = usable.find((l) => /start|begin|take|access|launch|this url|assessment|test link|schedule|book/i.test(l.label));
  return labelled ? { url: labelled.url, origin: `link "${labelled.label.slice(0, 30)}"` } : null;
}

const DEADLINE_KINDS: EmailKind[] = ["oa_invite", "video_invite", "interview_invite", "reminder"];

export function extractFields(f: EmailFacts, kind: EmailKind | null = null): EmailFields {
  const cands = candidates(f);
  const pick = (field: Candidate["field"]) => cands.find((c) => c.field === field) ?? null;
  const company = pick("company");
  const role = pick("role");
  const jobId = pick("jobId");

  const link = pickLink(f);
  const flatAll = `${f.subject}\n${f.text}`.replace(/\s+/g, " ");
  const deadline =
    kind && DEADLINE_KINDS.includes(kind) ? findDeadline(flatAll, f.receivedAt, kind === "interview_invite") : null;
  const completed = kind === "assessment_done" ? findCompletion(flatAll, f.receivedAt) : null;

  return {
    company: company?.value ?? null,
    role: role?.value ?? null,
    jobId: jobId?.value ?? null,
    link: link?.url ?? null,
    dueAt: deadline?.at ?? null,
    completedAt: completed,
    assessmentTitle: assessmentTitleOf(f),
    origins: {
      ...(company && { company: company.origin }),
      ...(role && { role: role.origin }),
      ...(jobId && { jobId: jobId.origin }),
      ...(link && { link: link.origin }),
      ...(deadline && { dueAt: deadline.origin }),
      ...(completed && { completedAt: "completion time" }),
    },
  };
}
