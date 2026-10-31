// The public demo lives under this path, outside the proxy matcher (proxy.ts),
// so it needs no sign-in. Keep it that way: the demo must never touch Supabase
// or /api/tracker/*.
export const DEMO_BASE = "/demo/tracker";

export function isDemoPath(pathname: string): boolean {
  return pathname === "/demo" || pathname.startsWith("/demo/");
}

// A backstop under the context seam (lib/tracker/env.tsx): if some component
// still reaches for Supabase while on a demo page, fail loudly instead of
// quietly sending a request.
export function assertNotDemo(): void {
  if (typeof window !== "undefined" && isDemoPath(window.location.pathname)) {
    throw new Error("The demo never talks to Supabase.");
  }
}
