import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applicationSortValue,
  assessmentSortValue,
  nextPending,
  nextStep,
  resultRank,
  sortRows,
  type SortState,
} from "@/lib/tracker/sorting";
import { ROLE_TYPE_ORDER } from "@/lib/tracker/roles";
import { makeApp, makeAssessment, makeQuestion } from "../helpers/fixtures";

type Row = { id: string; v: string | number | null };
const rows = (...vs: (string | number | null)[]): Row[] => vs.map((v, i) => ({ id: `r${i}`, v }));
const byV = (r: Row) => r.v;
const sorted = (input: Row[], dir: SortState<"v">["dir"]) => sortRows(input, byV, { key: "v", dir }).map((r) => r.v);

describe("sortRows", () => {
  it("sorts ascending and descending", () => {
    expect(sorted(rows("b", "c", "a"), "asc")).toEqual(["a", "b", "c"]);
    expect(sorted(rows("b", "c", "a"), "desc")).toEqual(["c", "b", "a"]);
  });

  it("puts rows with nothing to sort on last in either direction", () => {
    expect(sorted(rows(null, 2, null, 1), "asc")).toEqual([1, 2, null, null]);
    expect(sorted(rows(null, 2, null, 1), "desc")).toEqual([2, 1, null, null]);
  });

  it("compares numbers as numbers", () => {
    expect(sorted(rows(10, 9, 100, 1), "asc")).toEqual([1, 9, 10, 100]);
  });

  it("orders digits inside text naturally and ignores case", () => {
    expect(sorted(rows("Item 10", "item 2", "Item 1"), "asc")).toEqual(["Item 1", "item 2", "Item 10"]);
  });

  it("keeps ties in input order, both directions", () => {
    const input = [
      { id: "first", v: "same" },
      { id: "second", v: "SAME" },
      { id: "third", v: "same" },
    ];
    for (const dir of ["asc", "desc"] as const) {
      expect(sortRows(input, byV, { key: "v", dir }).map((r) => r.id)).toEqual(["first", "second", "third"]);
    }
  });

  it("does not mutate its input", () => {
    const input = rows("b", "a");
    const copy = [...input];
    sortRows(input, byV, { key: "v", dir: "asc" });
    expect(input).toEqual(copy);
  });

  it("passes the active key to the value function", () => {
    const seen: string[] = [];
    sortRows(rows(1, 2), (_, key: "x" | "y") => (seen.push(key), 0), { key: "y", dir: "asc" });
    expect(new Set(seen)).toEqual(new Set(["y"]));
  });

  it("returns a permutation with all nulls at the end", () => {
    fc.assert(
      fc.property(
        fc.array(fc.option(fc.integer({ min: -50, max: 50 }), { nil: null })),
        fc.constantFrom("asc", "desc"),
        (values, dir) => {
          const input = rows(...values);
          const out = sortRows(input, byV, { key: "v", dir });
          expect(out.map((r) => r.id).sort()).toEqual(input.map((r) => r.id).sort());
          const firstNull = out.findIndex((r) => r.v === null);
          if (firstNull >= 0) expect(out.slice(firstNull).every((r) => r.v === null)).toBe(true);
          const nums = out.filter((r) => r.v !== null).map((r) => r.v as number);
          const expected = [...nums].sort((a, b) => (dir === "asc" ? a - b : b - a));
          expect(nums).toEqual(expected);
        }
      )
    );
  });
});

describe("nextPending / nextStep", () => {
  it("picks the soonest pending one, dated before undated", () => {
    const list = [
      makeAssessment({ id: "undated" }),
      makeAssessment({ id: "late", due_at: "2026-10-20T12:00:00.000Z" }),
      makeAssessment({ id: "soon", due_at: "2026-10-05T12:00:00.000Z" }),
      makeAssessment({ id: "done", status: "completed", due_at: "2026-10-01T12:00:00.000Z" }),
    ];
    expect(nextPending(list)?.id).toBe("soon");
    expect(nextPending(list.filter((a) => a.id === "undated"))?.id).toBe("undated");
  });

  it("is undefined with nothing pending", () => {
    expect(nextPending([])).toBeUndefined();
    expect(nextPending([makeAssessment({ status: "completed" })])).toBeUndefined();
    expect(nextPending([makeAssessment({ outcome: "expired" })])).toBeUndefined();
  });

  it("does not reorder the caller's array", () => {
    const list = [makeAssessment({ id: "b", due_at: "2026-10-09T00:00:00.000Z" }), makeAssessment({ id: "a", due_at: "2026-10-01T00:00:00.000Z" })];
    nextPending(list);
    expect(list.map((a) => a.id)).toEqual(["b", "a"]);
  });

  const now = new Date("2026-10-03T12:00:00.000Z").getTime();
  it("describes a dated step", () => {
    const step = nextStep([makeAssessment({ kind: "video_interview", due_at: "2026-10-06T12:00:00.000Z", important: true })], now);
    expect(step).toEqual({ text: "Video interview · due in 3d", overdue: false, important: true });
  });
  it("flags an overdue step", () => {
    const step = nextStep([makeAssessment({ due_at: "2026-10-01T12:00:00.000Z" })], now);
    expect(step).toEqual({ text: "OA · overdue 2d", overdue: true, important: false });
  });
  it("an undated step has no timing", () => {
    expect(nextStep([makeAssessment({ kind: "interview" })], now)?.text).toBe("Interview");
  });
  it("is null without a pending step", () => {
    expect(nextStep([], now)).toBeNull();
  });
});

