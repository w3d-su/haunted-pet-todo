import fc from "fast-check";
import { expect, it } from "vitest";
import { DEFAULT_REMINDER_HOUR, habitualHour, isQuietHour, reminderHour } from "@/lib/game/habit";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BASE = Date.UTC(2026, 10, 1);

/** UTC timestamps at the given hours on consecutive days, newest first. */
function at(...hours: number[]): number[] {
  return hours.map((hour, index) => BASE + (hours.length - index) * DAY + hour * HOUR);
}

it("returns null below the minimum sample", () => {
  expect(habitualHour(at(21, 21), "UTC")).toBeNull();
  expect(reminderHour(at(21, 21), "UTC")).toBe(DEFAULT_REMINDER_HOUR);
});

it("picks the most common local hour", () => {
  expect(habitualHour(at(9, 21, 21, 14, 21), "UTC")).toBe(21);
});

it("breaks a tie with the newest completion", () => {
  expect(habitualHour(at(8, 22, 8, 22), "UTC")).toBe(8);
  expect(habitualHour(at(22, 8, 22, 8), "UTC")).toBe(22);
});

it("uses the pet's time zone", () => {
  // 13:00 UTC is 21:00 in Taipei.
  expect(habitualHour(at(13, 13, 13), "Asia/Taipei")).toBe(21);
});

it("is null or an hour in 0..23", () => {
  fc.assert(
    fc.property(fc.array(fc.integer({ min: 0, max: 4_102_444_800_000 }), { maxLength: 10 }), (ts) => {
      const hour = habitualHour(ts, "America/New_York");
      return hour === null || (Number.isInteger(hour) && hour >= 0 && hour <= 23);
    }),
  );
});

it("treats 22:00 up to 08:00 as quiet hours", () => {
  expect([21, 22, 23, 0, 7, 8].map((hour) => isQuietHour(hour))).toEqual([
    false,
    true,
    true,
    true,
    true,
    false,
  ]);
});
