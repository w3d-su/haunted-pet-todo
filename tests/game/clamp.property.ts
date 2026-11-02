import fc from "fast-check";
import { expect, it } from "vitest";
import { clamp } from "@/lib/clamp";

it("clamp stays inside the inclusive bounds", () => {
  fc.assert(
    fc.property(fc.integer(), fc.integer(), fc.integer(), (value, a, b) => {
      const min = Math.min(a, b);
      const max = Math.max(a, b);
      const result = clamp(value, min, max);
      expect(result).toBeGreaterThanOrEqual(min);
      expect(result).toBeLessThanOrEqual(max);
    }),
  );
});
