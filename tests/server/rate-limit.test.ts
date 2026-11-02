import { expect, it } from "vitest";
import { allowRequest, clearRateLimits } from "@/lib/server/rate-limit";

it("allows a fixed number of calls inside the window", () => {
  clearRateLimits();
  const now = 1_000_000;
  expect(allowRequest("epitaph:user", 2, 60_000, now)).toBe(true);
  expect(allowRequest("epitaph:user", 2, 60_000, now + 10)).toBe(true);
  expect(allowRequest("epitaph:user", 2, 60_000, now + 20)).toBe(false);
  expect(allowRequest("epitaph:user", 2, 60_000, now + 60_000)).toBe(true);
});
