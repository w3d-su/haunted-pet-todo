import fc from "fast-check";
import { expect, it } from "vitest";
import { clamp } from "@/lib/clamp";

/** Every fast-check property in this file uses this many runs. */
const RUNS = 100;

it("clamp stays inside bounds, is the identity in range, and is idempotent", () => {
  fc.assert(
    fc.property(fc.integer(), fc.integer(), fc.integer(), (value, a, b) => {
      const min = Math.min(a, b);
      const max = Math.max(a, b);
      const once = clamp(value, min, max);
      const twice = clamp(once, min, max);

      expect(once).toBeGreaterThanOrEqual(min);
      expect(once).toBeLessThanOrEqual(max);
      expect(twice).toBe(once);
      if (value >= min && value <= max) expect(once).toBe(value);
    }),
    { numRuns: RUNS },
  );
});
