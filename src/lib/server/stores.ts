import type { Locale } from "@/lib/i18n/locale";
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
  /** Insert a new task. Not used for status transitions. */
  upsertTask(task: Task): Promise<Task>;
  /**
   * todo → overdue only. Returns null when the row is no longer todo
   * (for example it was just completed).
   */
  markOverdue(taskId: string, userId: string): Promise<Task | null>;
  /**
   * Field update, including overdue → todo when the due time moves forward.
   * Returns null when the stored row is already done.
   */
  updateOpen(task: Task): Promise<Task | null>;
  softDeleteTask(taskId: string, userId: string, now: number): Promise<Task | null>;
  /**
   * Set `breakdownSuggested` only while it is false and the task is not done.
   * Returns null when another request already claimed it, or the task is done.
   */
  claimBreakdown(taskId: string, userId: string): Promise<Task | null>;
  /** Clear a claim that did not manage to write subtasks. */
  releaseBreakdown(taskId: string, userId: string): Promise<void>;
}

export interface CompletionCommit {
  readonly task: Task;
  readonly expectedVersion: number;
  readonly pet: PetState;
  readonly events: readonly {
    eventType: string;
    payload: Record<string, unknown>;
  }[];
}

export type CompletionResult =
  | { status: "ok"; snapshot: PetSnapshot; task: Task }
  | { status: "conflict" }
  | { status: "retry" };

export interface TimelineEntry {
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}

export interface EventStore {
  appendEvent(
    userId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
  /** Timeline order, oldest first. */
  listEvents(userId: string): Promise<readonly TimelineEntry[]>;
}

export interface PushSubscription {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  /** Absent rows were saved before a language was chosen and stay English. */
  readonly locale?: Locale;
}

export interface PushStore {
  list(userId: string): Promise<readonly PushSubscription[]>;
  upsert(userId: string, subscription: PushSubscription): Promise<void>;
  remove(userId: string, endpoint: string): Promise<void>;
}

export interface NagStore {
  /** True the first time this local day is claimed. */
  claimDay(userId: string, day: string): Promise<boolean>;
}

export interface BudgetStore {
  /** True when this model attempt is inside the user and site caps. */
  take(userId: string, now: number): Promise<boolean>;
}

export interface ClockShift {
  /** Non-negative offset stored on the pet row. */
  readonly clockOffsetMs: number;
  /**
   * When set, timestamps that are still ahead of this instant are pulled
   * back to it. Due dates are left alone: they are deadlines, not a clock cursor.
   */
  readonly clampTo: number | null;
}

export interface AuthedStores {
  readonly userId: string;
  readonly pets: PetStore;
  readonly tasks: TaskStore;
  readonly events: EventStore;
  readonly push: PushStore;
  readonly nags: NagStore;
  readonly budget: BudgetStore;
  /**
   * Claim the task, CAS the pet, and insert events in one transaction.
   * A version miss rolls everything back (`retry`). Already done is `conflict`.
   */
  commitCompletion(input: CompletionCommit): Promise<CompletionResult>;
  /**
   * Write `clock_offset_ms`. A save of pet stats must not change it.
   * Returns null when the pet row lost a version race.
   */
  setClockOffset(userId: string, shift: ClockShift): Promise<PetSnapshot | null>;
}

/** Route handlers depend on this port. Tests pass an in-memory implementation. */
export interface AppDeps {
  now(): number;
  newId(): string;
  /** Server `DEMO_MODE`. Fast-forward refuses to run when this is false. */
  readonly demoMode: boolean;
  authorize(request: Request): Promise<AuthedStores | null>;
}
