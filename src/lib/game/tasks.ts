import {
  OVERDUE_TASK_HP_RESTORE,
  OVERDUE_TASK_HUNGER_RESTORE,
  TASK_HP_RESTORE,
  TASK_HUNGER_RESTORE,
  TASK_MOOD_BOOST,
} from "./constants";
import type { GameEvent } from "./events";

export const TASK_STATUSES = ["todo", "done", "overdue"] as const;
export const TASK_CATEGORIES = [
  "study",
  "work",
  "chores",
  "health",
  "creative",
  "other",
] as const;
export const TASK_SIZES = ["small", "medium", "large"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export type TaskSize = (typeof TASK_SIZES)[number];

export interface Task {
  readonly id: string;
  readonly userId: string;
  readonly title: string;
  readonly notes: string | null;
  readonly category: TaskCategory;
  readonly size: TaskSize;
  readonly status: TaskStatus;
  /** Unix ms. */
  readonly dueAt: number | null;
  /** Unix ms. */
  readonly completedAt: number | null;
  /** Unix ms. Null means the task is still live. */
  readonly deletedAt: number | null;
  readonly parentId: string | null;
  readonly breakdownSuggested: boolean;
  readonly allSubtasksDone: boolean;
  readonly sortOrder: number;
  /** Unix ms. */
  readonly createdAt: number;
}

/** True when the task is past due, not done, and not deleted. */
export function isOverdue(task: Task, now: number): boolean {
  return (
    task.status !== "done" &&
    task.dueAt !== null &&
    task.dueAt <= now &&
    task.deletedAt === null
  );
}

export function taskCompletionDeltas(task: Pick<Task, "status">): {
  hungerRestore: number;
  hpRestore: number;
  moodBoost: number;
} {
  if (task.status === "overdue") {
    return {
      hungerRestore: OVERDUE_TASK_HUNGER_RESTORE,
      hpRestore: OVERDUE_TASK_HP_RESTORE,
      moodBoost: TASK_MOOD_BOOST,
    };
  }
  return {
    hungerRestore: TASK_HUNGER_RESTORE,
    hpRestore: TASK_HP_RESTORE,
    moodBoost: TASK_MOOD_BOOST,
  };
}

export function makeTaskCompletedEvent(
  task: Pick<Task, "id" | "status" | "category">,
  now: number,
): Extract<GameEvent, { type: "TASK_COMPLETED" }> {
  return {
    type: "TASK_COMPLETED",
    taskId: task.id,
    wasOverdue: task.status === "overdue",
    category: task.category,
    completedAt: now,
  };
}

/**
 * Persist the overdue transition for todos whose due time has passed.
 * Already-overdue rows are left alone so a second pass cannot spawn another zombie.
 */
/**
 * Pull event timestamps that are still ahead of `now` back to `now`.
 * `dueAt` stays: it is a deadline the user chose, not a clock cursor.
 */
export function clampFutureTaskTimes(task: Task, now: number): Task {
  const createdAt = task.createdAt > now ? now : task.createdAt;
  const completedAt =
    task.completedAt !== null && task.completedAt > now ? now : task.completedAt;
  const deletedAt = task.deletedAt !== null && task.deletedAt > now ? now : task.deletedAt;
  if (
    createdAt === task.createdAt &&
    completedAt === task.completedAt &&
    deletedAt === task.deletedAt
  ) {
    return task;
  }
  return { ...task, createdAt, completedAt, deletedAt };
}

export function markNewlyOverdue(
  tasks: readonly Task[],
  now: number,
): { tasks: readonly Task[]; overdueTaskIds: readonly string[] } {
  const overdueTaskIds: string[] = [];
  let changed = false;
  const next = tasks.map((task) => {
    if (task.status === "todo" && isOverdue(task, now)) {
      overdueTaskIds.push(task.id);
      changed = true;
      return { ...task, status: "overdue" as const };
    }
    return task;
  });
  return { tasks: changed ? next : tasks, overdueTaskIds };
}
