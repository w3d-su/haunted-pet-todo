import { buildNagPrompt, nagLevelFor } from "@/lib/ai/nag";
import { listPetUserIds } from "@/lib/db/pet";
import { createServiceClient } from "@/lib/db/client";
import { calendarDay } from "@/lib/game/evolution";
import { hpSpent, type PetState } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";
import { sendPushNotification, type PushSendResult } from "@/lib/push/notify";
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
}

function finishedToday(tasks: readonly Task[], now: number, timeZone: string): boolean {
  const today = calendarDay(now, timeZone);
  return tasks.some(
    (task) => task.completedAt !== null && calendarDay(task.completedAt, timeZone) === today,
  );
}

function hasOpenTask(tasks: readonly Task[]): boolean {
  return tasks.some((task) => task.deletedAt === null && task.status !== "done");
}

/**
 * One nag per user per local day, during the daily run. Hobby cannot run an
 * hourly cron, so this does not wait for a habitual hour.
 */
async function remind(stores: AuthedStores, pet: PetState, now: number, deps: CronDeps): Promise<void> {
  if (pet.status !== "alive" || pet.stage === "egg" || hpSpent(pet.hp)) return;
  const tasks = await stores.tasks.getTasks(stores.userId);
  if (!hasOpenTask(tasks) || finishedToday(tasks, now, pet.timeZone)) return;
  const subscriptions = await stores.push.list(stores.userId);
  if (subscriptions.length === 0) return;
  const day = calendarDay(now, pet.timeZone);
  const claimed = await stores.nags.claimDay(stores.userId, day);
  if (!claimed) return;
  const body = buildNagPrompt(pet, tasks, nagLevelFor(tasks, now));
  for (const subscription of subscriptions) {
    const result = await deps.deliverPush(subscription, {
      title: "Haunted Pet To-Do",
      body,
      tag: `nag-${day}`,
    });
    if (result === "gone") {
      await stores.push.remove(stores.userId, subscription.endpoint);
    }
  }
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
            if (before.state.status === "alive" && hpSpent(world.pet.hp)) deaths += 1;
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
