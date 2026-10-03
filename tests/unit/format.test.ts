import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_KINDS,
  OUTCOMES,
  QUESTION_SOURCES,
  STATUSES,
  STATUS_META,
  formatClock,
  formatDate,
  formatDateTime,
  formatHours,
  fromDatetimeLocal,
  kindLabel,
  parseDuration,
  relativeDue,
  sameUrl,
  statusLabel,
  toDatetimeLocal,
  todayISO,
} from "@/lib/tracker/format";
import { local } from "../helpers/fixtures";

describe("todayISO", () => {
  it("uses the local calendar day, not the UTC one", () => {
    expect(todayISO(new Date(2026, 9, 3, 0, 5).getTime())).toBe("2026-10-03");
    expect(todayISO(new Date(2026, 9, 3, 23, 55).getTime())).toBe("2026-10-03");
  });
  it("zero-pads month and day", () => {
    expect(todayISO(new Date(2026, 0, 5, 12).getTime())).toBe("2026-01-05");
  });
  it("defaults to now", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatClock", () => {
  it.each([
    [0, "0:00:00"],
    [5, "0:00:05"],
    [65, "0:01:05"],
    [3600, "1:00:00"],
    [5025, "1:23:45"],
    [36_000 + 61, "10:01:01"],
  ])("%i s -> %s", (s, text) => expect(formatClock(s)).toBe(text));

  it("clamps negatives and floors fractions", () => {
    expect(formatClock(-30)).toBe("0:00:00");
    expect(formatClock(59.9)).toBe("0:00:59");
  });
});

describe("formatHours", () => {
  it.each([
    [0, "0m"],
    [59, "0m"],
    [300, "5m"],
    [3540, "59m"],
    [3600, "1h 0m"],
    [5025, "1h 23m"],
    [-10, "0m"],
  ])("%i s -> %s", (s, text) => expect(formatHours(s)).toBe(text));
});

describe("parseDuration", () => {
  it.each([
    ["1:30", 5400],
    ["0:45", 2700],
    ["1:30:15", 5415],
    ["90", 5400], // bare number = minutes
    ["1.5", 90], // ...even with a decimal
    ["1.5h", 5400],
    ["2h", 7200],
    ["1h 30m", 5400],
    ["1h30m", 5400],
    ["45m", 2700],
    ["45 min", 2700],
    ["  45M  ", 2700],
    ["0", 0],
  ])("%j -> %j seconds", (input, seconds) => expect(parseDuration(input)).toBe(seconds));

  it.each(["", "   ", "abc", "1:75", "h", "m", "1x", "-5", "1:2:3:4", "1.5.2"])(
    "rejects %j",
    (input) => expect(parseDuration(input)).toBeNull()
  );

  it("reads back what formatClock wrote", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99 * 3600 }), (seconds) => {
        expect(parseDuration(formatClock(seconds))).toBe(seconds);
      })
    );
  });

  it("never throws and never returns a negative", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const v = parseDuration(input);
        expect(v === null || (Number.isFinite(v) && v >= 0)).toBe(true);
      })
    );
  });
});

describe("formatDate", () => {
  it("renders dd/mm/yy", () => {
    expect(formatDate("2026-09-25")).toBe("25/09/26");
  });
  it("does not shift a bare date by time zone", () => {
    expect(formatDate("2026-01-01")).toBe("01/01/26");
    expect(formatDate("2026-12-31")).toBe("31/12/26");
  });
  it("reads timestamps in local time", () => {
    expect(formatDate(local(2026, 3, 8, 23, 30))).toBe("08/03/26");
  });
  it.each([null, undefined, ""])("shows a dash for %j", (v) => expect(formatDate(v)).toBe("—"));
  it("passes unparseable text through", () => {
    expect(formatDate("whenever")).toBe("whenever");
  });
});

describe("formatDateTime", () => {
  it("adds local hours and minutes", () => {
    expect(formatDateTime(local(2026, 9, 25, 9, 5))).toBe("25/09/26 09:05");
  });
  it("handles missing and invalid values", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("nope")).toBe("nope");
  });
});

describe("relativeDue", () => {
  const now = Date.UTC(2026, 9, 3, 12);
  const hours = (h: number) => new Date(now + h * 3_600_000).toISOString();
  it.each([
    [5, "due in 5h"],
    [23, "due in 23h"],
    [24, "due in 1d"],
    [72, "due in 3d"],
    [-2, "overdue 2h"],
    [-48, "overdue 2d"],
  ])("%i hours -> %s", (h, text) => expect(relativeDue(hours(h), now)).toBe(text));
});

describe("datetime-local conversion", () => {
  it("round-trips a local timestamp to the minute", () => {
    const iso = local(2026, 10, 3, 14, 30);
    expect(toDatetimeLocal(iso)).toBe("2026-10-03T14:30");
    expect(fromDatetimeLocal("2026-10-03T14:30")).toBe(iso);
  });
  it("returns empty / null for empty or invalid input", () => {
    expect(toDatetimeLocal(null)).toBe("");
    expect(toDatetimeLocal("garbage")).toBe("");
    expect(fromDatetimeLocal("")).toBeNull();
    expect(fromDatetimeLocal("garbage")).toBeNull();
  });
});

describe("sameUrl", () => {
  it("ignores tracking params, www, trailing slash and protocol case", () => {
    expect(sameUrl("https://www.acme.com/jobs/1/", "https://acme.com/jobs/1?utm_source=x&src=y")).toBe(true);
    expect(sameUrl("https://acme.com/jobs/1?gh_src=abc", "https://acme.com/jobs/1")).toBe(true);
    expect(sameUrl("https://acme.com/jobs/1?ref=a&source=b", "https://acme.com/jobs/1")).toBe(true);
  });
  it("keeps meaningful params", () => {
    expect(sameUrl("https://acme.com/jobs?id=1", "https://acme.com/jobs?id=2")).toBe(false);
  });
  it("distinguishes different paths and hosts", () => {
    expect(sameUrl("https://acme.com/jobs/1", "https://acme.com/jobs/2")).toBe(false);
    expect(sameUrl("https://acme.com/jobs/1", "https://other.com/jobs/1")).toBe(false);
  });
  it("falls back to trimmed text for non-URLs", () => {
    expect(sameUrl(" not a url ", "not a url")).toBe(true);
    expect(sameUrl("not a url", "another")).toBe(false);
  });
});

describe("labels", () => {
  it("every status has a label and style", () => {
    for (const s of STATUSES) {
      expect(STATUS_META[s].label).toBeTruthy();
      expect(statusLabel(s)).toBe(STATUS_META[s].label);
    }
  });
  it("unknown values fall back to the raw text", () => {
    expect(statusLabel("mystery")).toBe("mystery");
    expect(kindLabel("mystery")).toBe("mystery");
  });
  it("kinds map to labels", () => {
    expect(kindLabel("video_interview")).toBe("Video interview");
    expect(Object.keys(ASSESSMENT_KINDS)).toEqual(["oa", "video_interview", "interview"]);
  });
  it("pins the enum values the database check constraints allow", () => {
    // The database tests compare these against the live constraints too.
    expect([...STATUSES]).toEqual(["applied", "oa", "video_interview", "interview", "offer", "rejected", "withdrawn"]);
    expect(Object.keys(OUTCOMES)).toEqual(["waiting", "passed", "failed"]);
    expect(Object.keys(QUESTION_SOURCES)).toEqual(["expected", "asked"]);
  });
});
