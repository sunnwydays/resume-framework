import { describe, expect, it } from "vitest";
import { DEFAULT_POSTING_FILTERS, type PostingFilters } from "@/lib/tracker/postings/filters";
import { parseFilters, parseSort, serializeFilters, serializeSort } from "@/lib/tracker/postings/persist";

describe("postings filters persistence", () => {
  it("round-trips filters, including the Set fields", () => {
    const f: PostingFilters = {
      ...DEFAULT_POSTING_FILTERS,
      state: "saved",
      regions: new Set(["us", "canada"]),
      terms: new Set(),
      roleTypes: new Set(["data"]),
      showRelists: true,
      hideTracked: false,
      query: "acme",
    };
    expect(parseFilters(serializeFilters(f))).toEqual(f);
  });

  it("round-trips the defaults", () => {
    expect(parseFilters(serializeFilters(DEFAULT_POSTING_FILTERS))).toEqual(DEFAULT_POSTING_FILTERS);
  });

  it.each([null, "", "not json", "[]", "null", "42"])("reads %j as the defaults", (raw) => {
    expect(parseFilters(raw)).toEqual(DEFAULT_POSTING_FILTERS);
  });

  it("keeps the default for a field of the wrong type", () => {
    const got = parseFilters(JSON.stringify({ state: 5, regions: "us", terms: [1], showRelists: "yes", query: "x" }));
    expect(got).toEqual({ ...DEFAULT_POSTING_FILTERS, query: "x" });
  });
});

describe("postings sort persistence", () => {
  const keys = ["posted", "company"] as const;
  const fallback = { key: "posted", dir: "desc" } as const;

  it("round-trips", () => {
    expect(parseSort(serializeSort({ key: "company", dir: "asc" }), keys, fallback)).toEqual({ key: "company", dir: "asc" });
  });

  it.each([null, "x", '{"key":"nope","dir":"asc"}', '{"key":"company","dir":"up"}', "null"])("reads %j as the fallback", (raw) => {
    expect(parseSort(raw, keys, fallback)).toEqual(fallback);
  });
});
