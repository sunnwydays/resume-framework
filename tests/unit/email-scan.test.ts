import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/tracker/email/group";
import { defaultScanFrom, scanNudge, scanStart, summarizeScan } from "@/lib/tracker/email/scan";
import { local } from "../helpers/fixtures";
import { mail } from "../helpers/email";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("defaultScanFrom", () => {
  it("starts two days before the last scan, on the local calendar", () => {
    expect(defaultScanFrom({ scanned_at: local(2026, 10, 3, 0, 30) }, [])).toBe("2026-10-01");
    expect(defaultScanFrom({ scanned_at: local(2026, 10, 3, 23, 30) }, [])).toBe("2026-10-01");
  });

  it("first scan: from the earliest tracked application", () => {
    expect(defaultScanFrom(null, [{ applied_on: "2026-09-12" }, { applied_on: "2026-08-30" }, { applied_on: "2026-09-02" }])).toBe("2026-08-30");
  });

  it("first scan with nothing tracked: a month back", () => {
    expect(defaultScanFrom(null, [], new Date(2026, 9, 3, 9).getTime())).toBe("2026-09-03");
  });

  it("scanStart is local midnight of that day", () => {
    const d = scanStart("2026-09-20");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 8, 20, 0, 0]);
  });
});

describe("scanNudge", () => {
  const now = new Date(2026, 9, 3, 12).getTime();
  const before = (ms: number) => new Date(now - ms).toISOString();

  it.each([
    [10 * 60_000, "Last scanned just now", false],
    [5 * HOUR, "Last scanned 5h ago", false],
    [DAY + HOUR, "Last scanned 1 day ago", false],
    [6 * DAY, "Last scanned 6 days ago", false],
    [7 * DAY, "Last scanned 7 days ago", true],
  ])("%d ms ago -> %s", (ms, text, stale) => {
    expect(scanNudge(before(ms), 0, now)).toEqual({ text, stale });
  });

  it("adds what's waiting for review", () => {
    expect(scanNudge(before(2 * HOUR), 12, now).text).toBe("Last scanned 2h ago · 12 to review");
  });

  it("never scanned isn't an alarm", () => {
    expect(scanNudge(null, 0, now)).toEqual({ text: "Gmail not scanned yet", stale: false });
  });
});

describe("summarizeScan", () => {
  const ats = "no-reply@us.greenhouse-mail.io";
  const confirm = analyze(mail({ fromAddress: ats, subject: "Your application for Backend Intern at Globex", text: "Thank you for applying to the Backend Intern position at Globex." }));
  const reject = analyze(mail({ fromAddress: ats, subject: "Your application for Backend Intern at Globex", text: "Thank you for applying to Globex. Unfortunately, we have decided not to move forward with your application." }));
  const junk = analyze(mail({ fromAddress: "news@somestore.example", subject: "Big sale", text: "Save 30%" }));

  it("counts each kind, then ignored, muted and already-stored ones", () => {
    expect(summarizeScan({ analyzed: [confirm, confirm, reject, junk], muted: 1, saved: 1 })).toBe(
      "2 confirmations, 1 rejection · 1 ignored · 1 muted · 1 seen before"
    );
  });

  it("counts pending emails the current rules re-read", () => {
    expect(summarizeScan({ analyzed: [confirm, confirm, reject], muted: 0, saved: 1, updated: 1 })).toBe(
      "2 confirmations, 1 rejection · 1 re-read · 1 seen before"
    );
  });

  it("says so when nothing was job mail", () => {
    expect(summarizeScan({ analyzed: [junk], muted: 0, saved: 0 })).toBe("No job emails · 1 ignored");
  });
});
