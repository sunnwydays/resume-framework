import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  normalizeHeader,
  parseDate,
  parseDateTime,
  parseDifficulty,
  parseMinutes,
  parseOutcome,
  parseQuestions,
  parseStatus,
} from "@/lib/tracker/io";

const isRealDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

describe("normalizeHeader", () => {
  it.each([
    ["Date\n(dd/mm/yy)", "date"],
    ["Response (Drop Down List)", "response"],
    ["Interview Time, Date & Interviewer Name", "interview time date interviewer name"],
    ["  Company  ", "company"],
    ["Link to Job Advert", "link to job advert"],
    ["Duration (min)", "duration"],
    [null, ""],
    [undefined, ""],
    [5, "5"],
  ])("%j -> %j", (input, expected) => expect(normalizeHeader(input)).toBe(expected));
});

describe("parseDate", () => {
  describe("ISO", () => {
    it.each([
      ["2026-09-25", "2026-09-25"],
      ["2026-9-5", "2026-09-05"],
      ["2026-09-25T10:00:00Z", "2026-09-25"],
      ["2028-02-29", "2028-02-29"],
    ])("%j -> %j", (input, expected) => expect(parseDate(input)).toBe(expected));
  });

  describe("slashed dates are day-first, like the old sheet", () => {
    it.each([
      ["25/09/26", "2026-09-25"],
      ["25/09/2026", "2026-09-25"],
      ["5/9/26", "2026-09-05"],
      ["25.09.2026", "2026-09-25"],
      ["25-09-2026", "2026-09-25"],
      ["03/04/26", "2026-04-03"], // ambiguous: day first
      ["12/12/26", "2026-12-12"],
      ["29/02/2028", "2028-02-29"],
    ])("%j -> %j", (input, expected) => expect(parseDate(input)).toBe(expected));
  });

  describe("month-first when the 'month' can't be a month", () => {
    it.each([
      ["09/25/26", "2026-09-25"],
      ["12/31/2026", "2026-12-31"],
      ["1/13/26", "2026-01-13"],
      ["09-25-2026", "2026-09-25"],
    ])("%j -> %j", (input, expected) => expect(parseDate(input)).toBe(expected));
  });

  describe("impossible dates are null, never an invalid string", () => {
    it.each([
      "31/02/26",
      "30/02/2026",
      "32/01/26",
      "00/10/26",
      "13/13/26",
      "2026-02-30",
      "2026-13-01",
      "2026-00-10",
      "2026-04-31",
      "29/02/2027",
    ])("%j", (input) => expect(parseDate(input)).toBeNull());
  });

  describe("Excel serial numbers", () => {
    it("reads numbers", () => {
      expect(parseDate(45658)).toBe("2025-01-01");
      expect(parseDate(46290)).toBe("2026-09-25");
    });
    it("ignores the time part", () => {
      expect(parseDate(46290.75)).toBe("2026-09-25");
    });
    it("reads the same number when it arrives as text (a CSV)", () => {
      expect(parseDate("46290")).toBe("2026-09-25");
    });
  });

  describe("written-out dates", () => {
    it.each([
      ["Sep 25, 2026", "2026-09-25"],
      ["25 Sep 2026", "2026-09-25"],
      ["September 25 2026", "2026-09-25"],
    ])("%j -> %j", (input, expected) => expect(parseDate(input)).toBe(expected));
  });

  describe("not a date", () => {
    it.each(["", "   ", "TBD", "n/a", "asap", "soon", "5", "12", "99999999", 5, 0, -3, 1e12])("%j", (input) =>
      expect(parseDate(input)).toBeNull()
    );
    it.each([null, undefined])("%j", (input) => expect(parseDate(input)).toBeNull());
  });

  it("only ever returns null or a real calendar date", () => {
    const input = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.double({ noNaN: false }),
      fc.tuple(fc.integer({ min: 0, max: 40 }), fc.integer({ min: 0, max: 40 }), fc.integer({ min: 0, max: 2200 }), fc.constantFrom("/", "-", ".")).map(
        ([a, b, c, sep]) => `${a}${sep}${b}${sep}${c}`
      ),
      fc.tuple(fc.integer({ min: 1000, max: 3000 }), fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 40 })).map(
        ([y, m, d]) => `${y}-${m}-${d}`
      )
    );
    fc.assert(
      fc.property(input, (value) => {
        const out = parseDate(value);
        if (out !== null) {
          expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(isRealDate(out)).toBe(true);
        }
      }),
      { numRuns: 2000 }
    );
  });
});

