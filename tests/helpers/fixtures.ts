import type {
  Application,
  Assessment,
  EmailAccept,
  EmailMessage,
  JobPosting,
  MessageTemplate,
  Move,
  Question,
  StatusChange,
} from "@/lib/tracker/format";

// Typed against the generated database rows, so a schema change breaks the
// tests at compile time instead of letting stale fixtures slip through.

let seq = 0;
const id = (prefix: string) => `${prefix}-${++seq}`;

export function resetFixtureIds() {
  seq = 0;
}

export function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: id("app"),
    user_id: "user-1",
    company: "Acme",
    role: "Software Engineer Intern",
    url: null,
    location: null,
    description: null,
    source: "manual",
    applied_on: "2026-09-01",
    status: "applied",
    status_changed_at: null,
    notes: null,
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

export function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    id: id("asmt"),
    user_id: "user-1",
    application_id: "app-1",
    kind: "oa",
    title: "Coding round",
    details: null,
    duration_min: null,
    due_at: null,
    interviewer: null,
    link: null,
    important: false,
    status: "pending",
    completed_at: null,
    notes: null,
    difficulty: null,
    outcome: null,
    score: null,
    prep_notes: null,
    reflection: null,
    created_at: "2026-09-02T12:00:00.000Z",
    ...overrides,
  };
}

export function makeChange(overrides: Partial<StatusChange> = {}): StatusChange {
  return {
    id: id("chg"),
    user_id: "user-1",
    application_id: "app-1",
    status: "oa",
    changed_at: "2026-09-05T12:00:00.000Z",
    origin: "manual",
    ...overrides,
  };
}

export function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: id("q"),
    user_id: "user-1",
    assessment_id: "asmt-1",
    source: "expected",
    question: "Reverse a linked list",
    answer: null,
    created_at: "2026-09-02T12:00:00.000Z",
    ...overrides,
  };
}

export function makeMove(overrides: Partial<Move> = {}): Move {
  return {
    id: id("move"),
    user_id: "user-1",
    channel: "linkedin",
    target: "Priya (Acme)",
    link: null,
    minutes: 10,
    stage: "sent",
    waiting_on: "them",
    closed: false,
    follow_ups: 0,
    last_touch_at: "2026-09-28T12:00:00.000Z",
    replied_at: null,
    template_key: null,
    message: null,
    application_id: null,
    notes: null,
    created_at: "2026-09-28T12:00:00.000Z",
    updated_at: "2026-09-28T12:00:00.000Z",
    ...overrides,
  };
}

export function makePosting(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    id: id("posting"),
    user_id: "user-1",
    source: "jobright",
    source_id: `${seq}`.padStart(24, "a"),
    url: "https://jobright.ai/jobs/info/aaaaaaaaaaaaaaaaaaaaaaaa",
    company: "Vandelay Industries",
    role: "Software Engineer Intern",
    location: "Toronto, ON",
    pay: null,
    referrals: null,
    categories: "Software · Public Company",
    match_pct: 85,
    posted_at: "2026-10-04T10:00:00.000Z",
    first_seen_at: "2026-10-04T11:00:00.000Z",
    gmail_id: "gmail-1",
    state: "new",
    application_id: null,
    created_at: "2026-10-04T11:00:00.000Z",
    updated_at: "2026-10-04T11:00:00.000Z",
    ...overrides,
  };
}

export function makeTemplate(overrides: Partial<MessageTemplate> = {}): MessageTemplate {
  return {
    id: id("tpl"),
    user_id: "user-1",
    channel: "linkedin",
    name: "My DM",
    body: "Hi {name}, {ask}",
    created_at: "2026-09-28T12:00:00.000Z",
    updated_at: "2026-09-28T12:00:00.000Z",
    ...overrides,
  };
}

export function makeEmailMessage(overrides: Partial<EmailMessage> = {}): EmailMessage {
  const n = ++seq;
  return {
    id: `email-${n}`,
    user_id: "user-1",
    gmail_id: `gm-${n}`,
    thread_id: `th-${n}`,
    received_at: "2026-09-28T12:00:00.000Z",
    from_name: "Acme Recruiting",
    from_address: "no-reply@ats.example",
    subject: "Thank you for applying",
    snippet: "",
    kind: "confirmation",
    matched_phrase: "thank you for applying",
    company: "Acme",
    role: "Software Engineer Intern",
    job_id: null,
    link: null,
    due_at: null,
    completed_at: null,
    assessment_title: null,
    field_origins: {},
    application_id: null,
    accept_id: null,
    state: "pending",
    created_at: "2026-09-28T12:05:00.000Z",
    ...overrides,
  };
}

export function makeAccept(overrides: Partial<EmailAccept> = {}): EmailAccept {
  return {
    id: id("accept"),
    user_id: "user-1",
    application_id: "app-1",
    created_application: false,
    before: null,
    assessments_before: [],
    created_assessment_ids: [],
    status_change_ids: [],
    created_at: "2026-09-28T12:00:00.000Z",
    undone_at: null,
    ...overrides,
  };
}

// Local-time ISO timestamp, so tests read the same in any time zone.
export function local(y: number, m: number, d: number, h = 12, min = 0): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}
