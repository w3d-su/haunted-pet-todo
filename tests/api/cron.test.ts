import { expect, it } from "vitest";
import { runDecayCron, type CronDeps } from "@/app/api/cron/decay/handlers";
import { DECAY_RATE_HP, ZOMBIE_DRAIN_PER_HOUR } from "@/lib/game/constants";
import { FALLBACK_EPITAPH, initialPetState } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";
import type { AuthedStores } from "@/lib/server/stores";
import { createMemoryWorld, USER_ID } from "../helpers/world";

const NOW = Date.UTC(2026, 6, 4, 8);
const HOUR = 3_600_000;
const SECRET = "cron-secret";

function task(dueAt: number): Task {
  return {
    id: crypto.randomUUID(),
    userId: USER_ID,
    title: "Sweep the hall",
    notes: null,
    category: "chores",
    size: "small",
    status: "todo",
    dueAt,
    completedAt: null,
    deletedAt: null,
    parentId: null,
    breakdownSuggested: false,
    allSubtasksDone: false,
    sortOrder: 1,
    createdAt: NOW - 2 * HOUR,
  };
}

function cronDeps(
  world: ReturnType<typeof createMemoryWorld>,
  secret: string | undefined,
): CronDeps {
  return {
    now: () => NOW,
    newId: () => crypto.randomUUID(),
    secret,
    listUserIds: async () => [...world.pets.keys()],
    deliverPush: async () => "sent",
    async storesFor(userId: string): Promise<AuthedStores> {
      const stores = await world.deps(userId, NOW).authorize(new Request("http://localhost"));
      if (!stores) throw new Error("missing stores");
      return stores;
    },
  };
}

function seed(stage: "egg" | "hatchling", hp = 100) {
  const world = createMemoryWorld();
  const state = {
    ...initialPetState(USER_ID, NOW - 2 * HOUR, crypto.randomUUID(), "UTC"),
    stage,
    hp,
  };
  world.pets.set(USER_ID, { state, clockOffsetMs: 0, version: 1 });
  world.tasks.push(task(NOW - 2 * HOUR));
  return world;
}

it("returns 401 and changes nothing without the cron secret", async () => {
  const world = seed("hatchling");
  const denied = await runDecayCron(
    new Request("http://localhost/api/cron/decay"),
    cronDeps(world, SECRET),
  );
  expect(denied.status).toBe(401);
  const wrong = await runDecayCron(
    new Request("http://localhost/api/cron/decay", {
      headers: { authorization: "Bearer nope" },
    }),
    cronDeps(world, SECRET),
  );
  expect(wrong.status).toBe(401);
  expect(world.pets.get(USER_ID)?.state.hp).toBe(100);
  expect(world.tasks[0]?.status).toBe("todo");
  expect(world.events).toHaveLength(0);
});

it("marks overdue tasks, drains a living pet, and leaves an egg's HP alone", async () => {
  const living = seed("hatchling");
  const response = await runDecayCron(
    new Request("http://localhost/api/cron/decay", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
    cronDeps(living, SECRET),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { processed: number; deaths: number };
  expect(body).toEqual({ processed: 1, deaths: 0, failures: 0 });
  expect(living.tasks[0]?.status).toBe("overdue");
  expect(living.pets.get(USER_ID)?.state.hp).toBe(100 - 2 * (DECAY_RATE_HP + ZOMBIE_DRAIN_PER_HOUR));
  expect(living.events.some((event) => event.eventType === "TASK_OVERDUE")).toBe(true);

  const egg = seed("egg");
  const eggResponse = await runDecayCron(
    new Request("http://localhost/api/cron/decay", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
    cronDeps(egg, SECRET),
  );
  expect(eggResponse.status).toBe(200);
  expect(egg.tasks[0]?.status).toBe("overdue");
  expect(egg.pets.get(USER_ID)?.state.hp).toBe(100);
  expect(egg.pets.get(USER_ID)?.state.stage).toBe("egg");
});

it("counts a death when catch-up drives HP to zero", async () => {
  const world = seed("hatchling", 4);
  const response = await runDecayCron(
    new Request("http://localhost/api/cron/decay", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
    cronDeps(world, SECRET),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { processed: number; deaths: number; failures: number };
  expect(body.deaths).toBe(1);
  expect(body.failures).toBe(0);
  expect(world.pets.get(USER_ID)?.state.status).toBe("dead");
  expect(world.events.some((event) => event.eventType === "PET_DIED")).toBe(true);
});

it("counts one user's failure and still processes the next", async () => {
  const world = seed("hatchling");
  const other = "22222222-2222-4222-8222-222222222222";
  world.pets.set(other, {
    state: {
      ...initialPetState(other, NOW - 2 * HOUR, crypto.randomUUID(), "UTC"),
      stage: "hatchling",
    },
    clockOffsetMs: 0,
    version: 1,
  });
  const deps = cronDeps(world, SECRET);
  const storesFor = deps.storesFor;
  deps.storesFor = async (userId) => {
    if (userId === USER_ID) throw new Error("boom");
    return storesFor(userId);
  };
  const response = await runDecayCron(
    new Request("http://localhost/api/cron/decay", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
    deps,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { processed: number; failures: number };
  expect(body.failures).toBe(1);
  expect(body.processed).toBe(1);
  expect(world.pets.get(other)?.state.hp).toBe(100 - 2 * DECAY_RATE_HP);
});

it("records a death and leaves the epitaph for the tombstone view", async () => {
  const world = seed("hatchling", 4);
  const response = await runDecayCron(
    new Request("http://localhost/api/cron/decay", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
    cronDeps(world, SECRET),
  );
  expect(response.status).toBe(200);
  expect(world.pets.get(USER_ID)?.state.status).toBe("dead");
  expect(world.pets.get(USER_ID)?.state.currentEpitaph).toBe(FALLBACK_EPITAPH);
  expect(world.events.some((event) => event.eventType === "EPITAPH_READY")).toBe(false);
});

it("sends one daily nag when work is open and nothing was finished today", async () => {
  const world = seed("hatchling");
  world.pushes.push({
    userId: USER_ID,
    endpoint: "https://fcm.googleapis.com/fcm/send/haunt",
    p256dh: "key",
    auth: "secret",
  });
  const sent: { body: string; endpoint: string }[] = [];
  const deps = cronDeps(world, SECRET);
  deps.deliverPush = async (subscription, payload) => {
    sent.push({ body: payload.body, endpoint: subscription.endpoint });
    return "sent";
  };
  const response = await runDecayCron(
    new Request("http://localhost/api/cron/decay", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
    deps,
  );
  expect(response.status).toBe(200);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.endpoint).toBe("https://fcm.googleapis.com/fcm/send/haunt");
  expect(sent[0]?.body.length).toBeGreaterThan(0);
  expect(sent[0]?.body.length).toBeLessThanOrEqual(140);

  sent.length = 0;
  await runDecayCron(
    new Request("http://localhost/api/cron/decay", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
    deps,
  );
  expect(sent).toHaveLength(0);
});

it("drops a subscription the push service says is gone", async () => {
  const world = seed("hatchling");
  world.pushes.push({
    userId: USER_ID,
    endpoint: "https://fcm.googleapis.com/fcm/send/gone",
    p256dh: "key",
    auth: "secret",
  });
  const deps = cronDeps(world, SECRET);
  deps.deliverPush = async () => "gone";
  await runDecayCron(
    new Request("http://localhost/api/cron/decay", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
    deps,
  );
  expect(world.pushes).toHaveLength(0);
});
