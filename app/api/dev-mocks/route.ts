import { readdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const MOCKS_DIR = path.join(process.cwd(), "lib/mocks");

// Dev-only: lists the JSON files sitting in lib/mocks so the UI can offer
// a "load this" button for each one without a build-time import.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  try {
    const entries = await readdir(MOCKS_DIR);
    const names = entries.filter((name) => name.endsWith(".json")).sort();
    return NextResponse.json({ names });
  } catch {
    return NextResponse.json({ names: [] });
  }
}
