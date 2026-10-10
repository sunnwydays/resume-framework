import { describe, expect, it } from "vitest";
import { industryLabel } from "@/lib/tracker/postings/industry";

describe("industryLabel", () => {
  it.each([
    ["Electronics · Public Company", "Electronics"],
    ["Apps · Growth Stage", "Apps"],
    ["Finance · Late Stage", "Finance"],
    ["Aerospace", "Aerospace"],
  ])("keeps only the industry: %s", (input, expected) => {
    expect(industryLabel(input)).toBe(expected);
  });

  it.each([
    ["Artificial Intelligence (AI) · Growth Stage", "AI"],
    ["Information Technology · Public Company", "IT"],
    ["Telecommunications · Public Company", "Telecom"],
    ["Telecom & Communications", "Telecom"],
    ["Cloud Computing · Late Stage", "Cloud"],
    ["Media and Entertainment", "Media"],
  ])("shortens long names: %s", (input, expected) => {
    expect(industryLabel(input)).toBe(expected);
  });
});
