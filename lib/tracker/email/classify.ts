// Decides what a job-search email is: a confirmation, a rejection, an
// assessment/interview invite, and so on. Keyword and template rules only
// (no AI), all in RULES below so tuning is one file. The body decides: plenty
// of rejections open with "Thank you for your application".

import type { EmailKind } from "@/lib/tracker/format";
import type { EmailFacts } from "@/lib/tracker/email/parse";

export type Classification = { kind: EmailKind; phrase: string } | { kind: null; reason: string };

// Straight apostrophes only: parse.ts normalizes curly ones before this runs.
const N = String.raw`(?:\bnot|n't)`;

export const RULES = {
  // Domains that only send job mail, so a mail from one skips the "does this
  // sound like a job email" check.
  atsDomains: [
    "greenhouse-mail.io", "greenhouse.io", "ashbyhq.com", "lever.co", "myworkday.com", "myworkdayjobs.com",
    "icims.com", "smartrecruiters.com", "jobvite.com", "taleo.net", "successfactors.com", "successfactors.eu",
    "bamboohr.com", "paylocity.com", "adp.com", "rippling.com", "workable.com", "breezy.hr", "recruitee.com",
    "teamtailor.com", "pinpointhq.com", "dayforce.com", "ultipro.com", "avature.net", "phenompeople.com",
    "eightfold.ai", "gem.com", "polymer.co", "ripplematch.com", "joinhandshake.com", "wellfound.com",
    "jobs.lever.co", "applytojob.com", "oraclecloud.com", "linkedin.com", "indeed.com", "hiringplatform.com",
  ],
  assessmentDomains: [
    "hackerrank.com", "hackerrankforwork.com", "codesignal.com", "codility.com", "hirevue.com", "testgorilla.com",
    "karat.com", "hackerearth.com", "coderpad.io", "codingame.com", "vervoe.com", "harver.com", "pymetrics.ai",
    "criteriacorp.com", "mettl.com", "shl.com", "vidcruiter.com",
  ],
  // Job platforms that write on behalf of many employers, often from a
  // recruiter's own name ("Pat Lee <pat@ripplematch.com>"): their display name
  // is never the company.
  relayDomains: ["ripplematch.com", "joinhandshake.com", "wellfound.com", "linkedin.com", "indeed.com"],
  personalDomains: [
    "gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "live.com", "protonmail.com", "me.com",
  ],
  // Senders that look job-ish to the text check but never are. Your own
  // (e.g. your school's) go in NEXT_PUBLIC_GMAIL_IGNORE_DOMAINS in .env.local,
  // comma-separated, so they stay out of the repo; .edu is always skipped.
  notJobDomains: ["instructure.com", "strava.com", "porkbun.com"],
  notJobAddresses: ["noreply-accounts@google.com"],
  // Events read like applications ("Thanks for applying to the Hackathon…
  // pending approval") but aren't jobs.
  eventDomains: ["luma-mail.com", "lu.ma", "luma.com", "eventbrite.com", "devpost.com", "mlh.io", "partiful.com", "meetup.com"],
  eventWords: /\b(?:hackathon|rsvp|webinar|meetup|info(?:rmation)? session|career fair|event page|pending approval for)\b/i,

  // What the "rules" Gmail query asks for, OR-ed together with the sender
  // domains above. Deliberately broad: classify() does the precision work.
  searchTerms: [
    '"your application"', '"thank you for applying"', '"thanks for applying"', '"application received"',
    '"received your application"', "unfortunately", '"moving forward"', '"other candidates"', '"not selected"',
    "assessment", '"coding challenge"', '"coding test"', "interview", '"next steps"', '"application status"',
    '"application update"', "from:jobs-noreply@linkedin.com",
  ],

  // Job-board alerts ("Vandelay just posted a 89% match … role"): new postings,
  // not your applications. Set aside here; Jobright's are read by the Postings
  // page (lib/tracker/postings/).
  // Whole domains for alert-only services; exact addresses where the same
  // service also confirms applications (indeedapply@indeed.com is a real one).
  jobAlertSenders: [
    "jobright.ai", "jobalerts-noreply@linkedin.com", "glassdoor.com", "alert@indeed.com", "jobalerts@indeed.com",
    "simplify.jobs", "builtin.com",
  ],
  jobAlertSubject: /\bjust posted\b|\bjob alerts?\b|\bnew jobs? (?:for you|matching|near)\b|\b\d{1,3}% match\b|\bjobs? you may be interested in\b/i,

  // Words that make an email about a job (checked on non-ATS senders).
  jobWords:
    /\b(applica(?:tion|nt|nts|ng)|appl(?:y|ied|ying)|candida(?:cy|te)|position|requisition|recruit(?:er|ers|ing|ment)|hiring|job|career|careers|internship|intern|co-op|assessments?|interviews?|roles?|openings?)\b/i,

  // "Started an application" mails: not an application yet.
  notYet: [
    /if you have completed the application/i,
    /(?:finish|complete|continue|resume) your application/i,
    /you (?:haven't|have not) (?:finished|completed|submitted)/i,
  ],

  rejection: [
    // "aren't moving forward", "will not be moving forward", "not proceeding further with your"
    new RegExp(`${N}\\s+(?:be\\s+)?(?:moving|going|proceeding|advancing|continuing)\\s+(?:forward|further|ahead|with your)`, "i"),
    // "decided not to move forward", "made the decision to not move forward"
    /(?:decided|decision|chosen)\s+(?:not\s+to|to\s+not)\s+(?:move|proceed|go|continue|advance|pursue|extend|offer|progress)/i,
    // "move forward with other candidates" (but not "with your application")
    /(?:move|moving|proceed|proceeding|go|going)\s+forward\s+with\s+(?:other|another|different|additional|alternative|more)\s+(?:candidates|applicants|applications|profiles)/i,
    /(?:pursue|pursuing|select(?:ed|ing)?|chosen|choose)\s+(?:other|another|different)\s+(?:candidates|applicants)/i,
    /unable\s+to\s+(?:proceed|move\s+forward|continue|advance|offer|consider\s+you|extend)/i,
    // "you were not selected", "you have not been selected", "was not successful"
    /(?:were|was|have|has|are|is)\s+not\s+(?:been\s+)?(?:selected|chosen|successful|shortlisted)/i,
    /regret\s+to\s+(?:inform|tell|let|advise|share)/i,
    new RegExp(`(?:isn't|is\\s+not|${N})\\s+(?:an?\\s+)?(?:ideal|good|strong|right|best|great)\\s+(?:fit|match)`, "i"),
    /after\s+(?:careful|thorough|much)\s+(?:consideration|review)[^.]{0,160}?\b(?:determined|decided|regret|unable)/i,
    /(?:position|role|opening|vacancy)\s+(?:has|have)\s+been\s+filled/i,
    /(?:will|we)\s+not\s+be\s+(?:offering|extending|able to offer)/i,
    // LinkedIn's plain text is empty, but the tracking URLs say what the mail is.
    /email_jobs_application_rejected/i,
  ],

  assessmentDone: [
    /\bassessment\s+(?:completed|complete|submitted|received)\b/i,
    /\b(?:test|challenge|exercise)\s+(?:completed|submitted)\b/i,
    /you(?:'ve| have)\s+(?:completed|submitted|finished)\s+(?:the\s+|your\s+)?[^.]{0,80}?(?:assessment|test|challenge|exercise)/i,
    // Only about a test: "Thank you for completing the first part of your
    // application" is the start of an invite, not a finished assessment.
    /thank you for completing\s+(?:the|your|our)\s+[^.]{0,50}?(?:assessment|test|challenge|exercise)/i,
  ],

  video: [
    /\bhirevue\b|\bvidcruiter\b/i,
    /\b(?:one-way|pre-recorded|recorded)\s+(?:video\s+)?interview/i,
    /\bvideo\s+interview\b/i,
    /record(?:ing)?\s+(?:your\s+)?(?:answers|responses|video)/i,
  ],

  oa: [
    /(?:invite|invited|invitation)[^.]{0,100}?(?:assessment|coding\s+(?:test|challenge|exercise)|online\s+test|hackerrank|codesignal|codility|challenge)/i,
    /(?:complete|take|start)\s+(?:the|our|this|your|an?)\s+[^.]{0,60}?(?:assessments?|coding\s+(?:test|challenge|exercise)|online\s+test)/i,
    /\b(?:coding|online|technical)\s+(?:assessment|test|challenge|exercise)\b/i,
    /assessments?\s+invitation/i,
    // "Your Initrode Assessments Expire in 24 hours" (a reminder, read as one below)
    /\bassessments?\s+(?:expire|expires|expiring|deadline|(?:is|are)\s+due)\b/i,
    /invitation\s+for\s+assessments?/i,
  ],

  interview: [
    /(?:schedule|book|set\s+up|arrange|select\s+a\s+time\s+for)\s+(?:an?\s+|your\s+|the\s+)?(?:\w+\s+){0,3}(?:interview|call|chat|conversation)/i,
    /invite\s+you\s+to\s+(?:an?\s+|a\s+)?(?:\w+\s+){0,2}interview/i,
    /would\s+like\s+to\s+(?:interview|meet\s+with|speak\s+with|chat\s+with|talk\s+to)\s+you/i,
    /interview\s+(?:invitation|invite|availability|scheduling|request)/i,
    /technical\s+screening\s+round/i,
  ],
  // A booking link is an invite; the tool's name in the text isn't ("mail
  // will come from @databricks.com or @goodtime.io (our meeting tool)" is a
  // confirmation's boilerplate). Checked against the links only (one per
  // line), and only a link with a path.
  schedulingLinks: [/^https?:\/\/(?:[\w-]+\.)*(?:calendly\.com|goodtime\.io)\/\S/im],

  // Sentences that describe the process rather than invite you ("Candidates
  // invited to complete an assessment will be notified by 10/7", "If selected,
  // you'll receive an invitation to interview"). Dropped before the invite
  // rules run, so a timeline or confirmation isn't read as an invite.
  hypothetical: [
    /(?:\bwill|'ll)\s+be\s+notified\b/i,
    /\b(?:invites|invitations)\s+will\s+be\s+sent\b/i,
    /\bcandidates\s+(?:who\s+are\s+)?(?:invited|selected|chosen)\s+(?:to|for)\b/i,
    /\bif\s+(?:you\s+are\s+|you're\s+)?(?:selected|invited|chosen|shortlisted|successful)\b/i,
    // "If you are applying to a role that requires coding skills, you may
    // receive an invitation to take a coding assessment. You will receive a
    // separate email within 24 hours…" (a Workday confirmation)
    /\b(?:may|might)\s+(?:also\s+)?receive\b/i,
    /\bif\s+you(?:\s+are|'re)\s+applying\b/i,
    /\bseparate\s+email\s+within\b/i,
  ],
  // Also dropped before the rejection rules: "If you see the job moved to an
  // inactive state, that means ... you were not selected" explains the portal.
  // Not before invites, since "If you'd like to proceed, complete the
  // assessment" is a real one.
  conditional: [/^\s*if\b/i],
  // Dropped before the completed-assessment rules: "Once you've completed all
  // assessments, our team will review your results" is in the invite.
  future: [/\b(?:once|when|after)\s+you(?:'ve|\s+have)?\s+(?:completed|submitted|finished)\b/i],

  reminder: [
    /\breminder\b/i,
    /(?:haven't|have not)\s+(?:had\s+a\s+chance|yet)\s+(?:to\s+)?(?:complete|start|begin|finish)/i,
    /\b(?:still\s+pending|is\s+still\s+waiting|still\s+waiting\s+for)\b/i,
    /don't\s+forget/i,
  ],

  confirmation: [
    /thank(?:s|\s+you)?(?:\s+so\s+much|\s+very\s+much)?\s+for\s+(?:applying|your\s+(?:application|interest|recent\s+application))/i,
    /thank(?:s|\s+you)\s+for\s+(?:taking\s+the\s+time\s+to\s+)?submit(?:ting)?\s+your\s+application/i,
    /\b(?:received|got)\s+your\s+(?:application|resume)/i,
    /\byour\s+application\s+(?:has\s+been\s+|was\s+)?(?:received|submitted|is\s+in|was\s+sent)\b/i,
    /\bapplication\s+(?:received|confirmation|submitted)\b/i,
    /successfully\s+submitted/i,
    /\bwe(?:'ve|\s+have)\s+received\b[^.]{0,60}?\bapplication\b/i,
    /thanks\s+for\s+(?:applying|completing\s+your\s+application)/i,
    /thank(?:s|\s+you)[^.]{0,30}?\b(?:taking\s+the\s+time\s+to\s+)?(?:apply|applying)\b/i,
    /confirm(?:ing)?\s+(?:that\s+)?(?:we(?:'ve|\s+have)\s+received|your\s+application)/i,
  ],
} as const;

const localIgnores = () =>
  (process.env.NEXT_PUBLIC_GMAIL_IGNORE_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

export function domainOf(address: string): string {
  return address.split("@")[1] ?? "";
}

const onDomain = (host: string, list: readonly string[]) => list.some((d) => host === d || host.endsWith(`.${d}`));

export const isAtsSender = (address: string) => onDomain(domainOf(address), RULES.atsDomains);
export const isAssessmentSender = (address: string) => onDomain(domainOf(address), RULES.assessmentDomains);

function firstMatch(patterns: readonly RegExp[], haystack: string): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(haystack);
    if (match) return match[0].replace(/\s+/g, " ").trim().slice(0, 90);
  }
  return null;
}

// Splits on sentence ends and line breaks, so only the matching sentence goes.
function without(text: string, patterns: readonly RegExp[]): string {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => !patterns.some((p) => p.test(sentence)))
    .join("\n");
}

export function classify(facts: EmailFacts): Classification {
  const host = domainOf(facts.fromAddress);
  if (
    RULES.notJobAddresses.includes(facts.fromAddress as never) ||
    onDomain(host, [...RULES.notJobDomains, ...localIgnores()]) ||
    /\.edu$/.test(host)
  ) {
    return { kind: null, reason: "not a job sender" };
  }
  if (onDomain(host, RULES.personalDomains)) return { kind: null, reason: "personal sender" };
  if (onDomain(host, RULES.eventDomains) || RULES.eventWords.test(`${facts.subject}\n${facts.text.slice(0, 400)}`)) {
    return { kind: null, reason: "event, not a job" };
  }
  if (
    RULES.jobAlertSenders.some((s) => (s.includes("@") ? facts.fromAddress === s : onDomain(host, [s]))) ||
    RULES.jobAlertSubject.test(facts.subject)
  ) {
    return { kind: null, reason: "job alert (not handled yet)" };
  }

  const body = `${facts.subject}\n${facts.text}`;
  // Tracking URLs carry signals (LinkedIn); search them as part of the text.
  const urls = facts.links.map((l) => l.url).join("\n");
  // The body without sentences about what *might* happen.
  const real = without(body, RULES.hypothetical);

  const knownSender = isAtsSender(facts.fromAddress) || isAssessmentSender(facts.fromAddress);
  if (!knownSender && !RULES.jobWords.test(body)) return { kind: null, reason: "not job-related" };

  const notYet = firstMatch(RULES.notYet, body);
  if (notYet) return { kind: null, reason: `application not finished ("${notYet}")` };

  const rejection = firstMatch(RULES.rejection, `${without(real, RULES.conditional)}\n${urls}`);
  if (rejection) return { kind: "rejection", phrase: rejection };

  const done = firstMatch(RULES.assessmentDone, without(real, [...RULES.conditional, ...RULES.future]));
  if (done) return { kind: "assessment_done", phrase: done };

  const invite =
    ((p) => (p ? { kind: "video_invite" as const, phrase: p } : null))(firstMatch(RULES.video, real)) ??
    ((p) => (p ? { kind: "oa_invite" as const, phrase: p } : null))(firstMatch(RULES.oa, real)) ??
    ((p) => (p ? { kind: "interview_invite" as const, phrase: p } : null))(
      firstMatch(RULES.interview, `${real}\n${urls}`) ?? firstMatch(RULES.schedulingLinks, urls)
    );
  if (invite) {
    const reminder = firstMatch(RULES.reminder, body);
    return reminder ? { kind: "reminder", phrase: reminder } : invite;
  }

  const confirmation = firstMatch(RULES.confirmation, body);
  if (confirmation) return { kind: "confirmation", phrase: confirmation };

  return { kind: null, reason: "no rule phrase" };
}
