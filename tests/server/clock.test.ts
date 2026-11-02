import { expect, it } from "vitest";
import { SystemClock, effectiveNow } from "@/lib/server/clock";

it("SystemClock.now stays inside a Date.now window", () => {
  const before = Date.now();
  const value = new SystemClock().now();
  const after = Date.now();
  expect(value).toBeGreaterThanOrEqual(before);
  expect(value).toBeLessThanOrEqual(after);
});

it("adds the per-user offset instead of moving lastTickAt", () => {
  expect(effectiveNow(1_000, 3_600_000)).toBe(1_000 + 3_600_000);
});
