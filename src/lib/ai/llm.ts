import { serverEnv } from "@/lib/server/env";

const TIMEOUT_MS = 12_000;

function parseModelJson(content: string): unknown | null {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  const body = (fenced?.[1] ?? trimmed).trim();
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

/**
 * One JSON chat completion. Returns null when `OPENAI_API_KEY` is missing,
 * the call fails, or the body is not JSON. Never throws. Server-only.
 */
export async function completeJson(prompt: string): Promise<unknown | null> {
  const apiKey = serverEnv("OPENAI_API_KEY");
  if (!apiKey) return null;
  const base = (serverEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You reply with JSON only. No medical, legal, or mental-health advice. No profanity.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      console.error("LLM request failed", response.status);
      return null;
    }
    const body = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;
    return parseModelJson(content);
  } catch (error) {
    console.error(error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
