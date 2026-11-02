/** All game-logic timing goes through this interface. Unix milliseconds. */
export interface Clock {
  now(): number;
}

/**
 * Deterministic clock for tests and demo fast-forward.
 * `base` is a fixed Unix ms start. `offsetMs` advances only forward.
 *
 * The wall clock lives in `src/lib/server/clock.ts` (`SystemClock`).
 * This module does not read the wall clock.
 */
export class OffsetClock implements Clock {
  private offsetMs: number;

  constructor(
    private readonly base: number,
    initialOffset = 0,
  ) {
    this.offsetMs = initialOffset;
  }

  now(): number {
    return this.base + this.offsetMs;
  }

  advance(ms: number): void {
    if (ms < 0) throw new Error("OffsetClock cannot go backwards");
    this.offsetMs += ms;
  }

  reset(): void {
    this.offsetMs = 0;
  }

  get offset(): number {
    return this.offsetMs;
  }
}
