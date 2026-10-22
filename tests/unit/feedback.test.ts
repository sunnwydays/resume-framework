import { beforeEach, describe, expect, it } from "vitest";
import { analyze, groupIntoJobs, retarget, type JobGroup } from "@/lib/tracker/email/group";
import { buildPayload, defaultTicks, newAppDefaults, stepKey } from "@/lib/tracker/email/payload";
import { emailAcceptFeedback, emailDismissFeedback, emailMuteFeedback } from "@/lib/tracker/feedback/email";
import { changedKeys, labelUpdate, toJson } from "@/lib/tracker/feedback/events";
import { draftFeedback, editRatio } from "@/lib/tracker/feedback/draft";
import { importMappingFeedback } from "@/lib/tracker/feedback/import";
import {
  POSTING_DISMISS_REASONS,
  dismissLabelText,
  lateDismissFeedback,
  latestDismissals,
  postingFeedback,
  type DismissEventRow,
} from "@/lib/tracker/feedback/posting";
import { buildImportPlan, type RawSheet } from "@/lib/tracker/io";
import { buildPostingViews } from "@/lib/tracker/postings/view";
import { mail } from "../helpers/email";
import { makeApp, makePosting, resetFixtureIds } from "../helpers/fixtures";

beforeEach(resetFixtureIds);

describe("changedKeys", () => {
  it("lists the keys whose values differ, ignoring order and missing-vs-null", () => {
    expect(changedKeys({ a: 1, b: [1, 2], c: null }, { a: 1, b: [1, 3], d: "x" })).toEqual(["b", "d"]);
    expect(changedKeys({ a: undefined }, { a: null })).toEqual([]);
    expect(changedKeys({}, {})).toEqual([]);
  });
});

describe("dismissed posting labels", () => {
  const row = (over: Partial<DismissEventRow>): DismissEventRow => ({
    id: "ev-1",
    subject_id: "p-1",
    reason: null,
    note: null,
    final: {},
    created_at: "2026-10-20T12:00:00Z",
    undone_at: null,
    ...over,
  });

  it("keeps each posting's newest dismiss that wasn't undone", () => {
    const map = latestDismissals([
      row({ id: "old", reason: "pay", created_at: "2026-10-01T12:00:00Z" }),
      row({ id: "undone", reason: "company", created_at: "2026-10-21T12:00:00Z", undone_at: "2026-10-21T12:01:00Z" }),
      row({ id: "new", reason: "closed", created_at: "2026-10-10T12:00:00Z" }),
      row({ id: "other-posting", subject_id: "p-2" }),
      row({ id: "no-subject", subject_id: null }),
    ]);
    expect(map.get("p-1")).toEqual({ id: "new", reason: "closed", note: null, fix: "" });
    expect(map.get("p-2")?.id).toBe("other-posting");
    expect(map.size).toBe(2);
  });

  it("reads the correction back only for a reason that names a field", () => {
    const map = latestDismissals([
      row({ reason: "wrong-region", final: { region: "US" } }),
      row({ subject_id: "p-2", reason: "pay", final: { region: "US" } }),
    ]);
    expect(map.get("p-1")?.fix).toBe("US");
    expect(map.get("p-2")?.fix).toBe("");
  });

  it("describes the label, leaving out a bare Other when there's a note", () => {
    expect(dismissLabelText(undefined)).toBeNull();
    expect(dismissLabelText({ id: "e", reason: null, note: null, fix: "" })).toBeNull();
    expect(dismissLabelText({ id: "e", reason: "closed", note: null, fix: "" })).toBe("Posting closed");
    expect(dismissLabelText({ id: "e", reason: "wrong-region", note: "remote", fix: "US" })).toBe("Region (should be US) · “remote”");
    expect(dismissLabelText({ id: "e", reason: "other", note: "already applied there", fix: "" })).toBe("“already applied there”");
    expect(dismissLabelText({ id: "e", reason: "other", note: null, fix: "" })).toBe("Other");
  });

  it("flags a dismiss recorded after the fact", () => {
    const [view] = buildPostingViews([makePosting()], []);
    const event = lateDismissFeedback(view);
    expect(event).toMatchObject({ surface: "posting", action: "dismiss", subject_id: view.posting.id });
    expect(event.context).toMatchObject({ recorded_later: true });
    expect((event.context as { posting: unknown }).posting).toBeDefined();
  });
});

describe("toJson", () => {
  it("drops undefined and keeps plain data", () => {
    expect(toJson({ a: 1, b: undefined, c: [new Date("2026-10-01T00:00:00Z")] })).toEqual({ a: 1, c: ["2026-10-01T00:00:00.000Z"] });
  });
});