describe("applicationSortValue", () => {
  const app = makeApp({ company: "Acme", role: "SWE Robo", applied_on: "2026-09-10", status: "interview" });
  it("simple columns", () => {
    expect(applicationSortValue(app, "company", [])).toBe("Acme");
    expect(applicationSortValue(app, "role", [])).toBe("SWE Robo");
    expect(applicationSortValue(app, "applied", [])).toBe("2026-09-10");
  });
  it("status sorts in pipeline order, not alphabetically", () => {
    const s = (status: string) => applicationSortValue(makeApp({ status }), "status", []) as number;
    expect(s("applied")).toBeLessThan(s("oa"));
    expect(s("oa")).toBeLessThan(s("interview"));
    expect(s("interview")).toBeLessThan(s("offer"));
    expect(s("offer")).toBeLessThan(s("rejected"));
  });
  it("type sorts by role-type order", () => {
    expect(applicationSortValue(app, "type", [])).toBe(ROLE_TYPE_ORDER.robotics);
  });
  it("last change is empty while still 'applied', even if a date is stored", () => {
    const stamped = "2026-09-12T10:00:00.000Z";
    expect(applicationSortValue(makeApp({ status: "applied", status_changed_at: stamped }), "changed", [])).toBeNull();
    expect(applicationSortValue(makeApp({ status: "oa", status_changed_at: stamped }), "changed", [])).toBe(stamped);
    expect(applicationSortValue(makeApp({ status: "oa", status_changed_at: null }), "changed", [])).toBeNull();
  });
  it("next step: none, dated, or undated", () => {
    expect(applicationSortValue(app, "next", [])).toBeNull();
    expect(applicationSortValue(app, "next", [makeAssessment({ status: "completed" })])).toBeNull();
    const due = "2026-10-05T00:00:00.000Z";
    expect(applicationSortValue(app, "next", [makeAssessment({ due_at: due })])).toBe(new Date(due).getTime());
  });
  it("next step: undated steps sort after dated ones, nothing at all last", () => {
    const entries = [
      { app: makeApp({ company: "None" }), asmts: [] },
      { app: makeApp({ company: "Undated" }), asmts: [makeAssessment()] },
      { app: makeApp({ company: "Later" }), asmts: [makeAssessment({ due_at: "2026-10-20T00:00:00.000Z" })] },
      { app: makeApp({ company: "Sooner" }), asmts: [makeAssessment({ due_at: "2026-10-05T00:00:00.000Z" })] },
    ];
    const run = (dir: "asc" | "desc") =>
      sortRows(entries, (e, key: "next") => applicationSortValue(e.app, key, e.asmts), { key: "next", dir }).map(
        (e) => e.app.company
      );
    expect(run("asc")).toEqual(["Sooner", "Later", "Undated", "None"]);
    expect(run("desc")).toEqual(["Undated", "Later", "Sooner", "None"]);
  });
});

describe("resultRank and assessmentSortValue", () => {
  it("orders pending < done < bombed < expired", () => {
    expect(resultRank(makeAssessment({ status: "pending" }))).toBe(0);
    expect(resultRank(makeAssessment({ status: "completed" }))).toBe(1);
    expect(resultRank(makeAssessment({ status: "completed", outcome: "bombed" }))).toBe(2);
    expect(resultRank(makeAssessment({ status: "pending", outcome: "expired" }))).toBe(3);
  });

  it("reads each column", () => {
    const app = makeApp({ company: "Acme", role: "SWE" });
    const a = makeAssessment({ id: "x", title: "Round 1", due_at: "2026-10-05T00:00:00.000Z", difficulty: 4 });
    const priority = new Map([["x", { rank: 2, reason: "" }]]);
    const qs = [makeQuestion(), makeQuestion()];
    const get = (key: Parameters<typeof assessmentSortValue>[1]) => assessmentSortValue(a, key, app, priority, qs);
    expect(get("priority")).toBe(2);
    expect(get("company")).toBe("Acme SWE");
    expect(get("title")).toBe("Round 1");
    expect(get("due")).toBe("2026-10-05T00:00:00.000Z");
    expect(get("difficulty")).toBe(4);
    expect(get("result")).toBe(0);
    expect(get("questions")).toBe(2);
  });

  it("gives null (sorts last) when there is nothing to show", () => {
    const a = makeAssessment({ id: "x" });
    expect(assessmentSortValue(a, "priority", undefined, new Map(), undefined)).toBeNull();
    expect(assessmentSortValue(a, "company", undefined, new Map(), undefined)).toBeNull();
    expect(assessmentSortValue(a, "due", undefined, new Map(), undefined)).toBeNull();
    expect(assessmentSortValue(a, "difficulty", undefined, new Map(), undefined)).toBeNull();
    expect(assessmentSortValue(a, "questions", undefined, new Map(), [])).toBeNull();
  });
});
