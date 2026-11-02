import { afterEach, expect, it, vi } from "vitest";
import { completeJson } from "@/lib/ai/llm";

const original = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (original === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = original;
  vi.restoreAllMocks();
});

it("does not call the network when the key is missing", async () => {
  delete process.env.OPENAI_API_KEY;
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  await expect(completeJson("write an epitaph")).resolves.toBeNull();
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("parses a fenced JSON body and ignores a failed status", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '```json\n{"epitaph":"line\\nok"}\n```' } }],
      }),
      { status: 200 },
    ),
  );
  await expect(completeJson("prompt")).resolves.toEqual({ epitaph: "line\nok" });
  expect(fetchSpy).toHaveBeenCalledOnce();
  const [url, init] = fetchSpy.mock.calls[0] ?? [];
  expect(String(url)).toContain("/chat/completions");
  expect(JSON.stringify(init)).not.toContain("test-key-should-not-leak-in-url");
  expect((init?.headers as Record<string, string>).authorization).toBe("Bearer test-key");

  fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 500 }));
  await expect(completeJson("prompt")).resolves.toBeNull();
});
