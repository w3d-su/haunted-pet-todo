/** Fixed window. Callers pass `now` so tests do not read the wall clock. */
const buckets = new Map<string, number[]>();

export const AI_LIMIT = 5;
export const AI_WINDOW_MS = 60_000;

export function allowRequest(key: string, limit: number, windowMs: number, now: number): boolean {
  const fresh = (buckets.get(key) ?? []).filter((at) => now - at < windowMs);
  if (fresh.length >= limit) {
    buckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  buckets.set(key, fresh);
  return true;
}

export function allowAi(bucket: string, now: number): boolean {
  return allowRequest(bucket, AI_LIMIT, AI_WINDOW_MS, now);
}

export function clearRateLimits(): void {
  buckets.clear();
}
