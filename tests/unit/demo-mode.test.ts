import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertNotDemo, DEMO_BASE, isDemoPath } from "@/lib/tracker/demo/mode";
import { config } from "@/proxy";
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

// Every file only the demo uses. They must stay free of anything that calls out.
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}
const DEMO_FILES = ["lib/tracker/demo", "components/tracker/demo", "app/demo"]
  .flatMap(filesUnder)
  // mode.ts names Supabase to refuse it.
  .filter((f) => !f.replaceAll("\\", "/").endsWith("demo/mode.ts"));

describe("demo isolation", () => {
  it("stays outside the proxy that guards the tracker", () => {
    expect(config.matcher.length).toBeGreaterThan(0);
    for (const m of config.matcher) expect(m.startsWith("/tracker") || m.startsWith("/api/tracker")).toBe(true);
  });

  it("finds its files", () => {
    expect(DEMO_FILES.length).toBeGreaterThanOrEqual(8);
  });

  it.each(DEMO_FILES)("%s never reaches Supabase or /api/tracker", (file) => {
    // Comments may name what the code avoids.
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "");
    expect(code).not.toMatch(/supabase|createClient|fetch\(|api\/tracker|XMLHttpRequest|sendBeacon/i);
  });
});
