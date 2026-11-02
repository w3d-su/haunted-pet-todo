import {
  DECAY_RATE_HP,
  DECAY_RATE_HUNGER,
  DECAY_RATE_MOOD,
  MAX_HP,
  STREAK_BREAK_HOURS,
  STREAK_BREAK_MOOD_PENALTY,
} from "./constants";
import { calendarDay, hourFromTimestamp } from "./evolution";
import type { PetState } from "./pet";

/** Pure linear decay: rate per hour × elapsed hours. */
export function decayAmount(ratePerHour: number, elapsedHours: number): number {
  return ratePerHour * elapsedHours;
}

/**
 * Apply time-based stat decay.
 * Dead and tombstone pets are unchanged. Eggs lose hunger and mood, not HP.
 * `now < lastTickAt` and zero elapsed are identities.
 * Streak break uses `lastCompletionAt` only (not the tick length), so a
 * split interval matches one combined interval.
 */
export function decayStats(pet: PetState, now: number): PetState {
  if (pet.status === "dead" || pet.status === "tombstone") return pet;

  const lastTick = pet.lastTickAt ?? now;
  const elapsedMs = now - lastTick;
  if (elapsedMs <= 0) return pet;

  const elapsedHours = elapsedMs / 3_600_000;
  const hpDecay = pet.stage === "egg" ? 0 : decayAmount(DECAY_RATE_HP, elapsedHours);
  const hungerDecay = decayAmount(DECAY_RATE_HUNGER, elapsedHours);
  const moodDecay = decayAmount(DECAY_RATE_MOOD, elapsedHours);

  const newHp = Math.max(0, Math.min(MAX_HP, pet.hp - hpDecay));
  const newHunger = Math.max(0, Math.min(100, pet.hunger - hungerDecay));
  let newMood = Math.max(0, Math.min(100, pet.mood - moodDecay));

  let newStreak = pet.currentStreak;
  const streakBreakMs = STREAK_BREAK_HOURS * 3_600_000;
  const streakBroken =
    pet.lastCompletionAt !== null &&
    newStreak > 0 &&
    now - pet.lastCompletionAt > streakBreakMs;

  if (streakBroken) {
    newStreak = 0;
    newMood = Math.max(0, newMood - STREAK_BREAK_MOOD_PENALTY);
  }

  // Status stays put. Flipping to dead here would make a later call a no-op
  // and drop hunger/mood the combined interval still applies. The reducer
  // marks death after this returns.
  return {
    ...pet,
    hp: newHp,
    hunger: newHunger,
    mood: newMood,
    currentStreak: newStreak,
    lastTickAt: now,
  };
}

/** Decay from `fromMs` to `toMs`, ignoring the pet's current `lastTickAt`. */
export function decayRange(pet: PetState, fromMs: number, toMs: number): PetState {
  return decayStats({ ...pet, lastTickAt: fromMs }, toMs);
}

export interface HabitualEvent {
  readonly eventType: string;
  readonly payload: {
    readonly completedAt?: unknown;
    readonly at?: unknown;
  };
}

function completionStamp(event: HabitualEvent): number | null {
  if (event.eventType !== "TASK_COMPLETED") return null;
  const value = event.payload.completedAt ?? event.payload.at;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Most common local hour (0–23) among the last 30 task completions.
 * The lowest hour wins a tie. Returns null when nothing qualifies.
 * `timeZone` is the pet's zone. This does not read the wall clock.
 */
export function computeHabitualHour(
  events: readonly HabitualEvent[],
  timeZone: string,
): number | null {
  const stamps = events
    .map(completionStamp)
    .filter((stamp): stamp is number => stamp !== null)
    .slice(-30);
  if (stamps.length === 0) return null;
  const counts = new Array<number>(24).fill(0);
  for (const stamp of stamps) {
    const hour = hourFromTimestamp(stamp, timeZone);
    counts[hour] = (counts[hour] ?? 0) + 1;
  }
  let bestHour = 0;
  let bestCount = -1;
  for (let hour = 0; hour < 24; hour += 1) {
    const count = counts[hour] ?? 0;
    if (count > bestCount) {
      bestHour = hour;
      bestCount = count;
    }
  }
  return bestHour;
}

/** True when a task completion falls on the same local calendar day as `now`. */
export function hasCompletionToday(
  events: readonly HabitualEvent[],
  now: number,
  timeZone: string,
): boolean {
  const today = calendarDay(now, timeZone);
  return events.some((event) => {
    const stamp = completionStamp(event);
    return stamp !== null && calendarDay(stamp, timeZone) === today;
  });
}
