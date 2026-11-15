import { describe, expect, it } from "vitest";
import { applicationFromPosting } from "@/lib/tracker/postings/application";
import { createOncePerKey } from "@/lib/tracker/postings/once";
import { DEFAULT_TRIMS } from "@/lib/tracker/trimRole";
import { makePosting } from "../helpers/fixtures";

describe("createOncePerKey", () => {
  it("runs once for two concurrent calls with the same key", async () => {
    const once = createOncePerKey();
    let runs = 0;
    const action = async () => {
      runs++;
      await Promise.resolve();
      return "done";
    };
    const [a, b] = await Promise.all([once("p1", action), once("p1", action)]);
    expect(runs).toBe(1);
    expect(a).toBe("done");
    expect(b).toBeUndefined();
  });

  it("still runs a different key", async () => {
    const once = createOncePerKey();
    let runs = 0;
    const action = async () => {
      runs++;
      await Promise.resolve();
    };
    await Promise.all([once("p1", action), once("p2", action)]);
    expect(runs).toBe(2);
  });

  it("releases the key after success and after a failure", async () => {
    const once = createOncePerKey();
    await once("p1", async () => 1);
    await expect(once("p1", async () => 2)).resolves.toBe(2);
    await expect(
      once("p1", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    await expect(once("p1", async () => 3)).resolves.toBe(3);
  });
});

describe("applicationFromPosting", () => {
  it("copies the posting's fields and its description", () => {
    const row = applicationFromPosting(
      makePosting({ company: "Vandelay Industries", role: "Software Engineer Intern", location: "Toronto, ON", url: "https://example.com/j/1", description: "Build things." }),
      DEFAULT_TRIMS
    );
    expect(row).toMatchObject({
      company: "Vandelay Industries",
      location: "Toronto, ON",
      url: "https://example.com/j/1",
      description: "Build things.",
      status: "applied",
      source: "alert",
    });
  });

  it("stores no description when it was read-but-empty or not read", () => {
    expect(applicationFromPosting(makePosting({ description: "" }), DEFAULT_TRIMS).description).toBeNull();
    expect(applicationFromPosting(makePosting({ description: null }), DEFAULT_TRIMS).description).toBeNull();
  });

  it("uses the values it is given (the edited posting)", () => {
    const row = applicationFromPosting(makePosting({ company: "Hand Edited Co", location: "Remote" }), DEFAULT_TRIMS);
    expect(row.company).toBe("Hand Edited Co");
    expect(row.location).toBe("Remote");
  });
});
