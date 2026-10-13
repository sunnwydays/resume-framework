import { describe, expect, it } from "vitest";
import { postingUndo, removesCreatedApp, undoMessage } from "@/lib/tracker/postings/undo";
import { makeApp, makeAssessment, makePosting } from "../helpers/fixtures";

describe("postingUndo", () => {
  it("remembers the state and link the posting had before", () => {
    const posting = makePosting({ state: "saved", application_id: null, company: "Vandelay Industries", role: "Software Intern" });
    const undo = postingUndo(posting, "dismissed");
    expect(undo.before).toEqual({ state: "saved", application_id: null });
    expect(undo.created).toBeNull();
    expect(undoMessage(undo)).toBe("Dismissed Vandelay Industries · Software Intern.");
  });
});

describe("removesCreatedApp", () => {
  const posting = makePosting({ state: "new" });

  it("removes the application Applied added, while untouched", () => {
    const app = makeApp({ updated_at: "2026-10-13T12:00:00.000Z" });
    expect(removesCreatedApp(postingUndo(posting, "applied", app), [app], [])).toBe(true);
  });

  it("keeps an application that already existed (Applied only linked it)", () => {
    const app = makeApp();
    expect(removesCreatedApp(postingUndo(posting, "applied", null), [app], [])).toBe(false);
  });

  it("keeps it once edited", () => {
    const app = makeApp({ updated_at: "2026-10-13T12:00:00.000Z" });
    const undo = postingUndo(posting, "applied", app);
    expect(removesCreatedApp(undo, [{ ...app, updated_at: "2026-10-13T12:05:00.000Z" }], [])).toBe(false);
  });

  it("keeps it once it has an assessment", () => {
    const app = makeApp();
    const undo = postingUndo(posting, "applied", app);
    expect(removesCreatedApp(undo, [app], [makeAssessment({ application_id: app.id })])).toBe(false);
  });

  it("does nothing when the application is already gone", () => {
    const app = makeApp();
    expect(removesCreatedApp(postingUndo(posting, "applied", app), [], [])).toBe(false);
  });
});
