import { expect, it } from "vitest";
import { POST as postDemoSession } from "@/app/api/demo/session/route";
import { postTask } from "@/app/api/tasks/handlers";
import { getPet } from "@/app/api/pet/handlers";
import { initialPetState } from "@/lib/game/pet";
import {
  DEMO_COOKIE,
  DEMO_TASK_CAP,
  DEMO_USER_CAP,
  demoWorldForSession,
  dropDemoUser,
  guardDemoTask,
  memoryDemoAllowed,
  retainDemoUser,
  signDemoUser,
  verifyDemoUser,
  type DemoTouch,
} from "@/lib/server/demo-store";
import { createMemoryWorld } from "@/lib/server/memory";
import { productionDeps } from "@/lib/server/production";
import { request, USER_ID } from "../helpers/world";

const envKeys = [
  "DEMO_MODE",
  "DEMO_COOKIE_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

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
    expect(cookie).not.toMatch(/Secure/);
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

it("refuses a new demo user when the cap is full and keeps the ones already in", () => {
  const world = createMemoryWorld();
  let touches: DemoTouch[] = [];
  const ids: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const userId = `00000000-0000-4000-8000-00000000000${index}`;
    ids.push(userId);
    world.pets.set(userId, {
      state: initialPetState(userId, 1_000, crypto.randomUUID(), "UTC"),
      clockOffsetMs: 0,
      version: 1,
    });
    const admitted = retainDemoUser(world, userId, 1_000 + index, {
      cap: 3,
      ttlMs: 10_000,
      touches,
    });
    expect(admitted).not.toBeNull();
    touches = admitted ?? [];
  }
  const refused = retainDemoUser(world, "00000000-0000-4000-8000-000000000009", 1_004, {
    cap: 3,
    ttlMs: 10_000,
    touches,
  });
  expect(refused).toBeNull();
  expect([...world.pets.keys()].sort()).toEqual(ids);
});

it("sets Secure only when the request is https", async () => {
  await withEnv({ DEMO_MODE: "true" }, async () => {
    const plain = await postDemoSession(
      new Request("http://192.168.1.20/api/demo/session", { method: "POST" }),
    );
    expect(plain.headers.get("set-cookie")).not.toMatch(/Secure/);
    const forwarded = await postDemoSession(
      new Request("http://192.168.1.20/api/demo/session", {
        method: "POST",
        headers: { "x-forwarded-proto": "https" },
      }),
    );
    expect(forwarded.headers.get("set-cookie")).toMatch(/Secure/);
    const https = await postDemoSession(
      new Request("https://demo.example/api/demo/session", { method: "POST" }),
    );
    expect(https.headers.get("set-cookie")).toMatch(/Secure/);
  });
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    await withEnv({ DEMO_MODE: "true" }, async () => {
      const production = await postDemoSession(
        new Request("http://192.168.1.20/api/demo/session", { method: "POST" }),
      );
      expect(production.headers.get("set-cookie")).not.toMatch(/Secure/);
    });
  } finally {
    env.NODE_ENV = previous;
  }
});

function resetDemoProcess(): void {
  const world = demoWorldForSession();
  world.pets.clear();
  world.tasks.splice(0, world.tasks.length);
  world.events.splice(0, world.events.length);
  (globalThis as { __hauntedDemoTouches?: DemoTouch[] }).__hauntedDemoTouches = [];
}

it("refuses a new session once active demo users fill the cap", async () => {
  await withEnv({ DEMO_MODE: "true" }, async () => {
    resetDemoProcess();
    const first = await postDemoSession(
      new Request("http://localhost/api/demo/session", { method: "POST" }),
    );
    expect(first.status).toBe(200);
    const firstCookie = first.headers.get("set-cookie")?.split(";")[0] ?? "";
    for (let index = 1; index < DEMO_USER_CAP; index += 1) {
      const admitted = await postDemoSession(
        new Request("http://localhost/api/demo/session", { method: "POST" }),
      );
      expect(admitted.status).toBe(200);
    }
    const refused = await postDemoSession(
      new Request("http://localhost/api/demo/session", { method: "POST" }),
    );
    expect(refused.status).toBe(429);
    const refreshed = await postDemoSession(
      new Request("http://localhost/api/demo/session", {
        method: "POST",
        headers: { cookie: firstCookie },
      }),
    );
    expect(refreshed.status).toBe(200);
    expect(demoWorldForSession().pets.size).toBe(0);
  });
});

it("stops a demo user at the task cap", async () => {
  await withEnv({ DEMO_MODE: "true" }, async () => {
    resetDemoProcess();
    const session = await postDemoSession(
      new Request("http://localhost/api/demo/session", { method: "POST" }),
    );
    const cookie = session.headers.get("set-cookie")?.split(";")[0] ?? "";
    const deps = productionDeps();
    const headers = { cookie };
    for (let index = 0; index < DEMO_TASK_CAP; index += 1) {
      const created = await postTask(
        request("POST", "/api/tasks", { title: `Task ${index}` }, headers),
        deps,
      );
      expect(created.status).toBe(201);
    }
    const overflow = await postTask(
      request("POST", "/api/tasks", { title: "One too many" }, headers),
      deps,
    );
    expect(overflow.status).toBe(429);
    const body = (await overflow.json()) as { error?: string };
    expect(body.error).toMatch(/limited number of tasks/);
    expect(demoWorldForSession().tasks.filter((task) => task.deletedAt === null)).toHaveLength(
      DEMO_TASK_CAP,
    );
  });
});

it("ignores the published demo cookie placeholder and done tasks", async () => {
  await withEnv({ DEMO_MODE: "true", DEMO_COOKIE_SECRET: "your-demo-cookie-secret" }, async () => {
    const signed = signDemoUser(USER_ID);
    expect(verifyDemoUser(signed, Buffer.from("your-demo-cookie-secret"))).toBeNull();
  });
  await withEnv({ DEMO_MODE: "true", DEMO_COOKIE_SECRET: "a-real-local-secret" }, async () => {
    const signed = signDemoUser(USER_ID);
    expect(verifyDemoUser(signed, Buffer.from("a-real-local-secret"))).toBe(USER_ID);
  });

  const world = createMemoryWorld();
  const done = initialPetState(USER_ID, 1_000, crypto.randomUUID(), "UTC");
  void done;
  for (let index = 0; index < 5; index += 1) {
    world.tasks.push({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      userId: USER_ID,
      title: "Done",
      notes: null,
      category: "chores",
      size: "small",
      status: "done",
      dueAt: null,
      completedAt: 1_000,
      deletedAt: null,
      parentId: null,
      breakdownSuggested: false,
      allSubtasksDone: false,
      sortOrder: index,
      createdAt: 1_000,
    });
  }
  expect(() =>
    guardDemoTask(world, { id: "00000000-0000-4000-8000-000000000099", userId: USER_ID }, 2),
  ).not.toThrow();
});
