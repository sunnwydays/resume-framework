import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseAtsJson } from "@/lib/atsJson";
import { buildAtsReport } from "@/lib/atsReport";

const sample = readFileSync("lib/samples/jane_doe.json", "utf-8");

describe("parseAtsJson", () => {
  it("accepts a full Affinda response and keeps meta", () => {
    const out = parseAtsJson(sample);
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.data.rawText.length).toBeGreaterThan(0);
    expect(() => buildAtsReport(out)).not.toThrow();
  });

  it("accepts a bare data object and a one-item array", () => {
    const data = JSON.stringify(JSON.parse(sample).data);
    for (const text of [data, `[${data}]`, `[${sample}]`]) {
      const out = parseAtsJson(text);
      expect("error" in out).toBe(false);
    }
  });

  it("defaults fields the UI iterates over", () => {
    const out = parseAtsJson('{"rawText":"hi"}');
    if ("error" in out) throw new Error(out.error);
    expect(out.data.workExperience).toEqual([]);
    expect(out.data.contact).toEqual({});
    expect(() => buildAtsReport(out)).not.toThrow();
  });

  it("rejects empty, invalid, non-object and unrelated JSON", () => {
    for (const text of ["", "   ", "{nope", "42", "[1,2]", '{"foo":1}', '{"error":"x"}']) {
      expect("error" in parseAtsJson(text)).toBe(true);
    }
  });
});
