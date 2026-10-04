import { beforeEach, describe, expect, it } from "vitest";
import { analyze, groupIntoJobs, matchApplications, type Analyzed } from "@/lib/tracker/email/group";
import { roleCloseness } from "@/lib/tracker/email/match";
import { local, makeApp, makeAssessment, makeChange, resetFixtureIds } from "../helpers/fixtures";
import { mail } from "../helpers/email";

beforeEach(resetFixtureIds);

// ---- email builders: each is one made-up mail in a real sender's shape ----
let n = 0;
const at = (day: number, hour = 12) => new Date(2026, 8, day, hour).toISOString();

const confirmation = (company: string, role: string, day: number, extra: Partial<Parameters<typeof mail>[0]> = {}) =>
  analyze(
    mail({
      gmailId: `m${++n}`,
      threadId: `t${n}`,
      fromAddress: "no-reply@us.greenhouse-mail.io",
      subject: `Your application for ${role} at ${company}`,
      text: `Hi Sam, thank you for applying to the ${role} position at ${company}. We received your application.`,
      receivedAt: at(day),
      ...extra,
    })
  );

const rejection = (company: string, role: string, day: number) =>
  analyze(
    mail({
      gmailId: `m${++n}`,
      threadId: `t${n}`,
      fromAddress: "no-reply@us.greenhouse-mail.io",
      subject: `Your application for ${role} at ${company}`,
      text: `Hi Sam, thank you for applying to the ${role} position at ${company}. Unfortunately, we have decided not to move forward with your application.`,
      receivedAt: at(day),
    })
  );

const oaInvite = (company: string, role: string, day: number, due = "") =>
  analyze(
    mail({
      gmailId: `m${++n}`,
      threadId: `t${n}`,
      fromAddress: "support@hackerrankforwork.com",
      subject: `Your HackerRank ${role} Test Invitation`,
      text: `Thank you for your interest in joining ${company}! We're excited to invite you to take the HackerRank coding test assessment. ${due}`,
      receivedAt: at(day),
      links: [{ url: "https://www.hackerrank.com/test/abc", label: "Start Test" }],
    })
  );

const codesignalDone = (title: string, day: number, completed: string) =>
  analyze(
    mail({
      gmailId: `m${++n}`,
      threadId: `t${n}`,
      fromAddress: "no-reply@codesignal.com",
      subject: `Assessment completed: ${title}`,
      text: `Hi Sam, You have completed the ${title} on ${completed}.`,
      receivedAt: at(day),
    })
  );

const reminder = (company: string, day: number, due = "") =>
  analyze(
    mail({
      gmailId: `m${++n}`,
      threadId: `t${n}`,
      fromAddress: "assessment-support@acme-mail.com",
      subject: `Reminder from ${company}!`,
      text: `Our team noticed you haven't had a chance to complete your assessments yet. ${due}`,
      receivedAt: at(day),
      links: [],
    })
  );

describe("roleCloseness", () => {
  it.each([
    ["[Spring 2027] AI/ML SWE Intern Coding Test", "Software Engineer Intern (AI / ML) - Spring 2027", 100],
    ["Database Engineering Intern Test", "Software Engineer Intern (Database Engineering) - Spring 2027", 100],
    ["[Spring 2027] AI/ML SWE Intern Coding Test", "Software Engineer Intern (Database Engineering) - Spring 2027", 0],
    ["Software Engineer Intern", "Software Engineering Intern 2027", 50],
  ])("%s ~ %s = %i", (a, b, expected) => {
    expect(roleCloseness(a, b)).toBe(expected);
  });
});

