import type { PetState } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";

export interface PetStore {
  get(userId: string): Promise<{ state: PetState; clockOffsetMs: number } | null>;
  save(state: PetState): Promise<PetState>;
}

export interface TaskStore {
  getTasks(userId: string): Promise<Task[]>;
  upsertTask(task: Task): Promise<Task>;
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
