import { describe, expect, it } from "vitest";
import {
  DRAFT_MAX_FIELD,
  DRAFT_MAX_TEMPLATE,
  DRAFT_SYSTEM,
  buildDraftPrompt,
  parseDraftRequest,
  type DraftRequest,
} from "@/lib/tracker/draftPrompt";

const ok = (body: unknown): DraftRequest => {
  const r = parseDraftRequest(body);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const err = (body: unknown) => {
  const r = parseDraftRequest(body);
  if (r.ok) throw new Error("expected an error");
  return r.error;
};

describe("parseDraftRequest", () => {
  it("accepts a normal request and trims it", () => {
    expect(ok({ channel: "linkedin", fields: { name: " Priya ", company: "Acme" }, templateBody: " Hi {name} ", notes: "" })).toEqual({
      channel: "linkedin",
      fields: { name: "Priya", company: "Acme" },
      templateBody: "Hi {name}",
      notes: "",
    });
  });

  it("drops unknown and empty fields", () => {
    expect(ok({ channel: "email", fields: { company: "Acme", hook: "", evil: "x" } }).fields).toEqual({ company: "Acme" });
  });

  it.each([
    [null, "Expected a JSON object"],
    ["text", "Expected a JSON object"],
    [{ channel: "fax", fields: { name: "a" } }, "Unknown channel"],
    [{ fields: { name: "a" } }, "Unknown channel"],
    [{ channel: "linkedin", fields: "Priya" }, "fields must be an object"],
    [{ channel: "linkedin", fields: { name: 5 } }, "Invalid name (text, at most 1000 characters)"],
    [{ channel: "linkedin", fields: { hook: "only a hook" } }, "Fill in at least their name or company"],
  ])("rejects %j", (body, message) => expect(err(body)).toBe(message));

  it("caps every field's length", () => {
    const long = "x".repeat(DRAFT_MAX_FIELD + 1);
    expect(err({ channel: "linkedin", fields: { name: "a", hook: long } })).toBe("Invalid hook (text, at most 1000 characters)");
    expect(err({ channel: "linkedin", fields: { name: "a" }, notes: long })).toBe("Invalid notes (text, at most 1000 characters)");
    expect(err({ channel: "linkedin", fields: { name: "a" }, templateBody: "x".repeat(DRAFT_MAX_TEMPLATE + 1) })).toBe("Invalid template (at most 4000 characters)");
    expect(ok({ channel: "linkedin", fields: { name: "x".repeat(DRAFT_MAX_FIELD) } }).fields.name).toHaveLength(DRAFT_MAX_FIELD);
  });
});

describe("buildDraftPrompt", () => {
  const base: DraftRequest = {
    channel: "linkedin",
    fields: { name: "Priya", company: "Acme", about: "a CS student", hook: "Loved your search post.", ask: "Quick chat?" },
    templateBody: "Hi {name}, {hook} {ask}",
    notes: "met at a hackathon",
  };

  it("uses the fixed system prompt, which forbids inventing facts", () => {
    const { system } = buildDraftPrompt(base);
    expect(system).toBe(DRAFT_SYSTEM);
    expect(system).toMatch(/Never invent/);
    expect(system).toMatch(/message only/);
  });

  it("includes every filled field, the notes and the template", () => {
    const { user } = buildDraftPrompt(base);
    expect(user).toContain("Channel: LinkedIn DM");
    expect(user).toContain("Their name: Priya");
    expect(user).toContain("Company: Acme");
    expect(user).toContain("About you (one line): a CS student");
    expect(user).toContain("Hook (why them, specifically): Loved your search post.");
    expect(user).toContain("The ask: Quick chat?");
    expect(user).toContain("Extra context from the sender: met at a hackathon");
    expect(user).toContain("<template>\nHi {name}, {hook} {ask}\n</template>");
  });

  it("leaves out what's empty", () => {
    const { user } = buildDraftPrompt({ channel: "warm", fields: { company: "Acme" }, templateBody: "", notes: "" });
    expect(user).not.toContain("Their name");
    expect(user).not.toContain("Extra context");
    expect(user).not.toContain("<template>");
  });

  it.each([
    ["linkedin", /under 300 characters/],
    ["email", /Subject: \.\.\./],
    ["warm", /3 to 5 sentences/],
  ] as const)("gives a %s length rule", (channel, rule) => {
    expect(buildDraftPrompt({ ...base, channel }).user).toMatch(rule);
  });
});