describe("parseDateTime", () => {
  it("keeps an ISO timestamp's instant", () => {
    expect(parseDateTime("2026-09-25T14:30:00Z")).toBe("2026-09-25T14:30:00.000Z");
    expect(parseDateTime("2026-09-25T10:00:00-04:00")).toBe("2026-09-25T14:00:00.000Z");
  });
  it("turns a bare date into 23:59 local that day (a deadline)", () => {
    const expected = new Date(2026, 8, 25, 23, 59).toISOString();
    expect(parseDateTime("2026-09-25")).toBe(expected);
    expect(parseDateTime("25/09/26")).toBe(expected);
    expect(parseDateTime("09/25/26")).toBe(expected);
    expect(parseDateTime(46290)).toBe(expected);
    expect(parseDateTime("46290")).toBe(expected);
  });
  it("reads an Excel serial's time as local wall-clock time", () => {
    expect(parseDateTime(46290.5)).toBe(new Date(2026, 8, 25, 12, 0).toISOString());
    expect(parseDateTime(46290.25)).toBe(new Date(2026, 8, 25, 6, 0).toISOString());
    expect(parseDateTime("46290.5")).toBe(new Date(2026, 8, 25, 12, 0).toISOString());
  });
  it.each(["", "  ", "soon", "TBD", "2026-13-40T10:00:00", "31/02/26"])("null for %j", (input) =>
    expect(parseDateTime(input)).toBeNull()
  );
  it.each([null, undefined])("null for %j", (input) => expect(parseDateTime(input)).toBeNull());

  it("only ever returns null or a valid ISO timestamp", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.integer(), fc.double()), (value) => {
        const out = parseDateTime(value);
        if (out !== null) expect(Number.isNaN(new Date(out).getTime())).toBe(false);
      }),
      { numRuns: 1000 }
    );
  });
});

describe("parseStatus", () => {
  it.each([
    ["", "applied"],
    ["Applied", "applied"],
    ["applied", "applied"],
    ["OA", "oa"],
    ["Video interview", "video_interview"],
    ["video_interview", "video_interview"],
    ["Interview", "interview"],
    ["Offer", "offer"],
    ["Rejected", "rejected"],
    ["Withdrawn", "withdrawn"],
  ])("exact %j -> %s", (input, expected) => {
    expect(parseStatus(input)).toEqual({ status: expected, known: true });
  });

  it.each([
    ["Rejected - no feedback", "rejected"],
    ["Declined", "rejected"],
    ["Unsuccessful", "rejected"],
    ["Rejection email", "rejected"],
    ["Withdrew", "withdrawn"],
    ["I withdrew", "withdrawn"],
    ["Offer received!", "offer"],
    ["HireVue video", "video_interview"],
    ["Video call", "video_interview"],
    ["Phone interview", "interview"],
    ["Technical Interview", "interview"],
    ["Online assessment", "oa"],
    ["HackerRank", "oa"],
    ["CodeSignal", "oa"],
    ["Submitted", "applied"],
    ["Pending", "applied"],
    ["Waiting", "applied"],
    ["  OA  ", "oa"],
  ])("fuzzy %j -> %s", (input, expected) => {
    expect(parseStatus(input)).toEqual({ status: expected, known: true });
  });

  it("flags what it cannot read, and falls back to applied", () => {
    expect(parseStatus("Ghosted")).toEqual({ status: "applied", known: false });
    expect(parseStatus("???")).toEqual({ status: "applied", known: false });
  });

  it("does not mistake words that merely contain 'oa'", () => {
    expect(parseStatus("Goal").known).toBe(false);
  });
});

describe("parseDifficulty", () => {
  it.each([
    ["4", 4],
    ["1", 1],
    ["5", 5],
    ["4/5", 4],
    ["2/5", 2],
    ["8/10", 4],
    ["3.5", 4],
    ["0", 1], // clamped
    ["9", 5], // clamped
    ["easy", 2],
    ["Simple", 2],
    ["Medium", 3],
    ["moderate", 3],
    ["average", 3],
    ["hard", 4],
    ["Difficult", 4],
    ["tough", 4],
    ["very hard", 5],
    ["brutal", 5],
    ["very easy", 1],
    ["trivial", 1],
  ])("%j -> %j", (input, expected) => expect(parseDifficulty(input)).toBe(expected));

  it.each(["", "  ", "n/a", "tbd", "?", "0/0", "3/0"])("null for %j", (input) =>
    expect(parseDifficulty(input)).toBeNull()
  );

  it("is always null or a whole number from 1 to 5", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const v = parseDifficulty(input);
        expect(v === null || (Number.isInteger(v) && v >= 1 && v <= 5)).toBe(true);
      }),
      { numRuns: 1000 }
    );
    fc.assert(
      fc.property(fc.integer({ min: -5, max: 100 }), fc.integer({ min: -5, max: 100 }), (a, b) => {
        const v = parseDifficulty(`${a}/${b}`);
        expect(v === null || (Number.isInteger(v) && v >= 1 && v <= 5)).toBe(true);
      })
    );
  });
});

