import { expect, it } from "vitest";
import { getPetRecord, getPetState, petStateToRow, savePetState } from "@/lib/db/pet";
import { OffsetClock } from "@/lib/game/clock";
import {
  DECAY_RATE_HP,
  DECAY_RATE_HUNGER,
  DECAY_RATE_MOOD,
  MAX_HP,
  STREAK_BREAK_MOOD_PENALTY,
} from "@/lib/game/constants";
import { decayAmount, decayStats } from "@/lib/game/decay";
import { initialPetState, runOneTick, type PetState } from "@/lib/game/pet";
import { createPetTable } from "../helpers/pet-table";

const HOUR = 3_600_000;
const START = Date.UTC(2026, 0, 1);

function pet(overrides: Partial<PetState> = {}): PetState {
  return {
    ...initialPetState("user", START, "pet-1", "UTC"),
    stage: "adult",
    becameAdultAt: START,
    ...overrides,
  };
}

it("decayAmount is rate times hours", () => {
  expect(decayAmount(5, 2)).toBe(10);
});

it("returns dead and tombstone pets unchanged", () => {
  for (const status of ["dead", "tombstone"] as const) {
    const state = pet({ status, hp: 12, lastTickAt: START });
    expect(decayStats(state, START + 5 * HOUR)).toBe(state);
  }
});

it("does not decay egg HP but does decay hunger and mood", () => {
  const state = pet({ stage: "egg", hp: 100, hunger: 80, mood: 70, lastTickAt: START });
  const next = decayStats(state, START + HOUR);
  expect(next.hp).toBe(100);
  expect(next.hunger).toBe(80 - DECAY_RATE_HUNGER);
  expect(next.mood).toBe(70 - DECAY_RATE_MOOD);
});

it("is unchanged when now equals or precedes lastTickAt", () => {
  const state = pet({ lastTickAt: START, hp: 40 });
  expect(decayStats(state, START)).toBe(state);
  expect(decayStats(state, START - HOUR)).toBe(state);
});

it("reduces stats by one hour of decay", () => {
  const state = pet({ hp: 50, hunger: 50, mood: 50, lastTickAt: START });
  const next = decayStats(state, START + HOUR);
  expect(next.hp).toBe(50 - DECAY_RATE_HP);
  expect(next.hunger).toBe(50 - DECAY_RATE_HUNGER);
  expect(next.mood).toBe(50 - DECAY_RATE_MOOD);
  expect(next.lastTickAt).toBe(START + HOUR);
});

it("clamps HP at 0 without dropping the rest of the interval", () => {
  const state = pet({ hp: DECAY_RATE_HP, stage: "adult", hunger: 40, lastTickAt: START });
  const next = decayStats(state, START + 2 * HOUR);
  expect(next.hp).toBe(0);
  expect(next.status).toBe("alive");
  expect(next.hunger).toBe(40 - 2 * DECAY_RATE_HUNGER);
  expect(next.stage).toBe("adult");
});

it("breaks a streak and applies the mood penalty after 48 hours", () => {
  const state = pet({
    currentStreak: 4,
    mood: 50,
    lastCompletionAt: START,
    lastTickAt: START + 48 * HOUR,
  });
  const next = decayStats(state, START + 49 * HOUR);
  expect(next.currentStreak).toBe(0);
  expect(next.mood).toBe(50 - DECAY_RATE_MOOD - STREAK_BREAK_MOOD_PENALTY);
});

it("does not break a streak when there has never been a completion", () => {
  const state = pet({ currentStreak: 0, lastCompletionAt: null, lastTickAt: START });
  const next = decayStats(state, START + 100 * HOUR);
  expect(next.currentStreak).toBe(0);
});

it("decays a near-dead pet to death across 24 mocked hourly ticks", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const petId = "22222222-2222-4222-8222-222222222222";
  const startHp = 15;
  const clock = new OffsetClock(START);
  const nearDead = pet({
    id: petId,
    userId,
    hp: startHp,
    hunger: 100,
    mood: 100,
    lastTickAt: clock.now(),
    status: "alive",
  });
  const table = createPetTable({
    ...petStateToRow(nearDead),
    clock_offset_ms: 0,
    version: 1,
  });
  const expectedDeathTick = Math.ceil(startHp / DECAY_RATE_HP);
  let version = 1;

  for (let tick = 1; tick <= 24; tick += 1) {
    clock.advance(HOUR);
    const record = await getPetRecord(table.client, userId);
    expect(record).not.toBeNull();
    const next = runOneTick(record?.state ?? nearDead, [], clock.now());
    expect(next.hp).toBeGreaterThanOrEqual(0);
    expect(next.hp).toBeLessThanOrEqual(MAX_HP);
    expect(next.hunger).toBeGreaterThanOrEqual(0);
    expect(next.hunger).toBeLessThanOrEqual(100);
    expect(next.mood).toBeGreaterThanOrEqual(0);
    expect(next.mood).toBeLessThanOrEqual(100);
    expect(next.status).toBe(tick < expectedDeathTick ? "alive" : "dead");
    const saved = await savePetState(table.client, next, version);
    expect(saved).not.toBeNull();
    version = saved?.version ?? version;
  }

  const finalState = await getPetState(table.client, userId);
  expect(finalState?.status).toBe("dead");
  expect(finalState?.hp).toBe(0);
});

it("advances, rejects negative advances, and resets", () => {
  const clock = new OffsetClock(1_000, 5);
  expect(clock.now()).toBe(1_005);
  clock.advance(10);
  expect(clock.now()).toBe(1_015);
  expect(clock.offset).toBe(15);
  expect(() => clock.advance(-1)).toThrow(/backwards/);
  clock.reset();
  expect(clock.offset).toBe(0);
  expect(clock.now()).toBe(1_000);
});
