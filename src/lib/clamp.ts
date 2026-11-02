/** Inclusive numeric clamp. A pure stand-in so the test runner has something real to exercise. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
