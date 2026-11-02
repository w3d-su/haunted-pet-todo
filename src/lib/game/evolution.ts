import type { EvolvedAdultStage, PetState } from "./pet";
import { EVOLVE_HOURS_AS_ADULT, EVOLVE_STREAK_THRESHOLD } from "./constants";

/** True when the zone is an IANA name `Intl` accepts. */
export function isIanaTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Local hour 0–23 in `timeZone`.
 * Uses `Intl` so the game core does not read the wall clock.
 */
export function hourFromTimestamp(ts: number, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(ts)
    .find((part) => part.type === "hour");
  const value = Number(hour?.value ?? "0");
  return value === 24 ? 0 : value;
}

/** Calendar day `YYYY-MM-DD` in `timeZone`. */
export function calendarDay(ts: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ts);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Cannot format calendar day in ${timeZone}`);
  }
  return `${year}-${month}-${day}`;
}

/** True when the pet currently meets every evolution precondition. */
export function canEvolve(state: PetState, now: number): boolean {
  if (state.stage !== "adult" || state.status !== "alive") return false;
  if (state.currentStreak < EVOLVE_STREAK_THRESHOLD) return false;
  const hoursAsAdult =
    state.becameAdultAt !== null ? (now - state.becameAdultAt) / 3_600_000 : 0;
  return hoursAsAdult >= EVOLVE_HOURS_AS_ADULT;
}

/**
 * Deterministic evolved form from recent completion history.
 * Strict majority is `floor(n/2)+1`. Empty history and ties fall through
 * to `adult_haunter`. Priority: night_owl > early_bird > scholar > haunter.
 *
 * 05:00–05:59 counts as night only, so night and early bird are disjoint
 * per completion. Scholar can still overlap a time-of-day form.
 */
export function resolveEvolvedForm(state: PetState): EvolvedAdultStage {
  const timestamps = state.recentCompletionTimestamps;
  const categories = state.recentCompletionCategories;
  const n = Math.min(10, timestamps.length, categories.length);
  if (n === 0) return "adult_haunter";

  let nightOwl = 0;
  let earlyBird = 0;
  let scholar = 0;

  for (let i = 0; i < n; i += 1) {
    const hourLocal = hourFromTimestamp(timestamps[i] ?? 0, state.timeZone);
    const category = categories[i] ?? "";
    if (hourLocal >= 22 || hourLocal < 6) nightOwl += 1;
    else if (hourLocal >= 5 && hourLocal < 11) earlyBird += 1;
    if (category === "study" || category === "work") scholar += 1;
  }

  const majority = Math.floor(n / 2) + 1;
  if (nightOwl >= majority) return "adult_night_owl";
  if (earlyBird >= majority) return "adult_early_bird";
  if (scholar >= majority) return "adult_scholar";
  return "adult_haunter";
}