describe("parseOutcome", () => {
  it.each([
    ["Failed", "failed"],
    ["FAILED", "failed"],
    ["Rejected", "failed"],
    ["Unsuccessful", "failed"],
    ["Didn't pass", "failed"],
    ["did not pass", "failed"],
    ["Passed", "passed"],
    ["Advanced", "passed"],
    ["Next round", "passed"],
    ["Moved on", "passed"],
    ["Offer", "passed"],
    ["Successful", "passed"],
    ["Waiting", "waiting"],
    ["Pending", "waiting"],
    ["TBD", "waiting"],
    ["Awaiting results", "waiting"],
    ["Unknown", "waiting"],
  ])("%j -> %s", (input, expected) => expect(parseOutcome(input)).toBe(expected));

  it("failure wins over pass words ('Unsuccessful', 'did not pass')", () => {
    expect(parseOutcome("Unsuccessful")).toBe("failed");
    expect(parseOutcome("Did not pass")).toBe("failed");
  });
  it.each(["", "n/a", "maybe"])("null for %j", (input) => expect(parseOutcome(input)).toBeNull());
});

describe("parseQuestions", () => {
  it("one question, no answer", () => {
    expect(parseQuestions("Reverse a linked list", "expected")).toEqual([
      { source: "expected", question: "Reverse a linked list", answer: null },
    ]);
  });
  it("splits an answer off at → or ->", () => {
    expect(parseQuestions("Q1 → A1\nQ2 -> A2", "asked")).toEqual([
      { source: "asked", question: "Q1", answer: "A1" },
      { source: "asked", question: "Q2", answer: "A2" },
    ]);
  });
  it("strips bullets and numbering", () => {
    const text = "- one\n* two\n• three\n1. four\n2) five";
    expect(parseQuestions(text, "expected").map((q) => q.question)).toEqual(["one", "two", "three", "four", "five"]);
  });
  it("skips blank lines and handles Windows line endings", () => {
    expect(parseQuestions("a\r\n\r\n  \r\nb\r\n", "expected").map((q) => q.question)).toEqual(["a", "b"]);
  });
  it("keeps further arrows inside the answer", () => {
    expect(parseQuestions("Q → A → B", "expected")[0]).toEqual({ source: "expected", question: "Q", answer: "A → B" });
  });
  it("drops lines with no question text", () => {
    expect(parseQuestions("→ just an answer", "expected")).toEqual([]);
  });
  it("trims whitespace", () => {
    expect(parseQuestions("   Q   →   A   ", "expected")[0]).toMatchObject({ question: "Q", answer: "A" });
  });
  it("empty input gives no questions", () => {
    expect(parseQuestions("", "expected")).toEqual([]);
    expect(parseQuestions("  \n ", "expected")).toEqual([]);
  });
  it("never produces an empty question (the database rejects those)", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        for (const q of parseQuestions(text, "expected")) expect(q.question.trim()).not.toBe("");
      })
    );
  });
});

describe("parseMinutes (assessment durations)", () => {
  it.each([
    ["90", 90],
    ["30", 30],
    ["0", 0],
    ["1h", 60],
    ["1 hr", 60],
    ["2 hrs", 120],
    ["1 hour", 60],
    ["1.5h", 90],
    ["1.5 hours", 90],
    ["1h 30m", 90],
    ["1h30m", 90],
    ["1 hour 30 minutes", 90],
    ["1:30", 90],
    ["45m", 45],
    ["45 min", 45],
    ["45 mins", 45],
    ["60 minutes", 60],
    ["approx 60 minutes", 60],
  ])("%j -> %j", (input, expected) => expect(parseMinutes(input)).toBe(expected));

  it.each(["", "  ", "n/a", "TBD", "unlimited"])("null for %j", (input) => expect(parseMinutes(input)).toBeNull());

  it("is always null or a non-negative whole number", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const v = parseMinutes(input);
        expect(v === null || (Number.isInteger(v) && v >= 0)).toBe(true);
      }),
      { numRuns: 1000 }
    );
  });
});
