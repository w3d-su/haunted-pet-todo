import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readSupabaseEnvSafe } from "@/lib/db/client";
import { demoModeEnabled, serverEnv } from "@/lib/server/env";
import { createMemoryWorld, type MemoryWorld } from "@/lib/server/memory";
import type { AuthedStores } from "@/lib/server/stores";

export const DEMO_COOKIE = "haunted_demo";
/** How many demo users one process keeps. Older ones are dropped. */
export const DEMO_USER_CAP = 32;
const DEMO_TTL_MS = 30 * 60 * 1000;

const USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DemoTouch {
  userId: string;
  at: number;
}

/** In-memory play is only for a machine that has no Supabase project configured. */
export function memoryDemoAllowed(): boolean {
  return demoModeEnabled() && readSupabaseEnvSafe() === null;
}

function demoKey(): Buffer {
  const configured = serverEnv("DEMO_COOKIE_SECRET");
  if (configured) return Buffer.from(configured);
  const holder = globalThis as typeof globalThis & { __hauntedDemoKey?: Buffer };
  if (!holder.__hauntedDemoKey) holder.__hauntedDemoKey = randomBytes(32);
  return holder.__hauntedDemoKey;
}

export function signDemoUser(userId: string, key: Buffer = demoKey()): string {
  const mac = createHmac("sha256", key).update(userId).digest("base64url");
  return `${userId}.${mac}`;
}

export function verifyDemoUser(token: string, key: Buffer = demoKey()): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!USER_ID.test(userId)) return null;
  const expected = createHmac("sha256", key).update(userId).digest("base64url");
  const left = createHash("sha256").update(mac).digest();
  const right = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(left, right)) return null;
  return userId;
}

function demoWorld(): MemoryWorld {
  const holder = globalThis as typeof globalThis & { __hauntedDemo?: MemoryWorld };
  if (!holder.__hauntedDemo) holder.__hauntedDemo = createMemoryWorld();
  return holder.__hauntedDemo;
}

function demoTouches(): DemoTouch[] {
  const holder = globalThis as typeof globalThis & { __hauntedDemoTouches?: DemoTouch[] };
  if (!holder.__hauntedDemoTouches) holder.__hauntedDemoTouches = [];
  return holder.__hauntedDemoTouches;
}

export function dropDemoUser(world: MemoryWorld, userId: string): void {
  world.pets.delete(userId);
  for (let index = world.tasks.length - 1; index >= 0; index -= 1) {
    if (world.tasks[index]?.userId === userId) world.tasks.splice(index, 1);
  }
  for (let index = world.events.length - 1; index >= 0; index -= 1) {
    if (world.events[index]?.userId === userId) world.events.splice(index, 1);
  }
}

/** Keep `userId` and evict expired or overflow users. Returns the surviving order, oldest first. */
export function retainDemoUser(
  world: MemoryWorld,
  userId: string,
  now: number,
  options?: { cap?: number; ttlMs?: number; touches?: DemoTouch[] },
): DemoTouch[] {
  const cap = options?.cap ?? DEMO_USER_CAP;
  const ttlMs = options?.ttlMs ?? DEMO_TTL_MS;
  const previous = options?.touches ?? demoTouches();
  const expired = previous.filter((entry) => now - entry.at > ttlMs);
  for (const entry of expired) dropDemoUser(world, entry.userId);
  const next = previous.filter((entry) => now - entry.at <= ttlMs && entry.userId !== userId);
  next.push({ userId, at: now });
  while (next.length > cap) {
    const evicted = next.shift();
    if (evicted) dropDemoUser(world, evicted.userId);
  }
  if (!options?.touches) {
    const holder = globalThis as typeof globalThis & { __hauntedDemoTouches?: DemoTouch[] };
    holder.__hauntedDemoTouches = next;
  }
  return next;
}

function cookieValue(request: Request): string | null {
  const raw = request.headers.get("cookie") ?? "";
  const match = new RegExp(`(?:^|;\\s*)${DEMO_COOKIE}=([^;]+)`).exec(raw);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function demoUserFromRequest(request: Request): string | null {
  const value = cookieValue(request);
  if (!value) return null;
  return verifyDemoUser(value);
}

/** Local play when Supabase is not configured. The caller also checks DEMO_MODE. */
export async function authorizeDemo(request: Request): Promise<AuthedStores | null> {
  if (!memoryDemoAllowed()) return null;
  const userId = demoUserFromRequest(request);
  if (!userId) return null;
  const world = demoWorld();
  retainDemoUser(world, userId, Date.now());
  const deps = world.deps(userId, () => 0, true);
  return deps.authorize(new Request("http://demo.local"));
}

export function demoCookieHeader(userId: string): string {
  const signed = encodeURIComponent(signDemoUser(userId));
  return `${DEMO_COOKIE}=${signed}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=604800`;
}
