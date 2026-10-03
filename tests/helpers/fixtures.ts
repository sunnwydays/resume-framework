import type { Application, Assessment, Question, StatusChange } from "@/lib/tracker/format";

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

// Local-time ISO timestamp, so tests read the same in any time zone.
export function local(y: number, m: number, d: number, h = 12, min = 0): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}
