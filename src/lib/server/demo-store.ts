import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readSupabaseEnvSafe } from "@/lib/db/client";
import { demoModeEnabled, serverEnv } from "@/lib/server/env";
import { createMemoryWorld, type MemoryWorld } from "@/lib/server/memory";
import { DemoLimitError } from "@/lib/server/http";
import type { AuthedStores } from "@/lib/server/stores";
import type { Task } from "@/lib/game/tasks";

export const DEMO_COOKIE = "haunted_demo";
/** How many demo users one process keeps. A full process refuses new sessions. */
export const DEMO_USER_CAP = 32;
/** Live tasks one demo user can store. Updates of an existing task still fit. */
export const DEMO_TASK_CAP = 100;
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

export function demoWorldForSession(): MemoryWorld {
  return demoWorld();
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

/**
 * Refresh `userId`, or admit them if a slot is free. Idle users past the TTL
 * are dropped. A full list does not evict someone who is still active.
 * Returns null when a new user is refused.
 */
export function retainDemoUser(
  world: MemoryWorld,
  userId: string,
  now: number,
  options?: { cap?: number; ttlMs?: number; touches?: DemoTouch[] },
): DemoTouch[] | null {
  const cap = options?.cap ?? DEMO_USER_CAP;
  const ttlMs = options?.ttlMs ?? DEMO_TTL_MS;
  const previous = options?.touches ?? demoTouches();
  const expired = previous.filter((entry) => now - entry.at > ttlMs);
  for (const entry of expired) dropDemoUser(world, entry.userId);
  const live = previous.filter((entry) => now - entry.at <= ttlMs && entry.userId !== userId);
  const already = previous.some((entry) => entry.userId === userId && now - entry.at <= ttlMs);
  if (!already && live.length >= cap) {
    if (!options?.touches) {
      const holder = globalThis as typeof globalThis & { __hauntedDemoTouches?: DemoTouch[] };
      holder.__hauntedDemoTouches = live;
    }
    return null;
  }
  const next = [...live, { userId, at: now }];
  if (!options?.touches) {
    const holder = globalThis as typeof globalThis & { __hauntedDemoTouches?: DemoTouch[] };
    holder.__hauntedDemoTouches = next;
  }
  return next;
}

export function guardDemoTask(world: MemoryWorld, task: Pick<Task, "id" | "userId">, cap = DEMO_TASK_CAP): void {
  const live = world.tasks.filter(
    (item) => item.userId === task.userId && item.deletedAt === null && item.id !== task.id,
  );
  if (live.length >= cap) throw new DemoLimitError();
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
  if (!retainDemoUser(world, userId, Date.now())) return null;
  const deps = world.deps(userId, () => 0, true);
  const stores = await deps.authorize(new Request("http://demo.local"));
  if (!stores) return null;
  return {
    ...stores,
    tasks: {
      ...stores.tasks,
      async upsertTask(task) {
        guardDemoTask(world, task);
        return stores.tasks.upsertTask(task);
      },
    },
  };
}

/** Secure on https, and always in production. Plain http (a LAN IP) keeps the cookie. */
export function cookieIsSecure(request: Request): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]?.trim() === "https";
  return new URL(request.url).protocol === "https:";
}

export function demoCookieHeader(userId: string, secure: boolean): string {
  const signed = encodeURIComponent(signDemoUser(userId));
  const locked = secure ? "; Secure" : "";
  return `${DEMO_COOKIE}=${signed}; Path=/; HttpOnly; SameSite=Lax${locked}; Max-Age=604800`;
}
