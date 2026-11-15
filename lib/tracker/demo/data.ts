// Fake data for the public demo (/demo/tracker). Every company, person,
// address and job id here is made up (the repo is public; same rule as the test
// fixtures). Dates are offsets from `now`, built when the page loads, so the
// demo never goes stale: "due in 2 days" stays two days away.
//
// Typed against the database rows, so a schema change fails to compile here.

import type { Json } from "@/lib/tracker/database.types";
import type { GmailData } from "@/lib/tracker/useTracker";
import type {
  Application,
  Assessment,
  EmailMessage,
  GmailScan,
  JobPosting,
  MessageTemplate,
  Move,
  Question,
  StatusChange,
} from "@/lib/tracker/format";
import { todayISO } from "@/lib/tracker/format";
import type { Section } from "@/lib/tracker/sections";

export interface DemoData {
  applications: Application[];
  assessments: Assessment[];
  questions: Question[];
  statusChanges: StatusChange[];
  gmail: GmailData;
  postings: JobPosting[];
  moves: Move[];
  templates: MessageTemplate[];
}

const DAY = 86_400_000;
const USER = "demo-user";

export function buildDemoData(now: number): DemoData {
  // A timestamp `days` from now (negative = past), optionally at a fixed hour of that day.
  const ts = (days: number, hour?: number) => {
    const d = new Date(now + days * DAY);
    if (hour !== undefined) d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const day = (days: number) => todayISO(now + days * DAY);

  // ---------- applications + their status history ----------

  type Step = [status: string, daysAgo: number, origin?: "manual" | "email"];
  const applications: Application[] = [];
  const statusChanges: StatusChange[] = [];

  function addApp(
    n: number,
    a: { company: string; role: string; location: string | null; source?: string; notes?: string | null; description?: string | null },
    history: Step[]
  ) {
    const id = `demo-app-${String(n).padStart(2, "0")}`;
    const [, firstAgo] = history[0];
    const [status, lastAgo] = history[history.length - 1];
    const slug = a.company.toLowerCase().replace(/[^a-z]+/g, "");
    applications.push({
      id,
      user_id: USER,
      company: a.company,
      role: a.role,
      location: a.location,
      url: `https://careers.${slug}.example/jobs/${1000 + n}`,
      applied_on: day(-firstAgo),
      source: a.source ?? "manual",
      status,
      status_changed_at: ts(-lastAgo, 10),
      notes: a.notes ?? null,
      description: a.description ?? null,
      created_at: ts(-firstAgo, 9),
      updated_at: ts(-lastAgo, 10),
    });
    history.forEach(([s, ago, origin], i) => {
      statusChanges.push({
        id: `demo-sc-${n}-${i}`,
        user_id: USER,
        application_id: id,
        status: s,
        changed_at: ts(-ago, 10),
        origin: origin ?? "manual",
      });
    });
    return id;
  }

  const quillmere = addApp(1, { company: "Quillmere Labs", role: "Software Engineer Intern (Summer 2027)", location: "Toronto, ON", notes: "Referred by a friend from the robotics club." }, [["applied", 12], ["oa", 5, "email"]]);
  const brightvale = addApp(2, { company: "Brightvale Systems", role: "Backend Developer Intern", location: "Waterloo, ON" }, [["applied", 30], ["oa", 24], ["interview", 9, "email"]]);
  const tessellate = addApp(3, { company: "Tessellate AI", role: "Machine Learning Engineer Intern", location: "Remote", notes: "Posted on their careers page, five-minute application." }, [["applied", 16], ["video_interview", 3, "email"]]);
  addApp(4, { company: "Harborlight Software", role: "Frontend Developer Co-op", location: "Vancouver, BC" }, [["applied", 4]]);
  const fernwood = addApp(5, { company: "Fernwood Robotics", role: "Robotics Software Intern", location: "Pittsburgh, PA" }, [["applied", 15], ["oa", 6, "email"]]);
  const copperline = addApp(6, { company: "Copperline Cloud", role: "Cloud Infrastructure Intern", location: "Seattle, WA" }, [["applied", 40], ["oa", 33], ["rejected", 20, "email"]]);
  const marrow = addApp(7, { company: "Marrow Health", role: "Full Stack Developer Intern", location: "Montreal, QC", notes: "Offer expires in two weeks." }, [["applied", 55], ["oa", 48], ["interview", 36], ["interview", 22], ["offer", 4]]);
  const oakridge = addApp(8, { company: "Oakridge Payments", role: "Software Developer Intern", location: "Toronto, ON" }, [["applied", 38], ["oa", 31], ["rejected", 25, "email"]]);
  addApp(9, { company: "Lumenfall Games", role: "Gameplay Programmer Intern", location: "Montreal, QC" }, [["applied", 47]]);
  addApp(10, { company: "Stonebrook Data", role: "Data Engineer Intern", location: "Ottawa, ON" }, [["applied", 44], ["rejected", 30, "email"]]);
  addApp(11, { company: "Pinecrest Analytics", role: "Data Scientist Intern", location: "Calgary, AB", source: "alert" }, [["applied", 8]]);
  const velvet = addApp(12, { company: "Velvet Circuit Hardware", role: "Embedded Firmware Intern", location: "Kitchener, ON" }, [["applied", 27], ["oa", 17, "email"]]);
  const driftwood = addApp(13, { company: "Driftwood Mobile", role: "Android Developer Intern", location: "Toronto, ON" }, [["applied", 33], ["oa", 26], ["interview", 8]]);
  addApp(14, { company: "Sablewood Security", role: "Security Engineer Intern", location: "Remote", source: "link" }, [["applied", 3]]);
  addApp(15, { company: "Meridian Maps", role: "Backend Engineer Co-op", location: "Montreal, QC", notes: "Withdrew after accepting another offer path." }, [["applied", 41], ["withdrawn", 19]]);
  const tamarind = addApp(16, { company: "Tamarind Tools", role: "SDET / QA Automation Intern", location: "Mississauga, ON" }, [["applied", 21], ["oa", 11, "email"]]);
  const foxglove = addApp(17, { company: "Foxglove Fintech", role: "Software Engineering Intern", location: "New York, NY" }, [["applied", 35], ["oa", 29], ["rejected", 14, "email"]]);
  addApp(18, { company: "Gannet Infrastructure", role: "Site Reliability Engineer Intern", location: "Remote", source: "alert" }, [["applied", 2]]);
  addApp(19, { company: "Alderbank", role: "Full Stack Developer Intern", location: "Halifax, NS" }, [["applied", 10]]);
  const cobalt = addApp(20, { company: "Cobalt Orchard", role: "Research Engineer Intern", location: "Toronto, ON" }, [["applied", 29], ["video_interview", 13]]);
  addApp(21, { company: "Wrenfield Ventures", role: "Software Engineer Intern", location: "Boston, MA", source: "link" }, [["applied", 6]]);
  const zephyr = addApp(22, { company: "Zephyr Embedded", role: "Embedded Systems Intern", location: "Austin, TX" }, [["applied", 46], ["oa", 40], ["rejected", 28, "email"]]);
  const halcyon = addApp(23, { company: "Halcyon Labs", role: "Frontend Engineer Intern", location: "Remote" }, [["applied", 26], ["oa", 20], ["interview", 7]]);
  const kestrelMaps = addApp(24, { company: "Kestrel Cartography", role: "iOS Developer Intern", location: "Toronto, ON", source: "email" }, [["applied", 5, "email"]]);
  addApp(25, { company: "Ashgrove Learning", role: "Software Developer Intern", location: "Edmonton, AB" }, [["applied", 62], ["rejected", 50, "email"]]);

  // ---------- assessments + questions ----------

  const assessments: Assessment[] = [];
  const questions: Question[] = [];

  function addAsmt(
    n: number,
    appId: string,
    a: Partial<Assessment> & Pick<Assessment, "kind" | "title">,
    qs: [source: "expected" | "asked", question: string, answer: string | null][] = []
  ) {
    const id = `demo-asmt-${String(n).padStart(2, "0")}`;
    assessments.push({
      id,
      user_id: USER,
      application_id: appId,
      status: "pending",
      due_at: null,
      completed_at: null,
      duration_min: null,
      link: null,
      notes: null,
      details: null,
      important: false,
      difficulty: null,
      score: null,
      outcome: null,
      prep_notes: null,
      reflection: null,
      interviewer: null,
      sections: [],
      created_at: ts(-14),
      ...a,
    });
    qs.forEach(([source, question, answer], i) => {
      questions.push({ id: `demo-q-${n}-${i}`, user_id: USER, assessment_id: id, source, question, answer, created_at: ts(-3) });
    });
  }

  const sections = (list: Section[]) => list as unknown as Json;
  const section = (id: string, title: string, minutes: number | null, details: string | null, parts: Section[] = []): Section => ({
    id,
    title,
    minutes,
    details,
    notes: null,
    parts,
  });

  // Upcoming, with the sections of a multi-part OA.
  addAsmt(1, quillmere, {
    kind: "oa",
    title: "Coding Challenge",
    due_at: ts(2, 23),
    duration_min: 145,
    link: "https://assess.example/quillmere/coding-challenge",
    important: true,
    details: "Two timed parts. The link opens a 7-day window once started.",
    prep_notes: "Brush up on graph traversal and string parsing. Practice in the same editor the platform uses.",
    sections: sections([
      section("s1", "Coding Challenge", 100, null, [
        section("s1a", "Code writing", 60, "Two problems, any language."),
        section("s1b", "AI assistant in a repo", 40, "Fix a failing test with an assistant allowed."),
      ]),
      section("s2", "Work Simulation", 45, "Multiple choice scenarios about prioritizing tickets."),
    ]),
  }, [
    ["expected", "Walk through how you would detect a cycle in a directed graph.", null],
    ["expected", "How would you debug a flaky test?", null],
  ]);
  addAsmt(2, brightvale, {
    kind: "oa",
    title: "OA",
    status: "completed",
    completed_at: ts(-23, 15),
    due_at: ts(-20, 23),
    duration_min: 90,
    score: "92%",
    difficulty: 3,
    reflection: "The second problem was a sliding window in disguise. Spent too long on edge cases for the first.",
    prep_notes: "Did the platform's practice test the night before.",
  }, [
    ["asked", "Find the longest substring without repeating characters.", "Sliding window with a map of last-seen indexes, O(n)."],
    ["asked", "Merge overlapping intervals.", "Sort by start, then fold into a result list."],
  ]);
  addAsmt(3, brightvale, {
    kind: "interview",
    title: "Technical interview",
    due_at: ts(3, 14),
    duration_min: 45,
    link: "https://meet.example/brightvale-tech",
    interviewer: "Jordan Ellis",
    important: true,
    prep_notes: "Review their API platform blog posts. Prepare two stories about debugging production issues.",
  }, [
    ["expected", "Design a rate limiter for a public API.", null],
    ["expected", "Tell me about a time you disagreed with a teammate.", null],
  ]);
  addAsmt(4, tessellate, {
    kind: "video_interview",
    title: "Recorded video interview",
    due_at: ts(1, 20),
    duration_min: 30,
    link: "https://video.example/tessellate/record",
    details: "Four questions, 2 minutes each, one retake per question.",
  }, [
    ["expected", "Why machine learning, and why Tessellate?", null],
    ["expected", "Describe a model you trained end to end.", null],
  ]);
  // Overdue and still pending.
  addAsmt(5, fernwood, {
    kind: "oa",
    title: "Autonomy take-home",
    due_at: ts(-2, 23),
    duration_min: 120,
    link: "https://assess.example/fernwood/takehome",
    notes: "Needs a ROS-style message loop; I kept putting it off.",
  });
  addAsmt(6, copperline, { kind: "oa", title: "OA", status: "completed", completed_at: ts(-32, 18), due_at: ts(-30, 23), duration_min: 75, score: "61%", difficulty: 4, reflection: "Cloud-config questions I hadn't prepared for." });
  // An offer that went through an OA and two interviews.
  addAsmt(7, marrow, { kind: "oa", title: "OA", status: "completed", completed_at: ts(-47, 12), due_at: ts(-44, 23), duration_min: 60, score: "100%", difficulty: 2 });
  addAsmt(8, marrow, { kind: "interview", title: "Hiring manager chat", status: "completed", completed_at: ts(-36, 11), duration_min: 30, difficulty: 1, interviewer: "Mina Okafor", reflection: "Mostly about past projects and what I want to learn." }, [
    ["asked", "What was the hardest bug you've shipped a fix for?", "A race condition between two queue consumers; fixed with an idempotency key."],
  ]);
  addAsmt(9, marrow, { kind: "interview", title: "Team interview", status: "completed", completed_at: ts(-22, 15), duration_min: 60, difficulty: 3, interviewer: "Theo Lindqvist", reflection: "Pair-programmed a small feature. Asked good questions, which seemed to land." }, [
    ["asked", "Add pagination to this endpoint.", "Cursor-based, since offsets drift under writes."],
    ["asked", "How would you test it?", "Unit tests for the cursor logic, one integration test against a seeded database."],
  ]);
  // Bombed.
  addAsmt(10, oakridge, { kind: "oa", title: "OA", status: "completed", outcome: "bombed", completed_at: ts(-30, 21), due_at: ts(-29, 23), duration_min: 90, score: "30%", difficulty: 5, reflection: "Froze on the dynamic programming question and ran out of time." });
  // Expired: never taken.
  addAsmt(11, velvet, { kind: "oa", title: "Firmware assessment", outcome: "expired", due_at: ts(-9, 23), duration_min: 90, notes: "Missed the window; got the email too late." });
  addAsmt(12, driftwood, { kind: "oa", title: "OA", status: "completed", completed_at: ts(-24, 19), due_at: ts(-22, 23), duration_min: 60, score: "85%", difficulty: 3 });
  addAsmt(13, driftwood, { kind: "interview", title: "Technical interview", status: "completed", completed_at: ts(-6, 13), duration_min: 45, difficulty: 3, interviewer: "Sam Whitaker", reflection: "Went fine. Waiting to hear back." }, [
    ["asked", "Explain the Android activity lifecycle.", "Created, started, resumed, then back down; save state in onSaveInstanceState."],
  ]);
  addAsmt(14, tamarind, { kind: "oa", title: "Automation exercise", status: "completed", completed_at: ts(-9, 16), due_at: ts(-7, 23), duration_min: 80, difficulty: 2 });
  addAsmt(15, foxglove, { kind: "oa", title: "OA", status: "completed", completed_at: ts(-27, 17), due_at: ts(-26, 23), duration_min: 100, score: "74%", difficulty: 4 });
  addAsmt(21, tamarind, { kind: "take_home", title: "Take-home project", status: "completed", completed_at: ts(-5, 20), due_at: ts(-3, 23), duration_min: 180, difficulty: 3 });
  addAsmt(16, cobalt, { kind: "video_interview", title: "Recorded interview", status: "completed", completed_at: ts(-12, 20), duration_min: 25, difficulty: 2 });
  addAsmt(17, zephyr, { kind: "oa", title: "OA", status: "completed", completed_at: ts(-38, 14), due_at: ts(-36, 23), duration_min: 60, score: "55%", difficulty: 3 });
  addAsmt(18, halcyon, { kind: "oa", title: "OA", status: "completed", completed_at: ts(-19, 18), due_at: ts(-17, 23), duration_min: 70, score: "88%", difficulty: 3 });
  addAsmt(19, halcyon, { kind: "interview", title: "Round 1: React", status: "completed", completed_at: ts(-7, 15), duration_min: 45, difficulty: 3, interviewer: "Ana Petrov" }, [
    ["asked", "When would you reach for useMemo?", "Only when a profile shows an expensive derivation re-running; otherwise it's noise."],
  ]);
  addAsmt(20, halcyon, { kind: "interview", title: "Round 2: Product sense", due_at: ts(5, 11), duration_min: 45, link: "https://meet.example/halcyon-r2", interviewer: "Lee Marchetti", important: true });

  // ---------- Gmail review cards ----------

  const emails: EmailMessage[] = [];
  function addEmail(
    n: number,
    e: Partial<EmailMessage> & Pick<EmailMessage, "kind" | "subject" | "snippet" | "from_name" | "from_address" | "received_at">
  ) {
    emails.push({
      id: `demo-email-${n}`,
      user_id: USER,
      gmail_id: `demo${String(n).padStart(4, "0")}`,
      thread_id: `demo-thread-${n}`,
      state: "pending",
      matched_phrase: null,
      company: null,
      role: null,
      job_id: null,
      link: null,
      due_at: null,
      duration_min: null,
      sections: [],
      interviewer: null,
      completed_at: null,
      assessment_title: null,
      field_origins: {},
      application_id: null,
      accept_id: null,
      created_at: e.received_at,
      ...e,
    });
  }

  addEmail(1, {
    kind: "rejection",
    subject: "Your application to Full Stack Developer Intern at Alderbank",
    from_name: "Alderbank Recruiting",
    from_address: "careers@alderbank.example",
    received_at: ts(-1, 9),
    snippet: "Thank you for your interest in Alderbank. After careful review we have decided not to move forward with your application at this time.",
    matched_phrase: "decided not to move forward",
    company: "Alderbank",
    role: "Full Stack Developer Intern",
    field_origins: { company: "sender", role: "subject" },
  });
  addEmail(2, {
    kind: "oa_invite",
    subject: "Next step: complete your coding assessment for Larkspur Robotics",
    from_name: "Larkspur Robotics Talent",
    from_address: "talent@larkspurrobotics.example",
    received_at: ts(-1, 14),
    snippet: "You have been invited to complete an online assessment for the Autonomy Software Intern role. Please complete it within 5 days.",
    matched_phrase: "online assessment",
    company: "Larkspur Robotics",
    role: "Autonomy Software Intern",
    link: "https://assess.example/larkspur/abc123",
    due_at: ts(4, 23),
    duration_min: 90,
    assessment_title: "Coding assessment",
    field_origins: { company: "sender", role: "body", link: "link", dueAt: "body", durationMin: "body" },
  });
  addEmail(3, {
    kind: "confirmation",
    subject: "We received your application to Nimbus Orchard",
    from_name: "Nimbus Orchard",
    from_address: "no-reply@nimbusorchard.example",
    received_at: ts(-2, 11),
    snippet: "Thanks for applying to the Platform Engineer Intern position. Our team will review your application and be in touch.",
    matched_phrase: "thanks for applying",
    company: "Nimbus Orchard",
    role: "Platform Engineer Intern",
    field_origins: { company: "sender", role: "body" },
  });
  addEmail(4, {
    kind: "interview_invite",
    subject: "Interview with Kestrel Cartography: iOS Developer Intern",
    from_name: "Priya Nandakumar",
    from_address: "priya@kestrelcartography.example",
    received_at: ts(-1, 16),
    snippet: "We'd love to set up a technical interview. 10:00 AM - 10:45 AM: Pat Lee (Staff Engineer). Join with the meeting link below.",
    matched_phrase: "set up a technical interview",
    company: "Kestrel Cartography",
    role: "iOS Developer Intern",
    link: "https://meet.example/kestrel-ios",
    due_at: ts(6, 10),
    duration_min: 45,
    interviewer: "Pat Lee",
    assessment_title: "Technical interview",
    application_id: kestrelMaps,
    field_origins: { company: "sender", role: "subject", dueAt: "body", durationMin: "body", interviewer: "body" },
  });
  // One dismissed, so the "Dismissed" list has something to restore.
  addEmail(5, {
    kind: "reminder",
    state: "dismissed",
    subject: "Reminder: your assessment is due soon",
    from_name: "Velvet Circuit Hardware",
    from_address: "hiring@velvetcircuit.example",
    received_at: ts(-10, 9),
    snippet: "A friendly reminder that your firmware assessment closes in 24 hours.",
    matched_phrase: "closes in 24 hours",
    company: "Velvet Circuit Hardware",
    role: "Embedded Firmware Intern",
  });

  const lastScan: GmailScan = { id: "demo-scan-1", user_id: USER, scanned_at: ts(-0.2), since: ts(-9), fetched: 142, saved: 5 };

  // ---------- postings ----------

  const postings: JobPosting[] = [];
  function addPosting(
    n: number,
    p: Partial<JobPosting> & Pick<JobPosting, "company" | "role" | "location">,
    seenDaysAgo: number
  ) {
    const sourceId = n.toString(16).padStart(24, "a");
    postings.push({
      id: `demo-post-${String(n).padStart(2, "0")}`,
      user_id: USER,
      source: "jobright",
      source_id: sourceId,
      gmail_id: `demo-alert-${n}`,
      url: `https://jobright.example/jobs/info/${sourceId}`,
      pay: null,
      categories: null,
      match_pct: null,
      referrals: null,
      posted_at: ts(-seenDaysAgo - 0.3),
      first_seen_at: ts(-seenDaysAgo),
      state: "new",
      application_id: null,
      edits: {},
      start_text: null,
      length_text: null,
      level_text: null,
      citizen_only: false,
      clearance_required: false,
      description: "",
      details_read_at: ts(-seenDaysAgo),
      created_at: ts(-seenDaysAgo),
      updated_at: ts(-seenDaysAgo),
      ...p,
    });
  }

  // Already in the tracker (matches application 1).
  addPosting(1, { company: "Quillmere Labs", role: "Software Engineer Intern (Summer 2027)", location: "Toronto, ON", state: "applied", application_id: quillmere, level_text: "Internship", categories: "Software Development · Growth Stage" }, 12);
  addPosting(2, { company: "Cinderwood Interactive", role: "Software Developer Intern", location: "Vancouver, BC", pay: "CA$30/hr", level_text: "Internship", start_text: "Start in 2027 Summer", length_text: "4 months", categories: "Gaming · Growth Stage" }, 1);
  addPosting(3, { company: "Aurelian Cloud", role: "Backend Engineer Intern (Summer 2027)", location: "Seattle, WA", pay: "$48/hr", level_text: "Internship", length_text: "12 weeks", categories: "Cloud Computing · Public Company", description: "Work on the storage control plane. Interns ship to production." }, 1);
  addPosting(4, { company: "Bluebell Robotics", role: "Robotics Software Intern - Summer 2027", location: "Pittsburgh, PA", pay: "$44/hr", level_text: "Internship", categories: "Robotics · Early Stage", length_text: "16 weeks" }, 2);
  // Eligibility "no": a defense employer, by industry.
  addPosting(5, { company: "Kestrel Aerospace", role: "Flight Software Intern", location: "Huntsville, AL", level_text: "Internship", categories: "Aerospace & Defense · Public Company" }, 2);
  // Eligibility "no": the page says citizens only.
  addPosting(6, { company: "Ironvale Defense Systems", role: "Software Engineer Intern", location: "Arlington, VA", level_text: "Internship", citizen_only: true, clearance_required: true, categories: "Defense · Established" }, 3);
  // No visa sponsorship, said in the description.
  addPosting(7, { company: "Marlowe Commerce", role: "Software Engineering Intern", location: "Austin, TX", pay: "$40/hr", level_text: "Internship", categories: "E-commerce · Public Company", description: "You must be authorized to work in the United States. This role is not eligible for visa sponsorship." }, 3);
  // A Data role, hidden by default.
  addPosting(8, { company: "Peregrine Data", role: "Data Analyst Intern", location: "Remote", level_text: "Internship", categories: "Data Infrastructure · Growth Stage" }, 4);
  // New grad and experienced rows, kept but hidden by the default level chips.
  addPosting(9, { company: "Solstice Games", role: "New Grad Software Engineer", location: "Montreal, QC", level_text: "New Grad · Full-time", categories: "Gaming · Growth Stage" }, 4);
  addPosting(10, { company: "Tidewater Labs", role: "Senior Software Engineer", location: "Toronto, ON", level_text: "Senior · Full-time", categories: "Software Development · Established" }, 5);
  // Unclear region: remote, pay in dollars only.
  addPosting(11, { company: "Ravenscroft AI", role: "Machine Learning Intern (Winter 2027)", location: "Remote", pay: "$50/hr", level_text: "Internship", categories: "Artificial Intelligence (AI) · Early Stage" }, 1);
  addPosting(12, { company: "Linden Systems", role: "Software Developer Co-op (Summer 2027, 4 months)", location: "Waterloo, ON", level_text: "Internship", categories: "Information Technology · Established" }, 2);
  addPosting(13, { company: "Opaline Health", role: "Full Stack Developer Intern", location: "Boston, MA", pay: "$38/hr", level_text: "Internship", state: "saved", categories: "Health Care · Growth Stage" }, 5);
  addPosting(14, { company: "Everly Mobility", role: "iOS Developer Intern", location: "San Francisco, CA", level_text: "Internship", state: "dismissed", categories: "Transportation · Growth Stage" }, 6);
  // A relist of the dismissed posting 14 (same company and role, another city), hidden behind "Show relists".
  addPosting(17, { company: "Everly Mobility", role: "iOS Developer Intern", location: "New York, NY", level_text: "Internship", categories: "Transportation · Growth Stage" }, 0.4);
  // Masters / PhD, hidden behind its own chip.
  addPosting(15, { company: "Thistle Security", role: "Software Engineer Intern (MS/PhD)", location: "Palo Alto, CA", level_text: "Internship", categories: "Cybersecurity · Growth Stage" }, 3);
  addPosting(16, { company: "Hollis Payments", role: "Backend Developer Intern", location: "Toronto, ON", pay: "CA$32/hr", level_text: "Internship", length_text: "8 months", categories: "Financial Services · Public Company" }, 0.5);

  // ---------- moves + templates ----------

  const moves: Move[] = [];
  function addMove(
    n: number,
    m: Partial<Move> & Pick<Move, "channel" | "target" | "stage">,
    startedDaysAgo: number,
    touchedDaysAgo = startedDaysAgo
  ) {
    moves.push({
      id: `demo-move-${String(n).padStart(2, "0")}`,
      user_id: USER,
      message: null,
      notes: null,
      link: null,
      template_key: null,
      application_id: null,
      minutes: 15,
      follow_ups: 0,
      waiting_on: "them",
      closed: false,
      replied_at: m.stage === "sent" ? null : ts(-touchedDaysAgo),
      created_at: ts(-startedDaysAgo),
      last_touch_at: ts(-touchedDaysAgo),
      updated_at: ts(-touchedDaysAgo),
      ...m,
    });
  }

  addMove(1, { channel: "linkedin", target: "Riley Chen (Cobalt Orchard)", stage: "interview", template_key: "builtin:coffee-chat", minutes: 40, application_id: cobalt, message: "Hi Riley, I'm a second-year CS student who read your talk on retrieval systems. Would you be open to a 15-minute chat?" }, 32, 12);
  addMove(2, { channel: "linkedin", target: "Dana Brightwater (Aurelian Cloud)", stage: "replied", waiting_on: "me", minutes: 20, template_key: "builtin:coffee-chat" }, 6, 1);
  addMove(3, { channel: "linkedin", target: "Marcus Oyelaran (Fernwood Robotics)", stage: "sent", minutes: 10, template_key: "builtin:coffee-chat" }, 5);
  addMove(4, { channel: "email", target: "Ines Valcourt (Pinecrest Analytics)", stage: "sent", minutes: 25, template_key: "builtin:founder-email", notes: "Founder; cc'd their recruiter." }, 9, 9);
  addMove(5, { channel: "email", target: "Hugo Brandt (Sablewood Security)", stage: "conversation", waiting_on: "them", minutes: 55, follow_ups: 1, template_key: "builtin:founder-email" }, 20, 4);
  addMove(6, { channel: "warm", target: "Casey Moreau (Marrow Health)", stage: "offer", minutes: 60, application_id: marrow, template_key: "builtin:warm-note", notes: "Friend of a friend; their intro got my resume read." }, 58, 4);
  addMove(7, { channel: "warm", target: "Jordan Ellis (Brightvale Systems)", stage: "interview", minutes: 30, application_id: brightvale, template_key: "builtin:warm-note" }, 28, 9);
  addMove(8, { channel: "project", target: "Open-source: tiny job-board scraper", stage: "positive", minutes: 360, link: "https://code.example/demo/job-scraper", notes: "Posted it; two people starred it and one DM'd me." }, 25, 7);
  addMove(9, { channel: "project", target: "Weekend build: transit delay bot", stage: "sent", minutes: 240, link: "https://code.example/demo/transit-bot", template_key: "builtin:built-this" }, 11);
  addMove(10, { channel: "community", target: "Toronto Tech Meetup", stage: "conversation", minutes: 150, notes: "Met two engineers; one offered to look at my resume." }, 14, 14);
  addMove(11, { channel: "linkedin", target: "Sora Kimura (Gannet Infrastructure)", stage: "sent", minutes: 10, closed: true, notes: "No reply after two nudges." }, 40, 26);
  addMove(12, { channel: "other", target: "Alumni mentor (Tidewater Labs)", stage: "positive", waiting_on: "me", minutes: 45, notes: "Offered to refer me when the intern posting opens." }, 18, 2);

  const templates: MessageTemplate[] = [
    {
      id: "demo-template-1",
      user_id: USER,
      name: "Short LinkedIn intro",
      channel: "linkedin",
      body: "Hi {name}, I'm a CS student interested in {company}'s work on {about}. {hook} Would you be open to a quick chat?",
      created_at: ts(-30),
      updated_at: ts(-30),
    },
  ];

  return {
    applications,
    assessments,
    questions,
    statusChanges,
    gmail: {
      emails,
      mutes: [{ id: "demo-mute-1", user_id: USER, kind: "sender", value: "digest@jobsdigest.example", created_at: ts(-20) }],
      accepts: [],
      lastScan,
    },
    postings,
    moves,
    templates,
  };
}
