import { describe, expect, it } from "vitest";
import { isQuotaMessage, quotaBackoff, reusable, type HeldToken } from "@/lib/tracker/email/gmail";

describe("quota handling", () => {
  it("reads Gmail's per-minute quota 403 as retryable, not as a setup problem", () => {
    expect(isQuotaMessage("Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'")).toBe(true);
    expect(isQuotaMessage("User-rate limit exceeded.")).toBe(true);
    expect(isQuotaMessage("Gmail API has not been used in project 1 before or it is disabled.")).toBe(false);
    expect(isQuotaMessage(undefined)).toBe(false);
  });

  it("backs off exponentially, capped at 20s", () => {
    expect([0, 1, 2, 3].map(quotaBackoff)).toEqual([1000, 2000, 4000, 8000]);
    expect(quotaBackoff(10)).toBe(20_000);
  });
});

describe("reusable (which Google token a scan can keep using)", () => {
  const now = Date.UTC(2026, 9, 10, 12);
  const held = (partial: Partial<HeldToken>): HeldToken => ({
    value: "tok",
    expiresAt: now + 30 * 60_000,
    modify: false,
    askedModify: false,
    ...partial,
  });

  it("asks Google when there's no token, or it's about to expire", () => {
    expect(reusable(null, "read", now)).toBe(false);
    expect(reusable(held({ expiresAt: now + 30_000 }), "read", now)).toBe(false);
  });

  it("a read-only token does for reading, not for marking mail read", () => {
    expect(reusable(held({}), "read", now)).toBe(true);
    expect(reusable(held({}), "modify", now)).toBe(false);
  });

  it("a modify token does for both", () => {
    const token = held({ modify: true, askedModify: true });
    expect(reusable(token, "read", now)).toBe(true);
    expect(reusable(token, "modify", now)).toBe(true);
  });

  it("doesn't re-ask for modify once the user declined it in Google's consent", () => {
    expect(reusable(held({ askedModify: true }), "modify", now)).toBe(true);
  });
});
