import { describe, expect, it } from "vitest";
import { isAllowedEmail, parseAllowedEmails } from "@/lib/tracker/access";

describe("parseAllowedEmails", () => {
  it("splits on commas, trims and lowercases", () => {
    expect(parseAllowedEmails(" A@x.com, b@Y.com ,,")).toEqual(["a@x.com", "b@y.com"]);
  });
  it("treats unset and blank as empty", () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
    expect(parseAllowedEmails("  ")).toEqual([]);
  });
});

describe("isAllowedEmail", () => {
  const prod = (raw: string | undefined, email: string | null | undefined) =>
    isAllowedEmail(email, { raw, production: true });

  it("matches case-insensitively", () => {
    expect(prod("me@x.com", "ME@X.com")).toBe(true);
    expect(prod("Me@X.com, you@x.com", "you@x.com")).toBe(true);
  });
  it("denies anyone not listed, and requires an exact match", () => {
    expect(prod("me@x.com", "other@x.com")).toBe(false);
    expect(prod("me@x.com", "me@x.com.evil.com")).toBe(false);
    expect(prod("me@x.com", "xme@x.com")).toBe(false);
  });
  it("denies a missing email", () => {
    expect(prod("me@x.com", null)).toBe(false);
    expect(prod("me@x.com", undefined)).toBe(false);
    expect(prod("me@x.com", "")).toBe(false);
  });
  it("fails closed in production when the list is unset or empty", () => {
    expect(prod(undefined, "me@x.com")).toBe(false);
    expect(prod("", "me@x.com")).toBe(false);
    expect(prod(" , ", "me@x.com")).toBe(false);
  });
  it("in development an unset list allows any signed-in user", () => {
    expect(isAllowedEmail("me@x.com", { raw: undefined, production: false })).toBe(true);
    expect(isAllowedEmail(undefined, { raw: undefined, production: false })).toBe(true);
  });
  it("in development a set list still applies", () => {
    expect(isAllowedEmail("other@x.com", { raw: "me@x.com", production: false })).toBe(false);
  });
});
