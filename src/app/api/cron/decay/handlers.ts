import { postEpitaph, productionEpitaphDeps } from "@/app/api/ai/epitaph/handlers";
import { buildNagPrompt, nagLevelFor } from "@/lib/ai/nag";
import { listPetUserIds } from "@/lib/db/pet";
import { createServiceClient } from "@/lib/db/client";
import { computeHabitualHour, hasCompletionToday } from "@/lib/game/decay";
import { hourFromTimestamp } from "@/lib/game/evolution";
import { hpSpent, type PetState } from "@/lib/game/pet";
import { sendPushNotification } from "@/lib/push/notify";
import { serverEnv } from "@/lib/server/env";
import { json, storageFailure } from "@/lib/server/http";
import { productionServiceStores } from "@/lib/server/production";
import { bearerMatchesSecret } from "@/lib/server/secret";
import { SystemClock } from "@/lib/server/clock";
import type { AuthedStores, PushSubscription } from "@/lib/server/stores";
import { syncWorld } from "@/lib/server/sync";

export interface PushMessage {
  readonly title: string;
  readonly body: string;
  readonly tag?: string;
}

/**
 * Four pets at a time. A few round trips of about 20ms each means roughly
 * 2500 pets finish inside Hobby's 300s Fluid limit. The route does not set
 * `maxDuration`. Epitaph is one extra write per death, not a model call for
 * every pet; a slow model reply is logged and the other workers continue.
 */
const CRON_CONCURRENCY = 4;

export interface CronDeps {
  now(): number;
  newId(): string;
  secret: string | undefined;
  listUserIds(): Promise<string[]>;
  storesFor(userId: string): Promise<AuthedStores>;
  /** POST `/api/ai/epitaph` for a pet that died on this tick. */
  requestEpitaph(userId: string): Promise<void>;
  deliverPush(subscription: PushSubscription, payload: PushMessage): Promise<void>;
}

/**
 * Nag when the wall-clock hour in the pet's zone matches the habitual
 * completion hour and nothing was finished today. Game-clock offsets do
 * not move this: a push is about the person's real hour.
 */
async function remind(stores: AuthedStores, pet: PetState, now: number, deps: CronDeps): Promise<void> {
  if (pet.status !== "alive" || pet.stage === "egg" || hpSpent(pet.hp)) return;
  const events = await stores.events.listEvents(stores.userId);
  const habitual = computeHabitualHour(events, pet.timeZone);
  if (habitual === null) return;
  if (hourFromTimestamp(now, pet.timeZone) !== habitual) return;
  if (hasCompletionToday(events, now, pet.timeZone)) return;
  const subscriptions = await stores.push.list(stores.userId);
  if (subscriptions.length === 0) return;
  const tasks = await stores.tasks.getTasks(stores.userId);
  const body = buildNagPrompt(pet, tasks, nagLevelFor(tasks, now));
  for (const subscription of subscriptions) {
    try {
      await deps.deliverPush(subscription, {
        title: "Haunted Pet To-Do",
        body,
        tag: `nag-${habitual}`,
      });
    } catch (error) {
      console.error(error);
    }
  }
}

/**
 * Daily backstop. The same catch-up as a signed-in read: mark newly overdue
 * tasks, decay, and apply zombie drain for the hours each zombie was overdue.
 * A new death is posted to `/api/ai/epitaph`.
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
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(CRON_CONCURRENCY, userIds.length) },
      async () => {
        for (;;) {
          const index = cursor;
          cursor += 1;
          const userId = userIds[index];
          if (!userId) return;
          try {
            const stores = await deps.storesFor(userId);
            const before = await stores.pets.get(userId);
            if (!before) continue;
            const world = await syncWorld(stores, deps.now(), null, deps.newId);
            processed += 1;
            if (before.state.status === "alive" && hpSpent(world.pet.hp)) {
              deaths += 1;
              try {
                await deps.requestEpitaph(userId);
              } catch (error) {
                console.error(error);
              }
            }
            try {
              await remind(stores, world.pet, deps.now(), deps);
            } catch (error) {
              console.error(error);
            }
          } catch (error) {
            console.error(error);
            failures += 1;
          }
        }
      },
    );
    await Promise.all(workers);
    return json({ processed, deaths, failures });
  } catch (error) {
    return storageFailure(error);
  }
}

export function productionCronDeps(): CronDeps {
  const clock = new SystemClock();
  const secret = serverEnv("CRON_SECRET");
  return {
    now: () => clock.now(),
    newId: () => crypto.randomUUID(),
    secret,
    async listUserIds() {
      return listPetUserIds(createServiceClient());
    },
    async storesFor(userId) {
      return productionServiceStores(userId);
    },
    async requestEpitaph(userId) {
      const response = await postEpitaph(
        new Request("http://internal/api/ai/epitaph", {
          method: "POST",
          headers: {
            authorization: `Bearer ${secret ?? ""}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ userId }),
        }),
        productionEpitaphDeps(),
      );
      if (!response.ok) console.error("epitaph request failed", response.status);
    },
    deliverPush(subscription, payload) {
      return sendPushNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
    },
  };
}
