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

it("uses the fallback without calling the model when the daily cap is spent", async () => {
  const world = createMemoryWorld();
  deadPet(world);
  let calls = 0;
  const base = deps(world, {
    completeJson: async () => {
      calls += 1;
      return { epitaph: "Here lies Spooky,\nslain by emails" };
    },
  });
  const response = await postEpitaph(request("POST", "/api/ai/epitaph", {}), {
    ...base,
    authorize: async (incoming) => {
      const stores = await base.authorize(incoming);
      if (!stores) return null;
      return { ...stores, budget: { take: async () => false } };
    },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { source: string; epitaph: string };
  expect(body.source).toBe("fallback");
  expect(body.epitaph).toBe(FALLBACK_EPITAPH);
  expect(calls).toBe(0);
  expect(world.pets.get(USER_ID)?.state.status).toBe("tombstone");
});

it("stores a valid model epitaph", async () => {
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
});

it("spends budget on the zh-TW retry and stops when none is left", async () => {
  const world = createMemoryWorld();
  deadPet(world);
  let calls = 0;
  let takes = 0;
  const base = deps(world, {
    completeJson: async () => {
      calls += 1;
      return { epitaph: "Here lies Spooky,\nslain by emails" };
    },
  });
  const incoming = request("POST", "/api/ai/epitaph", {});
  incoming.headers.set("x-locale", "zh-TW");
  const response = await postEpitaph(incoming, {
    ...base,
    authorize: async (authed) => {
      const stores = await base.authorize(authed);
      if (!stores) return null;
      return {
        ...stores,
        budget: {
          take: async () => {
            takes += 1;
            return takes === 1;
          },
        },
      };
    },
  });
  expect(response.status).toBe(200);
  expect(takes).toBe(2);
  expect(calls).toBe(1);
  expect(((await response.json()) as { source: string }).source).toBe("fallback");
});
