import { beforeEach, describe, expect, it } from "vitest";
import { analyze, groupIntoJobs, retarget, type Analyzed, type JobGroup } from "@/lib/tracker/email/group";
import { canMuteSender, isMuted, muteValue } from "@/lib/tracker/email/mute";
import { assessmentKey, buildPayload, defaultTicks, newAppDefaults, stepKey } from "@/lib/tracker/email/payload";
import { buildReview, category, countByCategory } from "@/lib/tracker/email/review";
import { fromRow, gmailLink, SNIPPET_MAX, snippetOf, toRow } from "@/lib/tracker/email/rows";
import { emailTrail } from "@/lib/tracker/email/trail";
import type { EmailMessage } from "@/lib/tracker/format";
import { local, makeAccept, makeApp, makeAssessment, makeEmailMessage, resetFixtureIds } from "../helpers/fixtures";
import { mail } from "../helpers/email";

beforeEach(resetFixtureIds);

// ---- made-up mails in real senders' shapes (see email-group.test.ts) ----
let n = 0;
const at = (day: number, hour = 12) => local(2026, 9, day, hour);

const confirmation = (company: string, role: string, day: number) =>
  analyze(
    mail({
      gmailId: `m${++n}`,
      threadId: `t${n}`,
      fromAddress: "no-reply@us.greenhouse-mail.io",
      subject: `Your application for ${role} at ${company}`,
      text: `Hi Sam, thank you for applying to the ${role} position at ${company}. We received your application.`,
      receivedAt: at(day),
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

const oaInvite = (company: string, role: string, day: number) =>
  analyze(
    mail({
      gmailId: `m${++n}`,
      threadId: `t${n}`,
      fromAddress: "support@hackerrankforwork.com",
      subject: `Your HackerRank ${role} Test Invitation`,
      text: `Thank you for your interest in joining ${company}! We're excited to invite you to take the HackerRank coding test assessment.`,
      receivedAt: at(day),
      links: [{ url: "https://www.hackerrank.com/test/abc", label: "Start Test" }],
    })
  );

// Stores an analyzed mail the way a scan would, and reads it back.
const stored = (a: Analyzed, extra: Partial<EmailMessage> = {}) =>
  makeEmailMessage({ ...(toRow(a) as Partial<EmailMessage>), id: `row-${a.facts.gmailId}`, ...extra });

const rowIdOf = (gmailId: string) => `row-${gmailId}`;

// What a card shows, without the email objects themselves.
const shape = (g: JobGroup) => ({
  key: g.key,
  target: g.target.type,
  ready: g.ready,
  nothingToDo: g.nothingToDo,
  steps: g.steps.map((s) => [s.status, s.at, s.apply]),
  assessments: g.assessments.map((a) => [a.kind, a.title, a.link, a.dueAt, a.completedAt, a.apply]),
  fills: g.fills.map((f) => [f.field, f.value]),
});

describe("rows: storing and reading back", () => {
  it("never stores an ignored email", () => {
    expect(toRow(analyze(mail({ fromAddress: "news@somestore.example", subject: "Big sale", text: "Save 30%" })))).toBeNull();
  });

  it("keeps a short snippet, never the body, and never splits an emoji", () => {
    expect(snippetOf("  Hello\n\n there  ")).toBe("Hello there");
    const long = `${"x".repeat(SNIPPET_MAX - 2)}😀😀😀 and more`;
    const cut = snippetOf(long);
    expect(Array.from(cut).length).toBeLessThanOrEqual(SNIPPET_MAX);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // no lone high surrogate
  });

  it("groups stored emails exactly like freshly scanned ones", () => {
    const fresh = [
      confirmation("Globex", "Backend Intern", 20),
      oaInvite("Globex", "Backend Intern", 22),
      rejection("Globex", "Backend Intern", 29),
      rejection("Initech", "Data Intern", 25),
    ];
    const apps = [makeApp({ company: "Initech", role: "Data Intern" })];
    const back = fresh.map((a) => fromRow(stored(a)));
    expect(groupIntoJobs(back, apps, [], []).map(shape)).toEqual(groupIntoJobs(fresh, apps, [], []).map(shape));
  });

  it("reads Postgres timestamps back as the ISO strings the rules compare", () => {
    const row = makeEmailMessage({ received_at: "2026-09-28T12:00:00+00:00", due_at: "2026-10-01T03:59:00+00:00" });
    const a = fromRow(row);
    expect(a.facts.receivedAt).toBe("2026-09-28T12:00:00.000Z");
    expect(a.fields.dueAt).toBe("2026-10-01T03:59:00.000Z");
  });

  it("links a digest's part to the Gmail message it came from", () => {
    expect(gmailLink("18f0abc#2")).toBe("https://mail.google.com/mail/u/0/#all/18f0abc");
  });
});

describe("mutes", () => {
  it("a sender mute matches that address only", () => {
    const a = confirmation("Globex", "Backend Intern", 20);
    expect(isMuted(a, [{ kind: "sender", value: muteValue("sender", " No-Reply@US.Greenhouse-Mail.io ") }])).toBe(true);
    expect(isMuted(a, [{ kind: "sender", value: "careers@globex.example" }])).toBe(false);
  });

  it("a company mute matches the company however it's written", () => {
    const a = confirmation("Globex Inc.", "Backend Intern", 20);
    expect(isMuted(a, [{ kind: "company", value: "Globex" }])).toBe(true);
    expect(isMuted(a, [{ kind: "company", value: "Initech" }])).toBe(false);
  });

  it("won't mute an ATS or assessment platform's address, which sends for many companies", () => {
    expect(canMuteSender("no-reply@us.greenhouse-mail.io")).toBe(false);
    expect(canMuteSender("support@hackerrankforwork.com")).toBe(false);
    expect(canMuteSender("newsletter@globex.example")).toBe(true);
  });
});

describe("buildReview", () => {
  it("shows pending, unmuted emails and counts the muted ones", () => {
    const rows = [
      stored(confirmation("Globex", "Backend Intern", 20)),
      stored(confirmation("Initech", "Data Intern", 21)),
      stored(rejection("Umbrella", "QA Intern", 22), { state: "dismissed" }),
      stored(rejection("Hooli", "ML Intern", 23), { state: "accepted" }),
    ];
    const r = buildReview(rows, [{ kind: "company", value: "Initech" }], [], [], []);
    expect(r.groups.map((g) => g.target.type === "new" && g.target.company)).toEqual(["Globex"]);
    expect(r.muted).toBe(1);
    expect([...r.rowIdOf.values()]).toEqual([rows[0].id]);
  });

  it("sorts cards into the filter chips", () => {
    const app = makeApp({ company: "Globex", role: "Backend Intern", status: "rejected", status_changed_at: at(10) });
    const a = makeApp({ company: "Initech", role: "Backend Intern" });
    const b = makeApp({ company: "Initech", role: "Data Intern" });
    const groups = groupIntoJobs(
      [
        rejection("Globex", "Backend Intern", 20), // already rejected: nothing to do
        rejection("Hooli", "ML Intern", 21), // untracked: new
        oaInvite("Umbrella", "QA Intern", 22), // untracked: new
        analyze(mail({ gmailId: "z", fromAddress: "no-reply@us.greenhouse-mail.io", subject: "Thank you for applying to Initech", text: "Thanks for applying to Initech.", receivedAt: at(23) })),
      ],
      [app, a, b],
      [],
      []
    );
    expect(groups.map(category).sort()).toEqual(["new", "new", "nothing", "pick"]);
    expect(countByCategory(groups)).toEqual({ all: 4, new: 2, updates: 0, pick: 1, nothing: 1 });
  });
});

describe("retarget", () => {
  it("re-plans a picked card against the chosen application", () => {
    const a = makeApp({ company: "Initech", role: "Backend Intern" });
    const b = makeApp({ company: "Initech", role: "Data Intern" });
    const reject = analyze(mail({ gmailId: "z", fromAddress: "no-reply@us.greenhouse-mail.io", subject: "Your application to Initech", text: "Thanks for applying to Initech. Unfortunately, we have decided not to move forward with your application.", receivedAt: at(23) }));
    const [pick] = groupIntoJobs([reject], [a, b], [], []);
    expect(pick.target.type).toBe("pick");

    const onB = retarget(pick, { type: "existing", application: b }, [], []);
    expect(onB.ready).toBe(true);
    expect(onB.steps.map((s) => [s.status, s.apply])).toEqual([["rejected", true]]);

    expect(retarget(pick, { type: "new", company: "Initech", role: null }, [], []).ready).toBe(false);
    expect(retarget(pick, { type: "new", company: "Initech", role: "Ops Intern" }, [], []).ready).toBe(true);
  });
});

describe("buildPayload", () => {
  it("a new job: created as applied on the confirmation's day, then each ticked step", () => {
    const [g] = groupIntoJobs(
      [confirmation("Globex", "Backend Intern", 20), oaInvite("Globex", "Backend Intern", 22), rejection("Globex", "Backend Intern", 29)],
      [],
      [],
      []
    );
    const p = buildPayload(g, defaultTicks(g), rowIdOf);
    expect(p.application_id).toBeUndefined();
    expect(p.new_application).toEqual({
      company: "Globex",
      role: "Backend Intern",
      url: null,
      applied_on: "2026-09-20",
      status_changed_at: at(20),
    });
    expect(p.steps).toEqual([
      { status: "oa", at: at(22) },
      { status: "rejected", at: at(29) },
    ]);
    expect(p.assessments).toEqual([
      expect.objectContaining({ kind: "oa", link: "https://www.hackerrank.com/test/abc", completed_at: null }),
    ]);
    expect(p.message_ids).toEqual(g.emails.map((e) => rowIdOf(e.facts.gmailId)));
  });

  it("with no confirmation, the new row is dated by its first email", () => {
    const [g] = groupIntoJobs([rejection("Hooli", "ML Intern", 25)], [], [], []);
    const p = buildPayload(g, defaultTicks(g), rowIdOf);
    expect(p.new_application).toMatchObject({ applied_on: "2026-09-25", status_changed_at: at(25) });
    expect(p.steps).toEqual([{ status: "rejected", at: at(25) }]);
  });

  it("leaves out what was unticked, but still consumes every email on the card", () => {
    const [g] = groupIntoJobs([confirmation("Globex", "Backend Intern", 20), oaInvite("Globex", "Backend Intern", 22)], [], [], []);
    const ticks = defaultTicks(g);
    ticks.delete(stepKey(g.steps.find((s) => s.status === "oa")!));
    ticks.delete(assessmentKey(0));
    const p = buildPayload(g, ticks, rowIdOf);
    expect(p.steps).toEqual([]);
    expect(p.assessments).toEqual([]);
    expect(p.message_ids).toHaveLength(2);
  });

  it("uses the card's company and role inputs, and refuses a new row without them", () => {
    const [g] = groupIntoJobs([rejection("Hooli", "ML Intern", 25)], [], [], []);
    expect(buildPayload(g, defaultTicks(g), rowIdOf, { company: " Hooli ", role: " swe ml " }).new_application).toMatchObject({ company: "Hooli", role: "swe ml" });
    const roleless: JobGroup = { ...g, target: { type: "new", company: "Hooli", role: null } };
    expect(() => buildPayload(roleless, defaultTicks(roleless), rowIdOf)).toThrow(/company and a role/);
  });

  it("refuses a card that still needs a pick", () => {
    const [g] = groupIntoJobs([rejection("Hooli", "ML Intern", 25)], [], [], []);
    const pick: JobGroup = { ...g, target: { type: "pick", candidates: [], company: "Hooli", role: null } };
    expect(() => buildPayload(pick, defaultTicks(pick), rowIdOf)).toThrow(/Pick an application/);
  });

  it("a tracked job: its id, the steps, and fills guarded by the date the page saw", () => {
    const app = makeApp({
      company: "Globex",
      role: "Backend Intern",
      applied_on: "2026-09-27",
      created_at: local(2026, 9, 27, 9),
      status: "rejected",
      status_changed_at: null,
    });
    const [g] = groupIntoJobs([confirmation("Globex", "Backend Intern", 20), rejection("Globex", "Backend Intern", 29)], [app], [], []);
    const p = buildPayload(g, defaultTicks(g), rowIdOf);
    expect(p.application_id).toBe(app.id);
    expect(p.new_application).toBeUndefined();
    expect(p.fill).toEqual({ status_changed_at: at(29), applied_on: { from: "2026-09-27", to: "2026-09-20" } });
  });

  it("fills an existing pending assessment rather than adding one", () => {
    const app = makeApp({ company: "Globex", role: "Backend Intern", status: "oa" });
    const oa = makeAssessment({ application_id: app.id, kind: "oa", status: "pending", link: null });
    const [g] = groupIntoJobs([oaInvite("Globex", "Backend Intern", 22)], [app], [oa], []);
    expect(buildPayload(g, defaultTicks(g), rowIdOf).assessments).toEqual([
      { id: oa.id, link: "https://www.hackerrank.com/test/abc", due_at: null, completed_at: null },
    ]);
  });

  it("a new card's role starts out tidied like the add form's", () => {
    const [g] = groupIntoJobs([rejection("Hooli", "ML Intern", 25)], [], [], []);
    const card: JobGroup = { ...g, target: { type: "new", company: "Hooli", role: "Software Engineer Intern, Test Automation (Summer 2027)" } };
    expect(newAppDefaults(card)).toEqual({ company: "Hooli", role: "SWE, Test Automation" });
  });

  it("…and follows the Gmail tab's trim options", () => {
    const [g] = groupIntoJobs([rejection("Hooli", "ML Intern", 25)], [], [], []);
    const card: JobGroup = { ...g, target: { type: "new", company: "Hooli", role: "Software Engineer Intern (Summer 2027)" } };
    expect(newAppDefaults(card, { term: true, intern: false, shorten: false }).role).toBe("Software Engineer Intern");
  });
});

describe("emailTrail", () => {
  const app = makeApp({ id: "app-x", updated_at: "2026-09-29T12:00:00.000Z" });

  it("lists the emails accepted onto the row, newest first", () => {
    const old = makeEmailMessage({ application_id: "app-x", state: "accepted", received_at: "2026-09-20T12:00:00.000Z" });
    const recent = makeEmailMessage({ application_id: "app-x", state: "accepted", received_at: "2026-09-29T12:00:00.000Z" });
    const pending = makeEmailMessage({ application_id: "app-x", state: "pending" });
    const other = makeEmailMessage({ application_id: "app-y", state: "accepted" });
    expect(emailTrail(app, [old, pending, recent, other], []).emails).toEqual([recent, old]);
  });

  it("offers undo for the newest accept, unless the row was edited after it", () => {
    const older = makeAccept({ application_id: "app-x", created_at: "2026-09-25T12:00:00.000Z" });
    const newest = makeAccept({ application_id: "app-x", created_at: "2026-09-29T12:00:00.000Z" });
    const undone = makeAccept({ application_id: "app-x", created_at: "2026-09-30T12:00:00.000Z", undone_at: "2026-09-30T13:00:00.000Z" });
    expect(emailTrail(app, [], [older, newest, undone])).toMatchObject({ accept: newest, undoable: true });
    const edited = { ...app, updated_at: "2026-09-29T15:00:00.000Z" };
    expect(emailTrail(edited, [], [older, newest])).toMatchObject({ accept: newest, undoable: false });
    expect(emailTrail(app, [], [])).toEqual({ emails: [], accept: null, undoable: false });
  });

  it("after undoing the newer accept, the older one is next, unless the row was edited after that undo", () => {
    const older = makeAccept({ application_id: "app-x", created_at: "2026-09-25T12:00:00.000Z" });
    const undone = makeAccept({ application_id: "app-x", created_at: "2026-09-27T12:00:00.000Z", undone_at: "2026-09-29T12:00:00.000Z" });
    // The undo itself stamped the row at 12:00.
    expect(emailTrail(app, [], [older, undone])).toMatchObject({ accept: older, undoable: true });
    expect(emailTrail({ ...app, updated_at: "2026-09-29T13:00:00.000Z" }, [], [older, undone])).toMatchObject({ accept: older, undoable: false });
  });
});
