import { afterEach, expect, it, vi } from "vitest";
import { gameRequest } from "@/components/providers/game-request";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInAnonymously: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth }) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("shares anonymous sign-in and sends the refreshed token on demo clock and task requests", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
  let token: string | null = null;
  auth.getSession.mockImplementation(async () => ({
    data: { session: token ? { access_token: token } : null }, error: null,
  }));
  auth.signInAnonymously.mockImplementation(async () => { token = "first"; return { error: null }; });
  const fetcher = vi.fn(async (_path: string, init: RequestInit) =>
    new Response(new Headers(init.headers).get("authorization")),
  );
  vi.stubGlobal("fetch", fetcher);
  const initial = await Promise.all([gameRequest("/api/pet"), gameRequest("/api/tasks")]);
  expect(await Promise.all(initial.map((r) => r.text()))).toEqual(["Bearer first", "Bearer first"]);
  expect(auth.signInAnonymously).toHaveBeenCalledTimes(1);
  token = "renewed";
  for (const path of ["/api/demo/fast-forward", "/api/tasks"]) {
    expect(await (await gameRequest(path, { method: "POST", body: "{}" })).text()).toBe("Bearer renewed");
  }
});
