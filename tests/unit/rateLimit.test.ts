import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "@/lib/rateLimit";

const HOUR = 3_600_000;
let n = 0;
const freshKey = () => `client-${++n}`; // the log is module state, so each test gets its own key

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("checkRateLimit", () => {
  it("allows the first 55 requests in an hour, then refuses", () => {
    const key = freshKey();
    for (let i = 0; i < 55; i++) expect(checkRateLimit(key), `request ${i + 1}`).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(checkRateLimit(key)).toEqual({ allowed: false, retryAfterSeconds: 3600 });
  });

  it("says how long until the window resets, counting down", () => {
    const key = freshKey();
    for (let i = 0; i < 55; i++) checkRateLimit(key);
    vi.advanceTimersByTime(10 * 60_000);
    expect(checkRateLimit(key).retryAfterSeconds).toBe(3000);
    vi.advanceTimersByTime(50 * 60_000 - 1500);
    expect(checkRateLimit(key).retryAfterSeconds).toBe(2); // rounded up
  });

  it("starts a fresh window once the hour is over", () => {
    const key = freshKey();
    for (let i = 0; i < 55; i++) checkRateLimit(key);
    expect(checkRateLimit(key).allowed).toBe(false);
    vi.advanceTimersByTime(HOUR + 1);
    expect(checkRateLimit(key)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    for (let i = 0; i < 54; i++) expect(checkRateLimit(key).allowed).toBe(true);
    expect(checkRateLimit(key).allowed).toBe(false);
  });

  it("exactly an hour later is still the same window", () => {
    const key = freshKey();
    for (let i = 0; i < 55; i++) checkRateLimit(key);
    vi.advanceTimersByTime(HOUR);
    expect(checkRateLimit(key)).toEqual({ allowed: false, retryAfterSeconds: 0 });
  });

  it("keeps each client's count separate", () => {
    const a = freshKey();
    const b = freshKey();
    for (let i = 0; i < 55; i++) checkRateLimit(a);
    expect(checkRateLimit(a).allowed).toBe(false);
    expect(checkRateLimit(b).allowed).toBe(true);
  });

  it("refused requests don't extend the window", () => {
    const key = freshKey();
    for (let i = 0; i < 55; i++) checkRateLimit(key);
    for (let i = 0; i < 20; i++) checkRateLimit(key);
    vi.advanceTimersByTime(HOUR + 1);
    expect(checkRateLimit(key).allowed).toBe(true);
  });
});
