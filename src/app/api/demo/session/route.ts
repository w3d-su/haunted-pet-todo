import { demoCookieHeader, demoUserFromRequest, memoryDemoAllowed } from "@/lib/server/demo-store";
import { json } from "@/lib/server/http";

/** Signed HttpOnly demo user. Only when demo mode is on and Supabase is not configured. */
export async function POST(request: Request): Promise<Response> {
  if (!memoryDemoAllowed()) return json({ error: "Forbidden" }, 403);
  const userId = demoUserFromRequest(request) ?? crypto.randomUUID();
  return json({ userId }, 200, {
    "set-cookie": demoCookieHeader(userId),
  });
}
