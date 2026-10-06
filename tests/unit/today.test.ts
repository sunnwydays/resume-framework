import { describe, expect, it } from "vitest";
import { MAX_ASSESSMENTS, MAX_STEPS, buildToday, showsToday, type TodayInput } from "@/lib/tracker/today";
import { local, makeApp, makeAssessment, makeMove, makePosting } from "../helpers/fixtures";

const NOW = new Date(local(2026, 10, 6, 9)).getTime();
const inHours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

const app = makeApp({ company: "Acme" });
const input = (overrides: Partial<TodayInput> = {}): TodayInput => ({
  applications: [app],
  assessments: [],
  moves: [],
  postings: [],
  pendingEmails: 0,
  lastScanAt: inHours(-2),
  now: NOW,
  ...overrides,
});
const asmt = (overrides = {}) => makeAssessment({ application_id: app.id, ...overrides });

describe("buildToday", () => {
  it("says nothing needs you when there is nothing to do", () => {
    const b = buildToday(input());
    expect(b.empty).toBe(true);
    expect(b.summary).toBe("Nothing needs you today");
    expect(b.assessments).toEqual([]);
    expect(b.steps).toEqual([]);
  });

  it("a stale scan is a nudge, not a task", () => {
    const b = buildToday(input({ lastScanAt: inHours(-24 * 10) }));
    expect(b.empty).toBe(true);
    expect(b.scan.stale).toBe(true);
  });

  describe("assessments", () => {
    it("lists the soonest due first and counts the rest", () => {
      const later = asmt({ title: "Later", due_at: inHours(60) });
      const soon = asmt({ title: "Soon", due_at: inHours(5) });
      const mid = asmt({ title: "Mid", due_at: inHours(30) });
      const last = asmt({ title: "Last", due_at: inHours(90) });
      const b = buildToday(input({ assessments: [later, soon, last, mid] }));
      expect(b.assessments.map((x) => x.assessment.title)).toEqual(["Soon", "Mid", "Later"]);
      expect(b.assessments).toHaveLength(MAX_ASSESSMENTS);
      expect(b.moreAssessments).toBe(1);
      expect(b.assessments[0].application).toBe(app);
      expect(b.assessments[0].reason).toContain("due in 5h");
      expect(b.summary).toBe("4 assessments to do");
    });

    it("skips completed, expired, and rejected-application ones", () => {
      const rejected = makeApp({ status: "rejected" });
      const b = buildToday(
        input({
          applications: [app, rejected],
          assessments: [
            asmt({ status: "completed" }),
            asmt({ outcome: "expired" }),
            makeAssessment({ application_id: rejected.id, due_at: inHours(4) }),
          ],
        })
      );
      expect(b.assessments).toEqual([]);
      expect(b.empty).toBe(true);
    });

    it("keeps an overdue one in play", () => {
      const b = buildToday(input({ assessments: [asmt({ due_at: inHours(-5) })] }));
      expect(b.assessments[0].reason).toContain("overdue 5h");
    });
  });

  describe("people to follow up", () => {
    const quiet = [makeMove({ channel: "project", created_at: inHours(-24), last_touch_at: inHours(-24) })];

    it("includes replies waiting on you, with the move id for the link", () => {
      const m = makeMove({ target: "Priya", waiting_on: "me", stage: "replied", last_touch_at: inHours(-30) });
      const b = buildToday(input({ moves: [...quiet, m] }));
      expect(b.steps.map((s) => s.text)).toEqual(["Reply to Priya"]);
      expect(b.steps[0].moveId).toBe(m.id);
      expect(b.summary).toBe("1 to reply or follow up");
    });

    it("leaves out the weekly habit nudges", () => {
      // No moves at all: nextSteps says "start" and "build"; neither is daily.
      expect(buildToday(input({ moves: [] })).steps).toEqual([]);
      // A few sends short of the weekly target, no recent project.
      const b = buildToday(input({ moves: [makeMove({ created_at: inHours(-24), last_touch_at: inHours(-1) })] }));
      expect(b.steps).toEqual([]);
      expect(b.empty).toBe(true);
    });

    it("caps the list and counts the rest", () => {
      const moves = [
        ...quiet,
        ...Array.from({ length: MAX_STEPS + 2 }, (_, i) =>
          makeMove({ target: `Person ${i}`, waiting_on: "me", stage: "replied", last_touch_at: inHours(-30 - i) })
        ),
      ];
      const b = buildToday(input({ moves }));
      expect(b.steps).toHaveLength(MAX_STEPS);
      expect(b.moreSteps).toBe(2);
    });
  });

  describe("inbox", () => {
    it("reports emails waiting for review", () => {
      const b = buildToday(input({ pendingEmails: 3 }));
      expect(b.empty).toBe(false);
      expect(b.summary).toBe("3 emails to review");
      expect(b.scan.text).toContain("3 to review");
    });

    it("counts only new postings you can take and haven't tracked", () => {
      const postings = [
        makePosting({ company: "Initech" }),
        makePosting({ company: "Hooli", state: "dismissed" }),
        makePosting({ company: "Acme", role: app.role, state: "new" }), // same company and role as a tracked application
        makePosting({ company: "Lockheed Martin", location: "Denver, CO" }), // defense, US
      ];
      const b = buildToday(input({ postings }));
      expect(b.newPostings).toBe(1);
      expect(b.summary).toBe("1 new posting");
    });
  });

  it("joins everything in one line", () => {
    const b = buildToday(
      input({
        assessments: [asmt({ due_at: inHours(3) })],
        pendingEmails: 2,
        postings: [makePosting({ company: "Initech" })],
      })
    );
    expect(b.summary).toBe("1 assessment to do · 2 emails to review · 1 new posting");
  });
});

describe("showsToday", () => {
  it("opens until dismissed, then again the next day", () => {
    expect(showsToday("", NOW)).toBe(true);
    expect(showsToday("2026-10-05", NOW)).toBe(true);
    expect(showsToday("2026-10-06", NOW)).toBe(false);
    expect(showsToday("2026-10-06", new Date(local(2026, 10, 7, 0, 5)).getTime())).toBe(true);
  });
});
