// Proxy for Anthropic API calls. The user's key arrives per-request in a
// header (stored client-side in localStorage) and is never persisted here.

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

interface AgentRequest {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-anthropic-key");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  let body: AgentRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body.model || !body.user || !body.schema) {
    return NextResponse.json({ error: "Missing model, user, or schema" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  const call = async (schemaReminder: boolean) => {
    const response = await client.messages.create({
      model: body.model,
      max_tokens: 16000,
      system: body.system,
      messages: [
        {
          role: "user",
          content: schemaReminder
            ? `${body.user}\n\nIMPORTANT: Your previous response did not match the required JSON schema. Respond with valid JSON matching the schema exactly.`
            : body.user,
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: body.schema },
      },
    });

    if (response.stop_reason === "refusal") {
      throw Object.assign(new Error("The model refused this request."), { status: 422 });
    }
    if (response.stop_reason === "max_tokens") {
      throw Object.assign(new Error("Response was truncated (max_tokens)."), { status: 422 });
    }
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    return JSON.parse(text);
  };

  try {
    let data: unknown;
    try {
      data = await call(false);
    } catch (err) {
      // Retry once with an explicit schema reminder on parse failure only.
      if (err instanceof SyntaxError) {
        data = await call(true);
      } else {
        throw err;
      }
    }
    return NextResponse.json({ data });
  } catch (err: unknown) {
    if (err instanceof Anthropic.APIError) {
      const message =
        err instanceof Anthropic.AuthenticationError
          ? "Invalid API key."
          : err instanceof Anthropic.RateLimitError
            ? "Rate limited by the Anthropic API — wait a moment and retry."
            : err.message;
      return NextResponse.json({ error: message }, { status: err.status ?? 500 });
    }
    const e = err as { message?: string; status?: number };
    return NextResponse.json(
      { error: e.message ?? "Agent call failed" },
      { status: e.status ?? 500 }
    );
  }
}
