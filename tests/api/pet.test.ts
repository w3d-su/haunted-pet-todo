import { expect, it } from "vitest";
import { getPet, patchPet } from "@/app/api/pet/handlers";
import { DECAY_RATE_HP, MAX_HP } from "@/lib/game/constants";
import { initialPetState } from "@/lib/game/pet";
import { createMemoryWorld, request, USER_ID } from "../helpers/world";

const NOW = Date.UTC(2026, 6, 4, 8);

it("creates an egg for a new user and stores the requested time zone", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  const response = await getPet(
    request("GET", "/api/pet", undefined, { "x-time-zone": "America/New_York" }),
    deps,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { pet: { stage: string; timeZone: string; hp: number } };
  expect(body.pet.stage).toBe("egg");
  expect(body.pet.timeZone).toBe("America/New_York");
  expect(body.pet.hp).toBe(MAX_HP);

  const later = await getPet(
    request("GET", "/api/pet", undefined, { "x-time-zone": "UTC" }),
    deps,
  );
  expect(((await later.json()) as { pet: { timeZone: string } }).pet.timeZone).toBe(
    "America/New_York",
  );
});

it("refuses client-supplied game events and rebirths only a tombstone", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  const cheated = await patchPet(
    request("PATCH", "/api/pet", {
      type: "TASK_COMPLETED",
      taskId: "t",
      wasOverdue: false,
      category: "work",
      completedAt: NOW,
    }),
    deps,
  );
  expect(cheated.status).toBe(400);

  const tooSoon = await patchPet(request("PATCH", "/api/pet", { type: "REBIRTH" }), deps);
  expect(tooSoon.status).toBe(409);

  const tombstone = {
    ...initialPetState(USER_ID, NOW, crypto.randomUUID(), "UTC"),
    status: "tombstone" as const,
    stage: "adult" as const,
    hp: 0,
    currentEpitaph: "Gone.",
  };
  world.pets.set(USER_ID, { state: tombstone, clockOffsetMs: 0, version: 1 });
  const reborn = await patchPet(request("PATCH", "/api/pet", { type: "REBIRTH" }), deps);
  expect(reborn.status).toBe(200);
  const body = (await reborn.json()) as { pet: { stage: string; status: string; hp: number; graveyard: unknown[] } };
  expect(body.pet.stage).toBe("egg");
  expect(body.pet.status).toBe("alive");
  expect(body.pet.hp).toBe(MAX_HP);
  expect(body.pet.graveyard).toHaveLength(1);
  expect(world.events.some((event) => event.eventType === "REBIRTH")).toBe(true);
});

it("applies catch-up decay from lastTickAt plus the stored offset", async () => {
  const world = createMemoryWorld();
  const state = {
    ...initialPetState(USER_ID, NOW, crypto.randomUUID(), "UTC"),
    stage: "adult" as const,
    hp: MAX_HP,
  };
  world.pets.set(USER_ID, { state, clockOffsetMs: 3 * 3_600_000, version: 1 });
  const response = await getPet(request("GET", "/api/pet"), world.deps(USER_ID, NOW));
  const body = (await response.json()) as { pet: { hp: number; lastTickAt: number } };
  expect(body.pet.hp).toBe(MAX_HP - 3 * DECAY_RATE_HP);
  expect(body.pet.lastTickAt).toBe(NOW + 3 * 3_600_000);
});

it("moves the pet to a new time zone and refiles the last completion day", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  // 23:30 UTC on 3 July is already 4 July in Taipei.
  const lastCompletionAt = Date.UTC(2026, 6, 3, 23, 30);
  world.pets.set(USER_ID, {
    state: {
      ...initialPetState(USER_ID, NOW, crypto.randomUUID(), "UTC"),
      stage: "hatchling",
      currentStreak: 2,
      lastCompletionAt,
      lastCompletionDay: "2026-07-03",
    },
    clockOffsetMs: 0,
    version: 1,
  });

  const moved = await patchPet(request("PATCH", "/api/pet", { timeZone: "Asia/Taipei" }), deps);
  expect(moved.status).toBe(200);
  const stored = world.pets.get(USER_ID)?.state;
  expect(stored?.timeZone).toBe("Asia/Taipei");
  expect(stored?.lastCompletionDay).toBe("2026-07-04");
  expect(stored?.currentStreak).toBe(2);
  expect(world.events.some((event) => event.eventType === "TIME_ZONE_CHANGED")).toBe(true);

  const version = world.pets.get(USER_ID)?.version;
  const same = await patchPet(request("PATCH", "/api/pet", { timeZone: "Asia/Taipei" }), deps);
  expect(same.status).toBe(200);
  expect(world.pets.get(USER_ID)?.version).toBe(version);

  const bogus = await patchPet(request("PATCH", "/api/pet", { timeZone: "Mars/Olympus" }), deps);
  expect(bogus.status).toBe(400);
  expect(world.pets.get(USER_ID)?.state.timeZone).toBe("Asia/Taipei");
});
