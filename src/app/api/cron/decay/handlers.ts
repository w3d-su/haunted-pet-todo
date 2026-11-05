import { listPetUserIds } from "@/lib/db/pet";
import { createServiceClient } from "@/lib/db/client";
import { hpSpent } from "@/lib/game/pet";
import { sendPushNotification, type PushSendResult } from "@/lib/push/notify";
import { serverEnv } from "@/lib/server/env";
import { json, storageFailure } from "@/lib/server/http";
import { productionServiceStores } from "@/lib/server/production";
import { forEachLimited, remind, type PushMessage } from "@/lib/server/remind";
import { bearerMatchesSecret } from "@/lib/server/secret";
import { SystemClock } from "@/lib/server/clock";
import type { AuthedStores, PushSubscription } from "@/lib/server/stores";
import { syncWorld } from "@/lib/server/sync";

export type { PushMessage } from "@/lib/server/remind";

/**
 * Four pets at a time. A few round trips of about 20ms each means roughly
 * 2500 pets finish inside Hobby's 300s Fluid limit. The route does not set
 * `maxDuration`. This job records a death and does not call the model.
 */
const CRON_CONCURRENCY = 4;

export interface CronDeps {
  now(): number;
  newId(): string;
  secret: string | undefined;
  listUserIds(): Promise<string[]>;
  storesFor(userId: string): Promise<AuthedStores>;
  deliverPush(subscription: PushSubscription, payload: PushMessage): Promise<PushSendResult>;
  /**
   * Send the once-a-day nag from this run. Default true. Production sets it
   * false when `HOURLY_REMINDERS=true`, because `/api/cron/remind` then sends
   * the nag at each user's local reminder hour.
   */
  dailyNag?: boolean;
}

/**
 * Daily backstop. The same catch-up as a signed-in read: mark newly overdue
 * tasks, decay, and apply zombie drain. A death is counted here. The epitaph
 * is generated later, when the tombstone is viewed.
 */
export async function runDecayCron(request: Request, deps: CronDeps): Promise<Response> {
  if (!bearerMatchesSecret(request.headers.get("authorization"), deps.secret)) {
    return json({ error: "Unauthorized" }, 401);
  }
  try {
    const userIds = await deps.listUserIds();
    let processed = 0;
    let deaths = 0;
    let failures = 0;
    await forEachLimited(userIds, CRON_CONCURRENCY, async (userId) => {
      try {
        const stores = await deps.storesFor(userId);
        const before = await stores.pets.get(userId);
        if (!before) return;
        const world = await syncWorld(stores, deps.now(), null, deps.newId);
        processed += 1;
        if (before.state.status === "alive" && hpSpent(world.pet.hp)) deaths += 1;
        if (deps.dailyNag === false) return;
        try {
          await remind(stores, world.pet, world.tasks, world.now, (subscription, payload) =>
            deps.deliverPush(subscription, payload),
          );
        } catch (error) {
          console.error(error);
        }
      } catch (error) {
        console.error(error);
        failures += 1;
      }
    });
    return json({ processed, deaths, failures });
  } catch (error) {
    return storageFailure(error);
  }
}

export function productionDeliverPush(
  subscription: PushSubscription,
  payload: PushMessage,
): Promise<PushSendResult> {
  return sendPushNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    payload,
  );
}

export function productionCronDeps(): CronDeps {
  const clock = new SystemClock();
  return {
    now: () => clock.now(),
    newId: () => crypto.randomUUID(),
    secret: serverEnv("CRON_SECRET"),
    async listUserIds() {
      return listPetUserIds(createServiceClient());
    },
    async storesFor(userId) {
      return productionServiceStores(userId);
    },
    deliverPush: productionDeliverPush,
    dailyNag: serverEnv("HOURLY_REMINDERS") !== "true",
  };
}
