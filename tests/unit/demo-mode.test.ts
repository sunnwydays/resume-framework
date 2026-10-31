import { afterEach, describe, expect, it, vi } from "vitest";
import { assertNotDemo, DEMO_BASE, isDemoPath } from "@/lib/tracker/demo/mode";
import { settingKey } from "@/lib/tracker/useLocalSetting";

describe("demo mode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("recognizes demo paths only", () => {
    expect(isDemoPath(DEMO_BASE)).toBe(true);
    expect(isDemoPath(`${DEMO_BASE}/postings`)).toBe(true);
    expect(isDemoPath("/tracker")).toBe(false);
    expect(isDemoPath("/demonstration")).toBe(false);
  });

  it("refuses Supabase on a demo page, allows it elsewhere", () => {
    vi.stubGlobal("window", { location: { pathname: "/demo/tracker" } });
    expect(() => assertNotDemo()).toThrow(/demo/i);
    vi.stubGlobal("window", { location: { pathname: "/tracker" } });
    expect(() => assertNotDemo()).not.toThrow();
  });

  it("keeps the demo's local settings apart from the real ones", () => {
    expect(settingKey("tracker.today.dismissed", false)).toBe("tracker.today.dismissed");
    expect(settingKey("tracker.today.dismissed", true)).not.toBe("tracker.today.dismissed");
  });
});
