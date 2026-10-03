import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractJob } from "@/lib/tracker/extract";

// Fetches a job posting server-side (no CORS) and returns whatever details
// could be pulled out. proxy.ts already 401s signed-out requests; this
// re-checks since the route makes outbound fetches on the caller's behalf.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let url: URL;
  try {
    const body = (await req.json()) as { url?: unknown };
    url = new URL(String(body.url ?? "").trim());
  } catch {
    return NextResponse.json({ error: "That doesn't look like a URL" }, { status: 400 });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) links are supported" }, { status: 400 });
  }

  return NextResponse.json(await extractJob(url.toString()));
}
