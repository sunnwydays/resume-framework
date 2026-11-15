import { describe, expect, it } from "vitest";
import { DEFAULT_POSTING_FILTERS, isDefaultPostingFilters, matchesPostingFilters } from "@/lib/tracker/postings/filters";
import { buildPostingViews } from "@/lib/tracker/postings/view";
import { buildToday } from "@/lib/tracker/today";
import type { PostingMute } from "@/lib/tracker/format";
import { makePosting } from "../helpers/fixtures";

const mute = (company: string): PostingMute => ({ id: `m-${company}`, user_id: "user-1", company, created_at: "2026-11-01T00:00:00Z" });
const ANY = { ...DEFAULT_POSTING_FILTERS, terms: new Set<string>(), lengths: new Set<never>(), levels: new Set<never>() };
const one = (p: ReturnType<typeof makePosting>, mutes: PostingMute[]) => buildPostingViews([p], [], mutes)[0];

describe("hidden companies", () => {
  it("a new posting from a muted company is hidden, a close spelling too", () => {
    expect(one(makePosting({ company: "Globex" }), [mute("Globex")]).mutedCompany?.company).toBe("Globex");
    expect(one(makePosting({ company: "Globex Inc." }), [mute("globex")]).mutedCompany).not.toBeNull();
    expect(one(makePosting({ company: "Initech" }), [mute("Globex")]).mutedCompany).toBeNull();
  });

  it("only new postings: saved, applied and dismissed ones are never hidden", () => {
    for (const state of ["saved", "applied", "dismissed"] as const) {
      expect(one(makePosting({ company: "Globex", state }), [mute("Globex")]).mutedCompany).toBeNull();
    }
  });

  it("an applied posting at the company doesn't hide the others unless muted", () => {
    const views = buildPostingViews([makePosting({ company: "Globex", state: "applied" }), makePosting({ company: "Globex" })], []);
    expect(views.every((v) => v.mutedCompany === null)).toBe(true);
  });

  it("the filter hides them until 'Show hidden companies' is on", () => {
    const v = one(makePosting({ company: "Globex" }), [mute("Globex")]);
    expect(matchesPostingFilters(v, ANY)).toBe(false);
    expect(matchesPostingFilters(v, { ...ANY, showMutedCompanies: true })).toBe(true);
    expect(isDefaultPostingFilters({ ...DEFAULT_POSTING_FILTERS, showMutedCompanies: true })).toBe(false);
  });

  it("Today doesn't count them", () => {
    const input = { applications: [], assessments: [], moves: [], pendingEmails: 0, lastScanAt: null, now: Date.now() };
    const postings = [makePosting({ company: "Globex", first_seen_at: new Date().toISOString() })];
    expect(buildToday({ ...input, postings, allPostings: true }).newPostings).toBe(1);
    expect(buildToday({ ...input, postings, postingMutes: [mute("Globex")], allPostings: true }).newPostings).toBe(0);
  });
});
