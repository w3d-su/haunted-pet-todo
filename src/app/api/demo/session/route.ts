import {
  cookieIsSecure,
  demoCookieHeader,
  demoUserFromRequest,
  demoWorldForSession,
  memoryDemoAllowed,
  retainDemoUser,
} from "@/lib/server/demo-store";
import { json } from "@/lib/server/http";

/**
 * Signed HttpOnly demo user. Only when demo mode is on and Supabase is not configured.
 * A full process refuses a new user instead of evicting someone who is still active.
 */
export async function POST(request: Request): Promise<Response> {
  if (!memoryDemoAllowed()) return json({ error: "Forbidden" }, 403);
  const existing = demoUserFromRequest(request);
  const userId = existing ?? crypto.randomUUID();
  const admitted = retainDemoUser(demoWorldForSession(), userId, Date.now());
  if (!admitted) return json({ error: "Demo is full" }, 429);
  return json({ userId }, 200, {
    "set-cookie": demoCookieHeader(userId, cookieIsSecure(request)),
  });
}
