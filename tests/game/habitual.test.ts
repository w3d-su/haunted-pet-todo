import { expect, it } from "vitest";
import { computeHabitualHour, hasCompletionToday, type HabitualEvent } from "@/lib/game/decay";

function completed(at: number): HabitualEvent {
  return { eventType: "TASK_COMPLETED", payload: { completedAt: at } };
}

it("returns the most common hour and lets the lowest hour win a tie", () => {
  const morning = Date.UTC(2026, 6, 1, 8);
  const night = Date.UTC(2026, 6, 2, 22);
  expect(computeHabitualHour([completed(morning), completed(morning), completed(night)], "UTC")).toBe(
    8,
  );
  expect(computeHabitualHour([completed(morning), completed(night)], "UTC")).toBe(8);
  expect(computeHabitualHour([], "UTC")).toBeNull();
  expect(
    computeHabitualHour([{ eventType: "TASK_CREATED", payload: { completedAt: morning } }], "UTC"),
  ).toBeNull();
});

it("uses only the last 30 completions", () => {
  const night = Array.from({ length: 16 }, (_, index) => completed(Date.UTC(2026, 0, index + 1, 18)));
  const morning = Array.from({ length: 15 }, (_, index) => completed(Date.UTC(2026, 1, index + 1, 3)));
  // Dropping the oldest night completion ties the hours, so the lower hour wins.
  // Counting every event would leave night ahead.
  expect(computeHabitualHour([...night, ...morning], "UTC")).toBe(3);
});

it("knows whether a completion landed today", () => {
  const now = Date.UTC(2026, 6, 4, 15);
  expect(hasCompletionToday([completed(now - 3_600_000)], now, "UTC")).toBe(true);
  expect(hasCompletionToday([completed(Date.UTC(2026, 6, 3, 15))], now, "UTC")).toBe(false);
});
