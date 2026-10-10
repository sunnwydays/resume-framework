import { describe, expect, it } from "vitest";
import { postingEligibility } from "@/lib/tracker/postings/eligibility";
import { postingRegion, type Region } from "@/lib/tracker/postings/region";

const region = (location: string | null, extra: { role?: string; pay?: string | null } = {}) =>
  postingRegion({ role: extra.role ?? "Software Engineer Intern", location, pay: extra.pay ?? null });

describe("postingRegion", () => {
  it.each([
    ["Toronto, ON", "canada"],
    ["Dorval, QC", "canada"],
    ["Vancouver, BC", "canada"],
    ["Toronto, Ontario, Canada", "canada"],
    ["Canada", "canada"],
    ["Pleasanton, CA", "us"],
    ["Omaha, NE", "us"],
    ["Austin, TX (Hybrid)", "us"],
    ["Washington, DC", "us"],
    ["San Francisco, CA, United States", "us"],
    ["Remote, US", "us"],
    ["United States", "us"],
    ["London, UK", "other"],
    ["Bengaluru, India", "other"],
    ["Berlin, Germany", "other"],
    ["Remote", "unknown"],
    ["Multiple Locations", "unknown"],
  ])("%s -> %s", (location, expected) => expect(region(location).region).toBe(expected));

  it("reads CA as California, not Canada", () => {
    expect(region("Mountain View, CA").region).toBe("us");
    expect(region("Ontario, CA").region).toBe("us");
  });

  it("a bare $ is not a US signal, so a Montreal posting stays not US", () => {
    expect(region("Montreal, QC", { pay: "$18/hr" }).region).toBe("canada");
    expect(region("Remote", { pay: "$18/hr" }).region).toBe("unknown");
    expect(region(null, { pay: "$47K/yr - $91K/yr" }).region).toBe("unknown");
  });

  it("with no usable location, CA$ pay or a Canadian place in the title says not US", () => {
    expect(region("Remote", { pay: "CA$40/hr - CA$45/hr" }).region).toBe("canada");
    expect(region(null, { role: "Software Engineer Intern (Waterloo)" }).region).toBe("canada");
    expect(region("Multiple Locations", { role: "Intern - Canada" }).region).toBe("canada");
  });

  it("with no usable location, a title naming the US says US", () => {
    expect(region("Remote", { role: "Software Engineer Intern (US)" }).region).toBe("us");
    expect(region(null, { role: "Intern, United States" }).region).toBe("us");
  });

  it("a location beats the pay and the title", () => {
    expect(region("Omaha, NE", { pay: "CA$30/hr" }).region).toBe("us");
    expect(region("Toronto, ON", { role: "Intern (US)" }).region).toBe("canada");
  });

  it("Canada and elsewhere are separate regions", () => {
    expect(region("Toronto, ON").region).toBe("canada");
    expect(region("Dublin, Ireland").region).toBe("other");
    expect(region("Mexico City, Mexico").region).toBe("other");
  });

  it("says why", () => {
    expect(region("Toronto, ON").why).toContain("ON");
    expect(region("Remote").why).toMatch(/doesn't say/);
  });
});

describe("postingEligibility", () => {
  const e = (company: string, role = "Software Engineer Intern", categories: string | null = null, where: Region = "us") =>
    postingEligibility({ company, role, categories }, where);

  it("a defense contractor in the US is out", () => {
    for (const company of ["RTX", "Raytheon Technologies", "Lockheed Martin Corporation", "CACI", "Booz Allen Hamilton", "Northrop Grumman"]) {
      expect(e(company).level, company).toBe("no");
    }
    expect(e("RTX").why).toContain("RTX");
  });

  it("a clearance or citizenship title is out, whoever posts it", () => {
    for (const role of [
      "Software Engineer Intern (TS/SCI clearance required)",
      "Intern - Secret clearance",
      "Software Intern, U.S. citizens only",
      "Embedded Intern (ITAR)",
      "Intern, US Person",
    ]) {
      expect(e("Vandelay Industries", role).level, role).toBe("no");
    }
  });

  it("words that only look like the rules are fine", () => {
    expect(e("Vandelay Industries", "Software Engineer Intern, Guitar Tech").level).toBe("ok");
    expect(e("Vandelay Industries", "Intern, Secrets Management").level).toBe("ok");
  });

  it("an aerospace or government industry is a check, not a no", () => {
    expect(e("Vandelay Industries", "Software Engineer Intern", "Aerospace · Public Company")).toMatchObject({ level: "check" });
    expect(e("Vandelay Industries", "Intern", "Government · Nonprofit").level).toBe("check");
    expect(e("Vandelay Industries", "Intern", "Defense · Private").level).toBe("check");
    expect(e("Vandelay Industries", "Intern", "Apps · Public Company").level).toBe("ok");
  });

  it("only US postings can be flagged", () => {
    expect(e("RTX", "Intern", "Defense", "canada")).toEqual({ level: "ok" });
    expect(e("RTX", "Intern (clearance)", null, "unknown")).toEqual({ level: "ok" });
    expect(postingEligibility({ company: "Vandelay Industries", role: "Intern", categories: null, citizen_only: true }, "canada")).toEqual({ level: "ok" });
  });

  it("the posting page's citizen-only or clearance flag is out, even when the title and industry say nothing", () => {
    const flagged = (flags: { citizen_only?: boolean | null; clearance_required?: boolean | null }, categories: string | null = null) =>
      postingEligibility({ company: "Vandelay Industries", role: "Web Interface Software Engineer", categories, ...flags }, "us");
    expect(flagged({ citizen_only: true })).toMatchObject({ level: "no", why: expect.stringContaining("citizens only") });
    expect(flagged({ clearance_required: true })).toMatchObject({ level: "no", why: expect.stringContaining("clearance") });
    // It beats the softer industry "check".
    expect(flagged({ citizen_only: true }, "Government · Public Company").level).toBe("no");
    // Unread (null) or false is not a flag.
    expect(flagged({ citizen_only: null, clearance_required: null }).level).toBe("ok");
    expect(flagged({ citizen_only: false, clearance_required: false }).level).toBe("ok");
  });
});
