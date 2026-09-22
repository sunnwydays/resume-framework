import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const { allowed, retryAfterSeconds } = checkRateLimit(getClientIp(req));
  if (!allowed) {
    return NextResponse.json(
      {
        error: `This demo limits parses per visitor to protect the shared API key. You've hit that limit — try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
      },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let file: File | null;
  let text: string | null;
  try {
    const incoming = await req.formData();
    file = incoming.get("file") as File | null;
    text = incoming.get("text") as string | null;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  if (!file && !text) {
    return NextResponse.json({ error: "No file or text provided" }, { status: 400 });
  }

  const apiKey = process.env.AFFINDA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "no Affinda api key" }, { status: 500 });
  }

  const form = new FormData();
  if (file) {
    form.append("file", file, "resume.pdf");
  } else {
    form.append(
      "file",
      new Blob([text as string], { type: "text/plain" }),
      "resume.txt"
    );
  }

  try {
    const response = await fetch("https://resume-parser.us1.affinda.com/v1/resumes/parse", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to reach Affinda" }, { status: 502 });
  }
}
