import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let file: File | null;
  try {
    const incoming = await req.formData();
    file = incoming.get("file") as File | null;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const apiKey = process.env.AFFINDA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "no Affinda api key" }, { status: 500 });
  }

  const form = new FormData();
  form.append("file", file, "resume.pdf");

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
