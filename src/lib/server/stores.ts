import type { PetState } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";

export interface PetSnapshot {
  readonly state: PetState;
  readonly clockOffsetMs: number;
  /** 0 means the row does not exist yet. */
  readonly version: number;
}

export interface PetStore {
  get(userId: string): Promise<PetSnapshot | null>;
  /**
   * Insert when `expectedVersion` is 0. Otherwise compare-and-swap.
   * Returns null when the version does not match.
   */
  save(state: PetState, expectedVersion: number): Promise<PetSnapshot | null>;
}

export interface TaskStore {
  getTasks(userId: string): Promise<Task[]>;
  upsertTask(task: Task): Promise<Task>;
  /**
   * Set status to done only if the stored row is not already done.
   * The loser of a race gets null.
   */
  claimDone(task: Task, now: number): Promise<Task | null>;
  softDeleteTask(taskId: string, userId: string, now: number): Promise<Task | null>;
}

export interface EventStore {
  appendEvent(
    userId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
}

export interface AuthedStores {
  readonly userId: string;
  readonly pets: PetStore;
  readonly tasks: TaskStore;
  readonly events: EventStore;
}

/** Route handlers depend on this port. Tests pass an in-memory implementation. */
export interface AppDeps {
  now(): number;
  newId(): string;
  authorize(request: Request): Promise<AuthedStores | null>;
}
