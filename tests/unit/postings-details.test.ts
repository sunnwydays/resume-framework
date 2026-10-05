import { describe, expect, it, vi } from "vitest";
import { fetchPostingDetails, isJobrightJobUrl, parseJobrightPage } from "@/lib/tracker/postings/details";

// Shaped like a real posting page (the job sits in __NEXT_DATA__), with made-up
// companies and text.
function page(job: Record<string, unknown> | null): string {
  const data = { props: { pageProps: { dataSource: { jobResult: job } } } };
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

describe("parseJobrightPage", () => {
  it("reads the start line and the sentence naming the length", () => {
    const html = page({
      jobTitle: "Intern Developer",
      internHireDate: "Start in 2027 Winter",
      skillSummaries: [
        "This is a hybrid position.",
        "This is a full-time, 8, or 12-month position, starting January 2027",
        "Must be within 12 months of graduating",
      ],
    });
    expect(parseJobrightPage(html)).toEqual({
      startText: "Start in 2027 Winter",
      lengthText: "This is a full-time, 8, or 12-month position, starting January 2027",
    });
  });

  it("finds the length in a sentence of a longer text", () => {
    const html = page({ benefitsSummaries: ["Free lunch. 16-week internship program running January 4th–April 23rd, 2027. Gym."] });
    expect(parseJobrightPage(html)).toEqual({ startText: null, lengthText: "16-week internship program running January 4th–April 23rd, 2027." });
  });

  it("is a read page with nothing stated when the job says neither", () => {
    expect(parseJobrightPage(page({ jobTitle: "Intern", internHireDate: "Start immediately" }))).toEqual({ startText: null, lengthText: null });
  });

  it("is null when it isn't a posting page, so the read is retried later", () => {
    expect(parseJobrightPage("<html>Just a moment...</html>")).toBeNull();
    expect(parseJobrightPage(page(null))).toBeNull();
    expect(parseJobrightPage('<script id="__NEXT_DATA__">{broken</script>')).toBeNull();
  });
});

describe("isJobrightJobUrl", () => {
  it("only accepts Jobright posting links", () => {
    expect(isJobrightJobUrl("https://jobright.ai/jobs/info/0123456789abcdef01234567")).toBe(true);
    expect(isJobrightJobUrl("http://jobright.ai/jobs/info/0123456789abcdef01234567")).toBe(false);
    expect(isJobrightJobUrl("https://jobright.ai.evil.example/jobs/info/0123456789abcdef01234567")).toBe(false);
    expect(isJobrightJobUrl("https://jobright.ai/jobs/info/0123456789abcdef01234567/../../x")).toBe(false);
    expect(isJobrightJobUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
  });
});

describe("fetchPostingDetails", () => {
  const url = "https://jobright.ai/jobs/info/0123456789abcdef01234567";

  it("fetches and parses", async () => {
    const fetchImpl = vi.fn(async () => new Response(page({ internHireDate: "Start in 2027 Summer" }), { status: 200 }));
    expect(await fetchPostingDetails(url, fetchImpl as unknown as typeof fetch)).toEqual({ startText: "Start in 2027 Summer", lengthText: null });
  });

  it("is null on an error status, a thrown fetch, or a URL it won't fetch", async () => {
    expect(await fetchPostingDetails(url, (async () => new Response("", { status: 403 })) as typeof fetch)).toBeNull();
    expect(
      await fetchPostingDetails(url, (async () => {
        throw new Error("network");
      }) as typeof fetch)
    ).toBeNull();
    const never = vi.fn();
    expect(await fetchPostingDetails("https://example.com/x", never as unknown as typeof fetch)).toBeNull();
    expect(never).not.toHaveBeenCalled();
  });
});
