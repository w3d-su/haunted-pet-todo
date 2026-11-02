import { z } from "zod";
import { badRequest, json, readJson, retryLater, storageFailure } from "@/lib/server/http";
import type { AppDeps } from "@/lib/server/stores";
import { syncWorld } from "@/lib/server/sync";

const HOUR_MS = 3_600_000;
const SHIFT_ATTEMPTS = 3;

export const FastForwardBodySchema = z.union([
  z.object({ hours: z.union([z.literal(1), z.literal(6), z.literal(24)]) }).strict(),
  z.object({ reset: z.literal(true) }).strict(),
]);

/**
 * Add hours to this user's clock offset, then run the same catch-up as a read.
 * Does not write `lastTickAt` past the effective clock. Reset zeros the offset
 * and clamps future cursors so decay does not stall.
 */
export async function postFastForward(request: Request, deps: AppDeps): Promise<Response> {
  if (!deps.demoMode) return json({ error: "Forbidden" }, 403);
  try {
    const stores = await deps.authorize(request);
    if (!stores) return json({ error: "Forbidden" }, 403);
    const parsed = FastForwardBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(parsed.error);

    const systemNow = deps.now();
    let record = await stores.pets.get(stores.userId);
    if (!record) {
      await syncWorld(stores, systemNow, request.headers.get("x-time-zone"), deps.newId);
      record = await stores.pets.get(stores.userId);
      if (!record) return retryLater();
    }

    const resetting = "reset" in parsed.data;
    const hours = "hours" in parsed.data ? parsed.data.hours : 0;
    let shifted = false;
    for (let attempt = 0; attempt < SHIFT_ATTEMPTS; attempt += 1) {
      const current = await stores.pets.get(stores.userId);
      if (!current) return retryLater();
      const clockOffsetMs = resetting ? 0 : current.clockOffsetMs + hours * HOUR_MS;
      const saved = await stores.setClockOffset(stores.userId, {
        clockOffsetMs,
        clampTo: resetting ? systemNow : null,
      });
      if (saved) {
        shifted = true;
        break;
      }
    }
    if (!shifted) return retryLater();

    const world = await syncWorld(
      stores,
      systemNow,
      request.headers.get("x-time-zone"),
      deps.newId,
    );
    return json({ pet: world.pet, now: world.now, clockOffsetMs: world.clockOffsetMs });
  } catch (error) {
    return storageFailure(error);
  }
}
