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
