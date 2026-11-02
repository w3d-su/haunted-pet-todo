import { expect, it } from "vitest";
import { postEpitaph, type EpitaphDeps } from "@/app/api/ai/epitaph/handlers";
import { FALLBACK_EPITAPH, initialPetState } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";
import { createMemoryWorld, request, USER_ID } from "../helpers/world";

const NOW = Date.UTC(2026, 6, 4, 8);

function deps(
  world: ReturnType<typeof createMemoryWorld>,
  extras: Partial<EpitaphDeps> = {},
): EpitaphDeps {
  const base = world.deps(USER_ID, NOW);
  return {
    ...base,
    cronSecret: "cron-secret",
    storesFor: async (userId) => {
      const stores = await world.deps(userId, NOW).authorize(new Request("http://localhost"));
      if (!stores) throw new Error("missing stores");
      return stores;
    },
    completeJson: async () => null,
    allow: () => true,
    ...extras,
  };
}

function deadPet(world: ReturnType<typeof createMemoryWorld>) {
  world.pets.set(USER_ID, {
    state: {
      ...initialPetState(USER_ID, NOW, crypto.randomUUID(), "UTC"),
      stage: "hatchling",
      status: "dead",
      hp: 0,
      diedAt: NOW,
    },
    clockOffsetMs: 0,
    version: 1,
  });
  const task: Task = {
    id: crypto.randomUUID(),
    userId: USER_ID,
    title: "Reply to emails",
    notes: null,
    category: "work",
    size: "small",
    status: "overdue",
    dueAt: NOW,
    completedAt: null,
    deletedAt: null,
    parentId: null,
    breakdownSuggested: false,
    allSubtasksDone: false,
    sortOrder: 1,
    createdAt: NOW,
  };
  world.tasks.push(task);
}

it("rejects a signed-out caller and a pet that is still alive", async () => {
  const world = createMemoryWorld();
  const denied = await postEpitaph(request("POST", "/api/ai/epitaph", {}), world.deps(null, NOW) as EpitaphDeps);
  expect(denied.status).toBe(401);

  const alive = createMemoryWorld();
  alive.pets.set(USER_ID, {
    state: initialPetState(USER_ID, NOW, crypto.randomUUID(), "UTC"),
    clockOffsetMs: 0,
    version: 1,
  });
  const response = await postEpitaph(request("POST", "/api/ai/epitaph", {}), deps(alive));
  expect(response.status).toBe(409);
  expect(alive.events).toHaveLength(0);
});

it("stores the fallback epitaph without a model and keeps a later call idempotent", async () => {
  const world = createMemoryWorld();
  deadPet(world);
  let calls = 0;
  const response = await postEpitaph(
    request("POST", "/api/ai/epitaph", {}),
    deps(world, {
      completeJson: async () => {
        calls += 1;
        return null;
      },
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { epitaph: string; source: string; pet: { status: string } };
  expect(body.epitaph).toBe(FALLBACK_EPITAPH);
  expect(body.source).toBe("fallback");
  expect(body.pet.status).toBe("tombstone");
  expect(calls).toBe(1);

  const again = await postEpitaph(
    request("POST", "/api/ai/epitaph", {}),
    deps(world, {
      completeJson: async () => {
        calls += 1;
        return { epitaph: "should not run" };
      },
    }),
  );
  expect(again.status).toBe(200);
  expect(calls).toBe(1);
  expect(world.pets.get(USER_ID)?.state.currentEpitaph).toBe(FALLBACK_EPITAPH);
});

it("stores a valid model epitaph and rate-limits a dead pet", async () => {
  const world = createMemoryWorld();
  deadPet(world);
  const verse = "Here lies Spooky,\nslain by emails";
  const carved = await postEpitaph(
    request("POST", "/api/ai/epitaph", {}),
    deps(world, { completeJson: async () => ({ epitaph: verse }) }),
  );
  expect(carved.status).toBe(200);
  expect(world.pets.get(USER_ID)?.state.currentEpitaph).toBe(verse);
  expect(world.events.some((event) => event.eventType === "EPITAPH_READY")).toBe(true);

  const limited = createMemoryWorld();
  deadPet(limited);
  const response = await postEpitaph(
    request("POST", "/api/ai/epitaph", {}),
    deps(limited, { allow: () => false }),
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("60");
  expect(limited.pets.get(USER_ID)?.state.status).toBe("dead");
});
