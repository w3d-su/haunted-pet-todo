import { hourFromTimestamp } from "./evolution";

/** Fewer completions than this do not count as a habit. */
export const HABIT_MIN_SAMPLES = 3;
/** Local hour used for the reminder when there is no habit yet. */
export const DEFAULT_REMINDER_HOUR = 19;

/**
 * The local hour (0–23) in which most of `timestamps` fall, or null when
 * there are fewer than `minSamples`. `timestamps` is newest first, as in
 * `PetState.recentCompletionTimestamps`. A tie goes to the hour of the
 * newest completion among the tied hours.
 */
export function habitualHour(
  timestamps: readonly number[],
  timeZone: string,
  minSamples = HABIT_MIN_SAMPLES,
): number | null {
  if (timestamps.length < minSamples) return null;
  const counts = new Map<number, number>();
  const hours = timestamps.map((ts) => hourFromTimestamp(ts, timeZone));
  for (const hour of hours) counts.set(hour, (counts.get(hour) ?? 0) + 1);
  const top = Math.max(...counts.values());
  return hours.find((hour) => counts.get(hour) === top) ?? null;
}

/** Local hours when the fixed-time daily run stays silent: 22:00 up to 08:00. */
export const QUIET_HOURS_START = 22;
export const QUIET_HOURS_END = 8;

/** True when `hour` (0–23, local) is inside the quiet hours. */
export function isQuietHour(hour: number): boolean {
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}

/** The local hour the reminder waits for: the habit, or the default. */
export function reminderHour(timestamps: readonly number[], timeZone: string): number {
  return habitualHour(timestamps, timeZone) ?? DEFAULT_REMINDER_HOUR;
}
