import { expect, it } from "vitest";
import { hourFromTimestamp, isIanaTimeZone, canEvolve, resolveEvolvedForm } from "@/lib/game/evolution";
import { initialPetState, type PetState } from "@/lib/game/pet";

const HOUR = 3_600_000;
const START = Date.UTC(2026, 0, 15, 12);

function adult(overrides: Partial<PetState> = {}): PetState {
  return {
    ...initialPetState("user", START, "pet", "UTC"),
    stage: "adult",
    becameAdultAt: START - 48 * HOUR,
    currentStreak: 10,
    ...overrides,
  };
}

/** A Unix ms whose local hour in `timeZone` is `hour`, on 2026-01-15. */
function atLocalHour(timeZone: string, hour: number): number {
  const guess = Date.UTC(2026, 0, 15, hour, 30);
  const seen = hourFromTimestamp(guess, timeZone);
  const delta = (hour - seen + 24) % 24;
  const adjusted = guess + delta * HOUR;
  const back = (hour - hourFromTimestamp(adjusted, timeZone) + 24) % 24;
  return adjusted + back * HOUR;
}

it("rejects zones Intl does not know", () => {
  expect(isIanaTimeZone("UTC")).toBe(true);
  expect(isIanaTimeZone("America/New_York")).toBe(true);
  expect(isIanaTimeZone("Not/AZone")).toBe(false);
});

it("reads the hour in the pet's zone, not the server zone", () => {
  const ts = Date.UTC(2026, 0, 16, 4, 30);
  expect(hourFromTimestamp(ts, "UTC")).toBe(4);
  expect(hourFromTimestamp(ts, "America/New_York")).toBe(23);
});

it("canEvolve requires an adult, a streak of 10, and 24 hours", () => {
  expect(canEvolve(adult({ stage: "hatchling" }), START)).toBe(false);
  expect(canEvolve(adult({ currentStreak: 9 }), START)).toBe(false);
  expect(canEvolve(adult({ becameAdultAt: START - 23 * HOUR }), START)).toBe(false);
  expect(canEvolve(adult({ status: "dead" }), START)).toBe(false);
  expect(canEvolve(adult(), START)).toBe(true);
});

it("picks each evolved form, and treats ties and empty history as haunter", () => {
  const night = Array.from({ length: 6 }, () => atLocalHour("America/New_York", 23));
  const early = Array.from({ length: 6 }, () => atLocalHour("America/New_York", 9));
  const afternoon = Array.from({ length: 6 }, () => atLocalHour("America/New_York", 14));
  const filler = Array.from({ length: 4 }, () => atLocalHour("America/New_York", 14));

  expect(hourFromTimestamp(night[0] ?? 0, "America/New_York")).toBe(23);
  expect(hourFromTimestamp(early[0] ?? 0, "America/New_York")).toBe(9);

  const state = adult({ timeZone: "America/New_York" });
  expect(
    resolveEvolvedForm({
      ...state,
      recentCompletionTimestamps: [...night, ...filler],
      recentCompletionCategories: Array(10).fill("chores"),
    }),
  ).toBe("adult_night_owl");

  expect(
    resolveEvolvedForm({
      ...state,
      recentCompletionTimestamps: [...early, ...filler],
      recentCompletionCategories: Array(10).fill("chores"),
    }),
  ).toBe("adult_early_bird");

  expect(
    resolveEvolvedForm({
      ...state,
      recentCompletionTimestamps: [...afternoon, ...filler],
      recentCompletionCategories: Array(10).fill("study"),
    }),
  ).toBe("adult_scholar");

  expect(resolveEvolvedForm(adult({ recentCompletionTimestamps: [], recentCompletionCategories: [] }))).toBe(
    "adult_haunter",
  );

  const fiveNight = Array.from({ length: 5 }, () => atLocalHour("UTC", 23));
  const fiveEarly = Array.from({ length: 5 }, () => atLocalHour("UTC", 9));
  expect(
    resolveEvolvedForm({
      ...adult(),
      recentCompletionTimestamps: [...fiveNight, ...fiveEarly],
      recentCompletionCategories: Array(10).fill("chores"),
    }),
  ).toBe("adult_haunter");
});

it("lets night_owl beat scholar when both have a strict majority", () => {
  const night = Array.from({ length: 6 }, () => atLocalHour("UTC", 23));
  const day = Array.from({ length: 4 }, () => atLocalHour("UTC", 14));
  const form = resolveEvolvedForm({
    ...adult(),
    recentCompletionTimestamps: [...night, ...day],
    recentCompletionCategories: [...Array(6).fill("study"), ...Array(4).fill("chores")],
  });
  expect(form).toBe("adult_night_owl");
});
