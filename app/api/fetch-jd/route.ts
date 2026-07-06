// Server-side job-description fetch: avoids browser CORS, strips HTML to text.

import { NextRequest, NextResponse } from "next/server";

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export async function POST(req: NextRequest) {
  let url: string;
  try {
    ({ url } = await req.json());
    new URL(url); // validate
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `The site returned ${res.status}. Paste the job description text instead.` },
        { status: 502 }
      );
    }
    const text = htmlToText(await res.text());
    if (text.length < 200) {
      return NextResponse.json(
        {
          error:
            "Couldn't extract meaningful text (the page is likely rendered with JavaScript). Paste the job description text instead.",
        },
        { status: 422 }
      );
    }
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch that URL. Paste the job description text instead." },
      { status: 502 }
    );
  }
}
