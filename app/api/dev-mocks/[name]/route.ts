import { readdir, readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const MOCKS_DIR = path.join(process.cwd(), "lib/mocks");

// Dev-only: serves the raw contents of one mock file, by filename, so the
// dev panel doesn't need every mock bundled at build time.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const { name } = await params;

  // Only allow serving a file that's actually in the mocks directory
  // listing, ruling out path traversal via the route param.
  const entries = await readdir(MOCKS_DIR).catch(() => [] as string[]);
  if (!entries.includes(name) || !name.endsWith(".json")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const raw = await readFile(path.join(MOCKS_DIR, name), "utf-8");
    return new NextResponse(raw, {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read mock" }, { status: 500 });
  }
}