describe("postingFeedback", () => {
  it("snapshots what the rules said, and the posting without its owner", () => {
    const posting = makePosting({ role: "Software Engineer Intern (Summer 2027)", location: "Toronto, ON", description: "Summary\n- builds things" });
    const [view] = buildPostingViews([posting], []);
    const event = postingFeedback(view, "dismiss");
    expect(event).toMatchObject({ surface: "posting", action: "dismiss", subject_id: posting.id });
    expect(event.guess).toMatchObject({ region: "canada", level: "intern", term: "Summer 2027", eligibility: "ok" });
    const context = event.context as { posting: Record<string, unknown>; tracked_application_id: string | null };
    expect(context.posting.description).toBe("Summary\n- builds things");
    expect(context.posting).not.toHaveProperty("user_id");
    expect(context.tracked_application_id).toBeNull();
  });

  it("notes the application it already matched", () => {
    const app = makeApp({ company: "Vandelay Industries", role: "Software Engineer Intern" });
    const [view] = buildPostingViews([makePosting()], [app]);
    expect((postingFeedback(view, "save").context as { tracked_application_id: string }).tracked_application_id).toBe(app.id);
  });

  it("has unique reason keys, each naming where to look", () => {
    const keys = POSTING_DISMISS_REASONS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(POSTING_DISMISS_REASONS.every((r) => r.rule)).toBe(true);
  });

  it("lets only rule reasons carry a correction, for a field the guess has", () => {
    const view = buildPostingViews([makePosting()], [])[0];
    const guessKeys = Object.keys(postingFeedback(view, "dismiss").guess as object);
    for (const r of POSTING_DISMISS_REASONS.filter((x) => x.field)) {
      expect(r.rule).not.toBe("taste");
      expect(guessKeys).toContain(r.field);
    }
  });

  it("writes a correction into final + changed, and clears it when there is none", () => {
    expect(labelUpdate({ reason: "wrong-region", note: " ", field: "region", correction: " US " })).toEqual({
      reason: "wrong-region",
      note: null,
      final: { region: "US" },
      changed: ["region"],
    });
    expect(labelUpdate({ reason: "company", field: undefined, correction: "x" })).toMatchObject({ final: {}, changed: [] });
    expect(labelUpdate({ reason: "wrong-term", field: "term", correction: "" })).toMatchObject({ final: {}, changed: [] });
  });
});

// ---- Gmail ----
let n = 0;
const confirmation = (company: string, role: string, day = 20) =>
  analyze(
    mail({
      gmailId: `m${++n}`,
      threadId: `t${n}`,
      fromAddress: "no-reply@us.greenhouse-mail.io",
      subject: `Your application for ${role} at ${company}`,
      text: `Hi Sam, thank you for applying to the ${role} position at ${company}. We received your application.`,
      receivedAt: new Date(2026, 8, day, 12).toISOString(),
    })
  );

function acceptArgs(group: JobGroup, over: { card?: JobGroup; ticks?: Set<string>; inputs?: { company: string; role: string } } = {}) {
  const defaults = newAppDefaults(group);
  const card = over.card ?? group;
  const ticks = over.ticks ?? defaultTicks(group);
  const inputs = over.inputs ?? defaults;
  const payload = buildPayload(card, ticks, (id) => `row-${id}`, card.target.type === "new" ? inputs : undefined);
  return { group, card, defaultTicks: defaultTicks(group), ticks, defaults, inputs, payload };
}

describe("emailAcceptFeedback", () => {
  it("records an accept with nothing changed as a confirmation", () => {
    const [group] = groupIntoJobs([confirmation("Globex", "Backend Intern")], [], [], []);
    const event = emailAcceptFeedback(acceptArgs(group));
    expect(event).toMatchObject({ surface: "email", action: "accept", changed: [] });
    expect(event.guess).toMatchObject({ target: "new", company: "Globex" });
    expect(event.subject_id).toBe(group.emails[0].facts.gmailId);
  });

  it("flags an edited company and role on a new application", () => {
    const [group] = groupIntoJobs([confirmation("Globex", "Backend Intern")], [], [], []);
    const event = emailAcceptFeedback(acceptArgs(group, { inputs: { company: "Globex Corp", role: newAppDefaults(group).role } }));
    expect(event.changed).toEqual(["company"]);
    expect(event.guess).toMatchObject({ company: "Globex" });
    expect(event.final).toMatchObject({ company: "Globex Corp" });
  });

  it("flags unticked steps", () => {
    const rejection = analyze(
      mail({
        gmailId: "rej-1",
        threadId: "t-rej",
        fromAddress: "no-reply@us.greenhouse-mail.io",
        subject: "Your application for Backend Intern at Globex",
        text: "Hi Sam, thank you for applying to the Backend Intern position at Globex. Unfortunately, we have decided not to move forward with your application.",
        receivedAt: new Date(2026, 8, 27, 12).toISOString(),
      })
    );
    const [group] = groupIntoJobs([confirmation("Globex", "Backend Intern"), rejection], [], [], []);
    const step = group.steps.find((s) => s.status === "rejected" && s.apply);
    expect(step).toBeTruthy();
    const ticks = defaultTicks(group);
    ticks.delete(stepKey(step!));
    expect(emailAcceptFeedback(acceptArgs(group, { ticks })).changed).toEqual(["ticks"]);
  });

  it("flags a retarget to another application", () => {
    const other = makeApp({ company: "Initech", role: "Backend Intern" });
    const [group] = groupIntoJobs([confirmation("Globex", "Backend Intern")], [], [], []);
    const card = retarget(group, { type: "existing", application: other }, [], []);
    const event = emailAcceptFeedback(acceptArgs(group, { card, ticks: defaultTicks(card) }));
    expect(event.guess).toMatchObject({ target: "new" });
    expect(event.final).toMatchObject({ target: `existing:${other.id}` });
    expect(event.changed).toContain("target");
  });

  it("keeps bulk and the payload in the context, and never the email text", () => {
    const [group] = groupIntoJobs([confirmation("Globex", "Backend Intern")], [], [], []);
    const event = emailAcceptFeedback({ ...acceptArgs(group), bulk: true });
    const context = event.context as { bulk: boolean; payload: unknown; emails: Record<string, unknown>[] };
    expect(context.bulk).toBe(true);
    expect(context.payload).toBeTruthy();
    expect(context.emails[0]).toMatchObject({ gmail_id: group.emails[0].facts.gmailId, kind: "confirmation" });
    expect(JSON.stringify(event)).not.toContain("We received your application");
  });
});

