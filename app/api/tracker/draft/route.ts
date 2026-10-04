import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import { buildDraftPrompt, parseDraftRequest } from "@/lib/tracker/draftPrompt";

const MODEL = "claude-opus-5-5";

// Drafts one outreach message for the Arbitrage workshop. The draft is only
// shown in an editable box; nothing is ever sent from here. proxy.ts already
// 401s signed-out requests; this re-checks since the call costs money.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limit = checkRateLimit(`draft:${userId}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many drafts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} min.` },
      { status: 429 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set in .env.local" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }
  const parsed = parseDraftRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { system, user } = buildDraftPrompt(parsed.value);
  try {
    const response = await new Anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 1024,
      // A short message: low effort is plenty and keeps it quick.
      output_config: { effort: "low" },
      // If a safety classifier declines a benign request, rerun it on
      // Anthropic's recommended fallback model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "Claude declined to draft this one. Try rewording the hook." }, { status: 422 });
    }
    const draft = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (!draft) return NextResponse.json({ error: "Got an empty draft. Try again." }, { status: 502 });
    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY was rejected" }, { status: 500 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Claude is rate-limited right now. Try again in a minute." }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Claude API error (${e.status ?? "network"})` }, { status: 502 });
    }
    throw e;
  }
}
