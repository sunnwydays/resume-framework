import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAffindaKeyWorking, resetAffindaKeyCache } from "@/lib/affindaKey";

const respond = (status: number) =>
  vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch;

describe("isAffindaKeyWorking", () => {
  beforeEach(resetAffindaKeyCache);

  it("is off with no key, without calling Affinda", async () => {
    const f = respond(200);
    expect(await isAffindaKeyWorking(undefined, f)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("is off when Affinda rejects the key (expired)", async () => {
    expect(await isAffindaKeyWorking("k", respond(401))).toBe(false);
    resetAffindaKeyCache();
    expect(await isAffindaKeyWorking("k", respond(403))).toBe(false);
  });

  it("is on when the key is accepted", async () => {
    expect(await isAffindaKeyWorking("k", respond(200))).toBe(true);
  });

  it("stays on when Affinda can't be reached or errors", async () => {
    const down = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await isAffindaKeyWorking("k", down)).toBe(true);
    resetAffindaKeyCache();
    expect(await isAffindaKeyWorking("k", respond(503))).toBe(true);
  });

  it("caches the answer per key", async () => {
    const f = respond(401);
    await isAffindaKeyWorking("k", f);
    await isAffindaKeyWorking("k", f);
    expect(f).toHaveBeenCalledTimes(1);
    await isAffindaKeyWorking("other", f);
    expect(f).toHaveBeenCalledTimes(2);
  });
});
