import { productionDeliverPush } from "@/app/api/cron/decay/handlers";
import { createServiceClient } from "@/lib/db/client";
import { listPushUserIds } from "@/lib/db/push";
import { hourFromTimestamp } from "@/lib/game/evolution";
import { reminderHour } from "@/lib/game/habit";
import { SystemClock } from "@/lib/server/clock";
import { serverEnv } from "@/lib/server/env";
import { json, storageFailure } from "@/lib/server/http";
import { productionServiceStores } from "@/lib/server/production";
import { forEachLimited, remind, type DeliverPush } from "@/lib/server/remind";
import { bearerMatchesSecret } from "@/lib/server/secret";
import type { AuthedStores } from "@/lib/server/stores";
import { syncWorld } from "@/lib/server/sync";

const REMIND_CONCURRENCY = 4;

export interface RemindDeps {
  now(): number;
  newId(): string;
  secret: string | undefined;
  /** Users with at least one push subscription. */
  listUserIds(): Promise<string[]>;
  storesFor(userId: string): Promise<AuthedStores>;
  deliverPush: DeliverPush;
}

/**
 * Hourly reminder, called by an external scheduler with the cron secret.
 * A user is nagged once the local hour reaches their reminder hour: the
 * most common hour of their last 10 completions, or 19:00 with fewer than
 * three. `>=` rather than `==` means a late or skipped run still sends
 * later that day. `claim_nag_day` keeps it to one nag per local day.
 */
export async function runRemindCron(request: Request, deps: RemindDeps): Promise<Response> {
  if (!bearerMatchesSecret(request.headers.get("authorization"), deps.secret)) {
    return json({ error: "Unauthorized" }, 401);
  }
  try {
    const userIds = await deps.listUserIds();
    let checked = 0;
    let sent = 0;
    let failures = 0;
    await forEachLimited(userIds, REMIND_CONCURRENCY, async (userId) => {
      try {
        const stores = await deps.storesFor(userId);
        const before = await stores.pets.get(userId);
        if (!before) return;
        const world = await syncWorld(stores, deps.now(), null, deps.newId);
        checked += 1;
        const { pet } = world;
        const hour = reminderHour(pet.recentCompletionTimestamps, pet.timeZone);
        if (hourFromTimestamp(world.now, pet.timeZone) < hour) return;
        if (await remind(stores, pet, world.tasks, world.now, deps.deliverPush)) sent += 1;
      } catch (error) {
        console.error(error);
        failures += 1;
      }
    });
    return json({ checked, sent, failures });
  } catch (error) {
    return storageFailure(error);
  }
}

export function productionRemindDeps(): RemindDeps {
  const clock = new SystemClock();
  return {
    now: () => clock.now(),
    newId: () => crypto.randomUUID(),
    secret: serverEnv("CRON_SECRET"),
    async listUserIds() {
      return listPushUserIds(createServiceClient());
    },
    async storesFor(userId) {
      return productionServiceStores(userId);
    },
    deliverPush: productionDeliverPush,
  };
}
