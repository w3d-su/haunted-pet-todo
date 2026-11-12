import type { Task } from "@/lib/game/tasks";
import { en } from "@/lib/i18n/en";
import { json } from "@/lib/server/http";
import type { AuthedStores } from "@/lib/server/stores";

/** Same as the task form's `maxLength`. */
export const MAX_TITLE_LENGTH = 120;
export const MAX_NOTES_LENGTH = 2000;
/** Tasks one user may have that are not done. */
export const MAX_OPEN_TASKS = 100;
/**
 * Rows one user keeps, done ones included. Past this the oldest done tasks
 * are soft-deleted. It stays well under PostgREST's 1000-row page, so a
 * task read is never cut short.
 */
export const MAX_STORED_TASKS = 300;
/** `Date` cannot represent a later instant, and `toISOString` throws on one. */
export const MAX_TIMESTAMP_MS = 8_640_000_000_000_000;

/** True when `adding` more open tasks still fit under the cap. */
export function openTasksFit(tasks: readonly Task[], adding: number): boolean {
  const open = tasks.filter((task) => task.deletedAt === null && task.status !== "done").length;
  return open + adding <= MAX_OPEN_TASKS;
}

export function tooManyTasks(): Response {
  return json({ error: en.errors.tooManyTasks }, 429);
}

/**
 * Soft-delete the oldest done tasks until `tasks` plus `added` new rows fit
 * under the stored cap. Open tasks are never removed here.
 */
export async function trimDoneTasks(
  stores: AuthedStores,
  tasks: readonly Task[],
  added: number,
  now: number,
): Promise<void> {
  const live = tasks.filter((task) => task.deletedAt === null);
  let excess = live.length + added - MAX_STORED_TASKS;
  if (excess <= 0) return;
  const done = live
    .filter((task) => task.status === "done")
    .sort(
      (left, right) =>
        (left.completedAt ?? 0) - (right.completedAt ?? 0) || left.id.localeCompare(right.id),
    );
  for (const task of done) {
    if (excess <= 0) return;
    await stores.tasks.softDeleteTask(task.id, stores.userId, now);
    excess -= 1;
  }
}