describe("matchApplications", () => {
  const apps = () => [
    makeApp({ company: "Cyberdyne Computing Inc.", role: "Software Engineer Intern (AI / ML) - Spring 2027" }),
    makeApp({ company: "Cyberdyne Computing Inc.", role: "Software Engineer Intern (Database Engineering) - Spring 2027", url: "https://boards.example.com/jobs/4471002" }),
    makeApp({ company: "Wayne Labs", role: "Frontend SWE" }),
    makeApp({ company: "Initech", role: "Backend Intern" }),
  ];

  it("a lone application at the company is the match", () => {
    const r = matchApplications({ company: "Initech", role: null, jobId: null, assessmentTitle: null }, apps());
    expect(r.matches.map((a) => a.company)).toEqual(["Initech"]);
    expect(r.how).toBe("company");
  });

  it("tolerates 'Inc.' and short names", () => {
    expect(matchApplications({ company: "Cyberdyne", role: null, jobId: null, assessmentTitle: null }, apps()).matches).toHaveLength(2);
  });

  it("uses the role to pick between roles at one company", () => {
    const r = matchApplications({ company: "Cyberdyne", role: "[Spring 2027] AI/ML SWE Intern Coding Test", jobId: null, assessmentTitle: null }, apps());
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].role).toMatch(/AI/);
    expect(r.how).toBe("company + role");
  });

  it("is ambiguous when the email has no role and the company has several", () => {
    const r = matchApplications({ company: "Cyberdyne", role: null, jobId: null, assessmentTitle: null }, apps());
    expect(r.matches).toHaveLength(2);
    expect(r.how).toMatch(/no role/);
  });

  it("a job id found in a posting URL beats everything", () => {
    const r = matchApplications({ company: "Cyberdyne", role: "Something unrelated", jobId: "4471002", assessmentTitle: null }, apps());
    expect(r.matches.map((a) => a.role)).toEqual(["Software Engineer Intern (Database Engineering) - Spring 2027"]);
    expect(r.how).toBe("job id");
  });

  it("CodeSignal names the test, not the company", () => {
    const r = matchApplications({ company: null, role: null, jobId: null, assessmentTitle: "Wayne Labs Frontend Challenge Assessment" }, apps());
    expect(r.matches.map((a) => a.company)).toEqual(["Wayne Labs"]);
  });

  it("meets shorthand tracked roles ('swe ml', 'swe - db', 'swe fullstack')", () => {
    const tracked = [
      makeApp({ company: "vandelay (toronto)", role: "swe fullstack" }),
      makeApp({ company: "vandelay (toronto)", role: "swe ml" }),
      makeApp({ company: "cyberdyne", role: "swe - db" }),
      makeApp({ company: "cyberdyne", role: "swe - ai/ml" }),
      makeApp({ company: "cyberdyne", role: "swe - (Core, Infrastructure & Security)" }),
    ];
    const pick = (company: string, role: string) =>
      matchApplications({ company, role, jobId: null, assessmentTitle: null }, tracked).matches.map((a) => a.role);
    expect(pick("Vandelay", "Software Engineer Intern, Machine Learning (Summer 2027 - Toronto)")).toEqual(["swe ml"]);
    expect(pick("Vandelay", "Software Engineer Intern, Full-Stack (Summer 2027)")).toEqual(["swe fullstack"]);
    expect(pick("Cyberdyne", "[Spring 2027] Database Engineering Intern")).toEqual(["swe - db"]);
    expect(pick("Cyberdyne", "Software Engineer Intern (Core, Infrastructure & Security) — Spring 2027")).toEqual(["swe - (Core, Infrastructure & Security)"]);
  });

  it("a role you don't track at a company you do is a new job, not a pick", () => {
    const tracked = [makeApp({ company: "vandelay", role: "swe fullstack" }), makeApp({ company: "vandelay", role: "swe ml" })];
    const r = matchApplications({ company: "Vandelay", role: "Software Engineer Intern, Test Automation (Summer 2027)", jobId: null, assessmentTitle: null }, tracked);
    expect(r.matches).toEqual([]);
    expect(r.how).toMatch(/not this role/);
  });

  it("…but stays a pick when a tracked role is too vague to rule out", () => {
    const tracked = [makeApp({ company: "vandelay", role: "swe" }), makeApp({ company: "vandelay", role: "swe ml" })];
    const r = matchApplications({ company: "Vandelay", role: "Software Engineer Intern, Test Automation", jobId: null, assessmentTitle: null }, tracked);
    expect(r.matches.length).toBeGreaterThan(1);
  });

  it("a role-less confirmation picks the application made that day", () => {
    const tracked = [
      makeApp({ company: "wonka", role: "backend swe", applied_on: "2026-09-25" }),
      makeApp({ company: "wonka", role: "swe, web (toronto)", applied_on: "2026-09-27" }),
      makeApp({ company: "wonka", role: "swe, web (usa)", applied_on: "2026-09-23" }),
    ];
    const f = { company: "Wonka", role: null, jobId: null, assessmentTitle: null };
    const late = new Date(2026, 8, 27, 21, 2).toISOString();
    expect(matchApplications(f, tracked, { kind: "confirmation", receivedAt: late }).matches.map((a) => a.role)).toEqual(["swe, web (toronto)"]);
    // Only confirmations get the tie-break; a rejection could be about any of them.
    expect(matchApplications(f, tracked, { kind: "rejection", receivedAt: late }).matches).toHaveLength(3);
  });

  it("a requisition number inside a posting URL matches", () => {
    const tracked = [makeApp({ company: "stark", role: "swe", url: "https://careers.stark.com/job/STARKGLOBAL09999999EXTERNAL/Software-Engineer" }), makeApp({ company: "stark", role: "swe" })];
    expect(matchApplications({ company: "Stark", role: "Software Engineering Intern", jobId: "09999999", assessmentTitle: null }, tracked).how).toBe("job id");
  });

  it("nothing tracked at the company", () => {
    expect(matchApplications({ company: "Globex", role: "X", jobId: null, assessmentTitle: null }, apps()).matches).toEqual([]);
  });
});

