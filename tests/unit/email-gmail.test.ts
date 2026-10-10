import { describe, expect, it } from "vitest";
import { reusable, type HeldToken } from "@/lib/tracker/email/gmail";

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
