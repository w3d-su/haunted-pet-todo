import { DEMO_COOKIE, demoUserFromRequest } from "@/lib/server/demo-store";
import { demoModeEnabled } from "@/lib/server/env";
import { json } from "@/lib/server/http";

/** HttpOnly demo user. Only issued when the server has DEMO_MODE=true. */
export async function POST(request: Request): Promise<Response> {
  if (!demoModeEnabled()) return json({ error: "Forbidden" }, 403);
  const userId = demoUserFromRequest(request) ?? crypto.randomUUID();
  return json({ userId }, 200, {
    "set-cookie": `${DEMO_COOKIE}=${userId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
  });
}