describe("groupIntoJobs: untracked companies", () => {
  it("a confirmation then a rejection make one new application with two steps", () => {
    const groups = groupIntoJobs([confirmation("Globex", "Backend Intern", 20), rejection("Globex", "Backend Intern", 27)], [], [], []);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.target).toMatchObject({ type: "new", company: "Globex", role: "Backend Intern" });
    expect(g.ready).toBe(true);
    expect(g.steps.map((s) => [s.status, s.apply])).toEqual([["applied", true], ["rejected", true]]);
    expect(g.nothingToDo).toBe(false);
  });

  it("several roles at one company stay separate jobs", () => {
    const groups = groupIntoJobs(
      [rejection("Tyrell", "Frontend Software Engineering Intern 2027", 24), rejection("Tyrell", "Security Software Engineering Intern 2027", 24), rejection("Tyrell", "Embedded Software Engineering Intern 2027", 24)],
      [],
      [],
      []
    );
    expect(groups).toHaveLength(3);
  });

  it("duplicate confirmations collapse into the first", () => {
    const groups = groupIntoJobs([confirmation("Globex", "Backend Intern", 20), confirmation("Globex", "Backend Intern", 20, { gmailId: "dup" })], [], [], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].steps.map((s) => s.apply)).toEqual([true, false]);
    expect(groups[0].steps[1].note).toMatch(/first confirmation/);
  });

  it("a role-less mail joins its company's only job", () => {
    const groups = groupIntoJobs(
      [confirmation("Globex", "Backend Intern", 20), analyze(mail({ gmailId: "x", fromAddress: "no-reply@us.greenhouse-mail.io", subject: "Thank you for applying to Globex", text: "Thanks for applying to Globex.", receivedAt: at(21) }))],
      [],
      [],
      []
    );
    expect(groups).toHaveLength(1);
  });

  it("OA after applying proposes the OA step and a new assessment with link and deadline", () => {
    const groups = groupIntoJobs(
      [confirmation("Globex", "Backend Intern", 20), oaInvite("Globex", "Backend Intern", 22, "End Login Date/Time: 10 Oct 2026 05:37 AM PDT")],
      [],
      [],
      []
    );
    const g = groups[0];
    expect(g.steps.map((s) => s.status)).toEqual(["applied", "oa"]);
    expect(g.assessments).toHaveLength(1);
    expect(g.assessments[0]).toMatchObject({ kind: "oa", link: "https://www.hackerrank.com/test/abc", dueAt: "2026-10-10T12:37:00.000Z", existing: null, apply: true });
  });

  it("an unknown company still gets a card, flagged not ready", () => {
    const groups = groupIntoJobs(
      [analyze(mail({ gmailId: "u", fromAddress: "x@weirdco.example", subject: "Update", text: "Unfortunately we will not be moving forward with your application.", receivedAt: at(20) }))],
      [],
      [],
      []
    );
    expect(groups[0].target.type).toBe("new");
  });
});

