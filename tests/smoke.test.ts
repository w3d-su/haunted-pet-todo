import { expect, it } from "vitest";
import { clamp } from "@/lib/clamp";

it("clamps a value into the inclusive range", () => {
  expect(clamp(5, 0, 10)).toBe(5);
  expect(clamp(-1, 0, 10)).toBe(0);
  expect(clamp(11, 0, 10)).toBe(10);
});
