import { ZOMBIE_DRAIN_PER_HOUR } from "./constants";
import type { GameEvent } from "./events";
import type { Task } from "./tasks";

export interface ZombieState {
  /** Same as the overdue task's id. */
  readonly taskId: string;
  /** Unix ms when the zombie was spawned. */
  readonly spawnedAt: number;
  readonly slain: boolean;
}

/** One active zombie per overdue, non-deleted task. */
export function activeZombies(tasks: readonly Task[], now: number): ZombieState[] {
  return tasks
    .filter((task) => task.status === "overdue" && task.deletedAt === null)
    .map((task) => ({
      taskId: task.id,
      spawnedAt: task.dueAt ?? now,
      slain: false,
    }));
}

export function makeZombieDrainEvent(
  zombieCount: number,
  fromTime: number,
  toTime: number,
): Extract<GameEvent, { type: "ZOMBIE_DRAIN" }> {
  return {
    type: "ZOMBIE_DRAIN",
    zombieCount,
    fromTime,
    toTime,
  };
}

/** HP damage for `zombieCount` zombies over `hours`. */
export function zombieDamage(zombieCount: number, hours: number): number {
  return zombieCount * ZOMBIE_DRAIN_PER_HOUR * hours;
}
