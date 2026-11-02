import { expect, it } from "vitest";
import { getPet } from "@/app/api/pet/handlers";
import { POST as postDemoSession } from "@/app/api/demo/session/route";
import { initialPetState } from "@/lib/game/pet";
import {
  DEMO_COOKIE,
  dropDemoUser,
  memoryDemoAllowed,
  retainDemoUser,
  signDemoUser,
  type DemoTouch,
} from "@/lib/server/demo-store";
import { createMemoryWorld } from "@/lib/server/memory";
import { productionDeps } from "@/lib/server/production";
import { USER_ID } from "../helpers/world";

const envKeys = ["DEMO_MODE", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

function withEnv(values: Partial<Record<(typeof envKeys)[number], string | undefined>>, run: () => Promise<void>) {
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]));
  return (async () => {
    try {
      for (const key of envKeys) {
        const value = values[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await run();
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  })();
}

it("uses the memory demo only when demo mode is on and Supabase is unset", async () => {
  await withEnv({ DEMO_MODE: "true" }, async () => {
    expect(memoryDemoAllowed()).toBe(true);
  });
  await withEnv(
    {
      DEMO_MODE: "true",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    },
    async () => {
      expect(memoryDemoAllowed()).toBe(false);
      const signed = signDemoUser(USER_ID);
      const stores = await productionDeps().authorize(
        new Request("http://localhost/api/pet", {
          headers: { cookie: `${DEMO_COOKIE}=${signed}` },
        }),
      );
      expect(stores).toBeNull();
    },
  );
  await withEnv({ DEMO_MODE: undefined }, async () => {
    expect(memoryDemoAllowed()).toBe(false);
  });
});

it("rejects a forged demo cookie and does not keep a pet for it", async () => {
  await withEnv({ DEMO_MODE: "true" }, async () => {
    const beforeUsage = process.memoryUsage();
    const before = beforeUsage.rss;
    const deps = productionDeps();
    for (let index = 0; index < 20_000; index += 1) {
      const forged = crypto.randomUUID();
      const stores = await deps.authorize(
        new Request("http://localhost/api/pet", {
          headers: { cookie: `${DEMO_COOKIE}=${forged}` },
        }),
      );
      expect(stores).toBeNull();
    }
    const tampered = signDemoUser(USER_ID).replace(/\..*/, ".not-the-mac");
    const stores = await deps.authorize(
      new Request("http://localhost/api/pet", {
        headers: { cookie: `${DEMO_COOKIE}=${encodeURIComponent(tampered)}` },
      }),
    );
    expect(stores).toBeNull();
    const gc = (globalThis as { gc?: () => void }).gc;
    gc?.();
    const afterUsage = process.memoryUsage();
    const after = afterUsage.rss;
    console.log(
      `forged-cookie flood rss before=${before} after=${after} delta=${after - before} heap before=${beforeUsage.heapUsed} after=${afterUsage.heapUsed}`,
    );
    const held = (globalThis as { __hauntedDemo?: { pets: { size: number } } }).__hauntedDemo;
    expect(held?.pets.size ?? 0).toBe(0);

    const session = await postDemoSession(
      new Request("http://localhost/api/demo/session", { method: "POST" }),
    );
    expect(session.status).toBe(200);
    const cookie = session.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("Secure");
    const authed = await deps.authorize(
      new Request("http://localhost/api/pet", { headers: { cookie: cookie.split(";")[0] ?? "" } }),
    );
    expect(authed?.userId).toBeTruthy();
    const pet = await getPet(
      new Request("http://localhost/api/pet", { headers: { cookie: cookie.split(";")[0] ?? "" } }),
      deps,
    );
    expect(pet.status).toBe(200);
    if (authed) dropDemoUser((globalThis as { __hauntedDemo?: ReturnType<typeof createMemoryWorld> }).__hauntedDemo ?? createMemoryWorld(), authed.userId);
  });
});

it("drops the oldest demo users once the cap is full", () => {
  const world = createMemoryWorld();
  let touches: DemoTouch[] = [];
  const ids: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const userId = `00000000-0000-4000-8000-00000000000${index}`;
    ids.push(userId);
    world.pets.set(userId, {
      state: initialPetState(userId, 1_000, crypto.randomUUID(), "UTC"),
      clockOffsetMs: 0,
      version: 1,
    });
    touches = retainDemoUser(world, userId, 1_000 + index, {
      cap: 3,
      ttlMs: 10_000,
      touches,
    });
  }
  expect(world.pets.size).toBe(3);
  expect(world.pets.has(ids[0] ?? "")).toBe(false);
  expect(world.pets.has(ids[1] ?? "")).toBe(false);
  expect(world.pets.has(ids[4] ?? "")).toBe(true);
});
