import { buildNagPrompt, nagLevelFor } from "@/lib/ai/nag";
import { dictionaryFor } from "@/lib/i18n/dictionaries";
import { calendarDay } from "@/lib/game/evolution";
import { hpSpent, type PetState } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";
import type { PushSendResult } from "@/lib/push/notify";
import type { AuthedStores, PushSubscription } from "@/lib/server/stores";

export interface PushMessage {
  readonly title: string;
  readonly body: string;
  readonly tag?: string;
}

export type DeliverPush = (
  subscription: PushSubscription,
  payload: PushMessage,
) => Promise<PushSendResult>;

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
 * One nag per user per local day. `claim_nag_day` is the guard, so the daily
 * cron and the hourly reminder never both send on the same local day.
 * Returns true when this call claimed the day and sent.
 */
export async function remind(
  stores: AuthedStores,
  pet: PetState,
  tasks: readonly Task[],
  now: number,
  deliverPush: DeliverPush,
): Promise<boolean> {
  if (pet.status !== "alive" || pet.stage === "egg" || hpSpent(pet.hp)) return false;
  if (!hasOpenTask(tasks) || finishedToday(tasks, now, pet.timeZone)) return false;
  const subscriptions = await stores.push.list(stores.userId);
  if (subscriptions.length === 0) return false;
  const day = calendarDay(now, pet.timeZone);
  const claimed = await stores.nags.claimDay(stores.userId, day);
  if (!claimed) return false;
  const level = nagLevelFor(tasks, now);
  for (const subscription of subscriptions) {
    const locale = subscription.locale ?? "en";
    const result = await deliverPush(subscription, {
      title: dictionaryFor(locale).meta.title,
      body: buildNagPrompt(pet, tasks, level, locale),
      tag: `nag-${day}`,
    });
    if (result === "gone") {
      await stores.push.remove(stores.userId, subscription.endpoint);
    }
  }
  return true;
}

/** Runs `work` over `ids` with at most `concurrency` in flight. */
export async function forEachLimited(
  ids: readonly string[],
  concurrency: number,
  work: (id: string) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
    for (;;) {
      const id = ids[cursor];
      cursor += 1;
      if (id === undefined) return;
      await work(id);
    }
  });
  await Promise.all(workers);
}