describe("groupIntoJobs: tracked applications", () => {
  it("moves forward only", () => {
    const app = makeApp({ company: "Initech", role: "Backend Intern", status: "interview", status_changed_at: at(10) });
    const [g] = groupIntoJobs([oaInvite("Initech", "Backend Intern", 22)], [app], [], []);
    expect(g.steps[0]).toMatchObject({ status: "oa", apply: false });
    expect(g.steps[0].note).toMatch(/at or past/);
  });

  it("an OA invite on an applied row proposes the step", () => {
    const app = makeApp({ company: "Initech", role: "Backend Intern", status: "applied" });
    const [g] = groupIntoJobs([oaInvite("Initech", "Backend Intern", 22)], [app], [], []);
    expect(g.target).toMatchObject({ type: "existing" });
    expect(g.steps[0]).toMatchObject({ status: "oa", apply: true });
  });

  it("a rejection on an active row proposes it", () => {
    const app = makeApp({ company: "Initech", role: "Backend Intern", status: "oa", status_changed_at: at(10) });
    const [g] = groupIntoJobs([rejection("Initech", "Backend Intern", 25)], [app], [], []);
    expect(g.steps[0]).toMatchObject({ status: "rejected", apply: true });
  });

  it("fills the missing date of an already-rejected row, without re-rejecting it", () => {
    const app = makeApp({ company: "Initech", role: "Backend Intern", status: "rejected", status_changed_at: null });
    const [g] = groupIntoJobs([rejection("Initech", "Backend Intern", 25)], [app], [], []);
    expect(g.fills).toEqual([expect.objectContaining({ field: "status_changed_at", value: at(25) })]);
    expect(g.steps[0].apply).toBe(false);
    expect(g.nothingToDo).toBe(false);
  });

  it("leaves a date that is already set alone", () => {
    const app = makeApp({ company: "Initech", role: "Backend Intern", status: "rejected", status_changed_at: at(26) });
    const [g] = groupIntoJobs([rejection("Initech", "Backend Intern", 25)], [app], [], []);
    expect(g.fills).toEqual([]);
    expect(g.nothingToDo).toBe(true);
  });

  it("an earlier confirmation fixes a defaulted applied_on, but not a deliberate one", () => {
    const defaulted = makeApp({ company: "Initech", role: "Backend Intern", applied_on: "2026-09-30", created_at: local(2026, 9, 30) });
    const deliberate = makeApp({ company: "Globex", role: "Backend Intern", applied_on: "2026-09-30", created_at: local(2026, 10, 2) });
    const groups = groupIntoJobs([confirmation("Initech", "Backend Intern", 20), confirmation("Globex", "Backend Intern", 20)], [defaulted, deliberate], [], []);
    const fillFor = (company: string) => groups.find((g) => g.target.type === "existing" && g.target.application.company === company)!.fills;
    expect(fillFor("Initech")).toEqual([expect.objectContaining({ field: "applied_on", value: "2026-09-20" })]);
    expect(fillFor("Globex")).toEqual([]);
  });

  it("a confirmation for an application that is already tracked is not news", () => {
    const app = makeApp({ company: "Initech", role: "Backend Intern", applied_on: "2026-09-20", created_at: local(2026, 9, 21) });
    const [g] = groupIntoJobs([confirmation("Initech", "Backend Intern", 20)], [app], [], []);
    expect(g.nothingToDo).toBe(true);
  });

  it("an invite for an OA that is already tracked, with nothing new, offers nothing", () => {
    const app = makeApp({ company: "Initech", role: "Backend Intern", status: "oa", status_changed_at: at(22) });
    const existing = makeAssessment({ application_id: app.id, kind: "oa", link: "https://www.hackerrank.com/test/abc", due_at: at(30) });
    const [g] = groupIntoJobs([oaInvite("Initech", "Backend Intern", 22, "End Login Date/Time: 10 Oct 2026 05:37 AM PDT")], [app], [existing], []);
    expect(g.assessments[0]).toMatchObject({ existing, apply: false, note: "already tracked" });
  });

  it("an invite fills a missing link into the OA that is already tracked", () => {
    const app = makeApp({ company: "Initech", role: "Backend Intern", status: "oa", status_changed_at: at(22) });
    const existing = makeAssessment({ application_id: app.id, kind: "oa", link: null, due_at: null });
    const [g] = groupIntoJobs([oaInvite("Initech", "Backend Intern", 22)], [app], [existing], []);
    expect(g.assessments[0]).toMatchObject({ existing, apply: true, link: "https://www.hackerrank.com/test/abc" });
  });

  it("'assessment completed' marks the pending OA completed, at the time the mail says", () => {
    const app = makeApp({ company: "Wayne Labs", role: "Frontend SWE", status: "oa", status_changed_at: at(22) });
    const pending = makeAssessment({ application_id: app.id, kind: "oa", status: "pending", title: "Wayne Labs Frontend Challenge" });
    const [g] = groupIntoJobs([codesignalDone("Wayne Labs Frontend Challenge Assessment", 27, "September 26th, 6:34 pm PDT")], [app], [pending], []);
    expect(g.target).toMatchObject({ type: "existing" });
    expect(g.assessments[0]).toMatchObject({ existing: pending, completedAt: "2026-09-27T01:34:00.000Z", apply: true });
  });

  it("'assessment completed' with no tracked OA proposes recording a completed one", () => {
    const app = makeApp({ company: "Wayne Labs", role: "Frontend SWE", status: "oa", status_changed_at: at(22) });
    const [g] = groupIntoJobs([codesignalDone("Wayne Labs Frontend Challenge Assessment", 27, "September 26th, 6:34 pm PDT")], [app], [], []);
    expect(g.assessments[0]).toMatchObject({ existing: null, kind: "oa", title: "Wayne Labs Frontend Challenge Assessment", apply: true });
    expect(g.assessments[0].completedAt).not.toBeNull();
  });

  it("a reminder only fills in what the tracked OA is missing", () => {
    const app = makeApp({ company: "Acme Mail", role: "Backend Intern", status: "oa", status_changed_at: at(22) });
    const noDue = makeAssessment({ application_id: app.id, kind: "oa", due_at: null });
    const due = "Please ensure you complete the assessments by October 5, 2026.";
    const [withDue] = groupIntoJobs([reminder("Acme Mail", 28, due)], [app], [noDue], []);
    expect(withDue.assessments[0]).toMatchObject({ existing: noDue, apply: true });
    const hasDue = makeAssessment({ application_id: app.id, kind: "oa", due_at: at(30), link: "https://x.example" });
    const [none] = groupIntoJobs([reminder("Acme Mail", 28, due)], [app], [hasDue], []);
    expect(none.assessments).toHaveLength(0);
    expect(none.nothingToDo).toBe(true);
  });

  it("is ambiguous when two applications fit", () => {
    const a = makeApp({ company: "Initech", role: "Backend Intern" });
    const b = makeApp({ company: "Initech", role: "Data Intern" });
    const groups = groupIntoJobs(
      [analyze(mail({ gmailId: "z", fromAddress: "no-reply@us.greenhouse-mail.io", subject: "Thank you for applying to Initech", text: "Thanks for applying to Initech.", receivedAt: at(20) }))],
      [a, b],
      [],
      []
    );
    expect(groups[0].target).toMatchObject({ type: "pick" });
    expect(groups[0].ready).toBe(false);
  });

  it("history makes 'reached' stricter than the current status", () => {
    const app = makeApp({ company: "Initech", role: "Backend Intern", status: "applied" });
    const change = makeChange({ application_id: app.id, status: "interview", changed_at: at(10) });
    const [g] = groupIntoJobs([oaInvite("Initech", "Backend Intern", 22)], [app], [], [change]);
    expect(g.steps[0].apply).toBe(false);
  });
});

describe("groupIntoJobs: ignored mail", () => {
  it("never makes a card for an unclassified email", () => {
    const ignored: Analyzed = analyze(mail({ fromAddress: "news@somestore.com", subject: "Big sale", text: "Save 30%" }));
    expect(groupIntoJobs([ignored], [], [], [])).toEqual([]);
  });
});