describe("emailDismissFeedback / emailMuteFeedback", () => {
  it("records what was dismissed, singly or in bulk", () => {
    const groups = groupIntoJobs([confirmation("Globex", "Backend Intern"), confirmation("Initech", "Data Intern")], [], [], []);
    const event = emailDismissFeedback(groups, true);
    expect(event).toMatchObject({ surface: "email", action: "dismiss" });
    expect((event.context as { bulk: boolean; groups: unknown[] }).groups).toHaveLength(2);
    expect((event.context as { bulk: boolean }).bulk).toBe(true);
  });

  it("records the mute and the card behind it", () => {
    const [group] = groupIntoJobs([confirmation("Globex", "Backend Intern")], [], [], []);
    expect(emailMuteFeedback("company", "Globex", group)).toMatchObject({ action: "mute", final: { kind: "company", value: "Globex" } });
  });
});

// ---- import ----
const sheet = (rows: unknown[][]): RawSheet => ({ name: "Jobs", rows });
const rows = [
  ["Company", "Role", "Status", "Applied", "Stuff"],
  ["Globex", "Backend Intern", "Applied", "2026-09-01", "hello"],
];

describe("importMappingFeedback", () => {
  it("is a no-change event when the automatic reading stood", () => {
    const auto = buildImportPlan([sheet(rows)], [], []);
    const [event] = importMappingFeedback(auto, auto, "jobs.xlsx");
    expect(event).toMatchObject({ surface: "import", action: "map", subject_id: "Jobs", changed: [] });
  });

  it("flags a column the user pointed somewhere else", () => {
    const auto = buildImportPlan([sheet(rows)], [], []);
    const stuff = auto.sheets[0].columns.find((c) => c.header === "Stuff")!;
    const final = buildImportPlan([sheet(rows)], [], [], { Jobs: { columns: { [stuff.index]: "notes" } } });
    const [event] = importMappingFeedback(auto, final, "jobs.xlsx");
    expect(event.changed).toContain(`col:${stuff.index}`);
  });

  it("flags a sheet read as another type", () => {
    const auto = buildImportPlan([sheet(rows)], [], []);
    const final = buildImportPlan([sheet(rows)], [], [], { Jobs: { kind: "assessments" } });
    expect(importMappingFeedback(auto, final, "jobs.xlsx")[0].changed).toContain("kind");
  });
});

// ---- drafts ----
describe("draftFeedback", () => {
  it("is unchanged when the draft was sent as written", () => {
    const e = draftFeedback("Hi Sam, quick note.", "Hi Sam, quick note. ", { moveId: "m1" });
    expect(e).toMatchObject({ surface: "draft", action: "sent", subject_id: "m1", changed: [] });
  });

  it("records the edit and how much was rewritten", () => {
    const e = draftFeedback("Hi Sam, I loved your talk on compilers.", "Hey Sam, saw your compilers talk.", { moveId: null });
    expect(e.changed).toEqual(["text"]);
    expect((e.final as { edit_ratio: number }).edit_ratio).toBeGreaterThan(0);
    expect(e.subject_id).toBeNull();
  });

  it("scores identical text 0 and unrelated text near 1", () => {
    expect(editRatio("a b c", "a b c")).toBe(0);
    expect(editRatio("a b c", "x y z")).toBe(1);
    expect(editRatio("", "")).toBe(0);
  });
});
