import type { Clock } from "@/lib/game/clock";

/**
 * Production clock. This is the one `Date.now()` call site used to seed
 * game logic. Pure modules under `src/lib/game/` receive the number.
 */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/** Demo fast-forward adds a per-user offset; it does not move `lastTickAt` by itself. */
export function effectiveNow(systemNow: number, clockOffsetMs: number): number {
  return systemNow + clockOffsetMs;
}
