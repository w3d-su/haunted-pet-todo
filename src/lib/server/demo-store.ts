import { createMemoryWorld, type MemoryWorld } from "@/lib/server/memory";
import type { AuthedStores } from "@/lib/server/stores";

export const DEMO_COOKIE = "haunted_demo";

const USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function demoWorld(): MemoryWorld {
  const holder = globalThis as typeof globalThis & { __hauntedDemo?: MemoryWorld };
  if (!holder.__hauntedDemo) holder.__hauntedDemo = createMemoryWorld();
  return holder.__hauntedDemo;
}

export function demoUserFromRequest(request: Request): string | null {
  const raw = request.headers.get("cookie") ?? "";
  const match = new RegExp(`(?:^|;\\s*)${DEMO_COOKIE}=([^;]+)`).exec(raw);
  if (!match?.[1]) return null;
  let value = match[1];
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  return USER_ID.test(value) ? value : null;
}

/** Local play when Supabase is not configured. Gated by the caller on DEMO_MODE. */
export async function authorizeDemo(request: Request): Promise<AuthedStores | null> {
  const userId = demoUserFromRequest(request);
  if (!userId) return null;
  const deps = demoWorld().deps(userId, () => 0, true);
  return deps.authorize(new Request("http://demo.local"));
}
