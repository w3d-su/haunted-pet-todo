import { expect, it } from "vitest";
import { runDecayCron } from "@/app/api/cron/decay/handlers";
import { DECAY_RATE_HP, ZOMBIE_DRAIN_PER_HOUR } from "@/lib/game/constants";
import { initialPetState } from "@/lib/game/pet";
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
) {
  return {
    now: () => NOW,
    newId: () => crypto.randomUUID(),
    secret,
    listUserIds: async () => [...world.pets.keys()],
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
  expect(body).toEqual({ processed: 1, deaths: 0 });
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
  const body = (await response.json()) as { processed: number; deaths: number };
  expect(body.deaths).toBe(1);
  expect(world.pets.get(USER_ID)?.state.status).toBe("dead");
  expect(world.events.some((event) => event.eventType === "PET_DIED")).toBe(true);
});
