import { NextRequest, NextResponse } from "next/server";
import { getTrackerUserId } from "@/lib/supabase/server";
import { fetchPostingDetails, isJobrightJobUrl, type PostingDetails } from "@/lib/tracker/postings/details";

const MAX_URLS = 10;
const AT_ONCE = 3;

// Reads the start line, length and seniority off Jobright posting pages, server-side (no
// CORS). Returns one entry per URL, in order: the details, or null when the
// page couldn't be read (the caller leaves that posting to try again).
export async function POST(req: NextRequest) {
  if (!(await getTrackerUserId())) {
    return NextResponse.json({ error: "Not signed in or not allowed" }, { status: 401 });
  }

  let urls: string[];
  try {
    const body = (await req.json()) as { urls?: unknown };
    urls = Array.isArray(body.urls) ? body.urls.map(String) : [];
  } catch {
    return NextResponse.json({ error: "Expected { urls: string[] }" }, { status: 400 });
  }
  if (urls.length === 0 || urls.length > MAX_URLS || !urls.every(isJobrightJobUrl)) {
    return NextResponse.json({ error: `Send 1–${MAX_URLS} Jobright posting links` }, { status: 400 });
  }

  const results: (PostingDetails | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: AT_ONCE }, async () => {
      while (next < urls.length) {
        const i = next++;
        results[i] = await fetchPostingDetails(urls[i]);
      }
    })
  );
  return NextResponse.json({ results });
}
