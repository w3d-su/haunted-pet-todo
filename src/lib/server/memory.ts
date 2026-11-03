import { petRecordFromRow, petStateToRow } from "@/lib/db/pet";
import { taskFromRow, taskToRow } from "@/lib/db/tasks";
import { clampFuturePetTimes, type PetState } from "@/lib/game/pet";
import { clampFutureTaskTimes, type Task } from "@/lib/game/tasks";
import { budgetDay, USER_AI_DAILY_CAP, siteAiDailyCap } from "@/lib/db/ai-budget";
import { MAX_PUSH_SUBSCRIPTIONS } from "@/lib/push/endpoint";
import { en } from "@/lib/i18n/en";
import { PushCapError } from "@/lib/server/http";
import type {
  AppDeps,
  BudgetStore,
  CompletionCommit,
  CompletionResult,
  EventStore,
  NagStore,
  PetSnapshot,
  PetStore,
  PushStore,
  PushSubscription,
  TaskStore,
} from "@/lib/server/stores";

export interface StoredEvent {
  userId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface StoredPush extends PushSubscription {
  userId: string;
}

export interface MemoryWorld {
  tasks: Task[];
  pets: Map<string, PetSnapshot>;
  events: StoredEvent[];
  pushes: StoredPush[];
  deps: (userId: string | null, now: number | (() => number), demoMode?: boolean) => AppDeps;
}

function persistPet(state: PetState, clockOffsetMs: number, version: number): PetState {
  return petRecordFromRow({
    ...petStateToRow(state),
    clock_offset_ms: clockOffsetMs,
    version,
  }).state;
}

function persistTask(task: Task): Task {
  return taskFromRow(taskToRow(task));
}

/** In-memory stores behind the same operations as Postgres. Tests and local demo share this. */
export function createMemoryWorld(): MemoryWorld {
  const tasks: Task[] = [];
  const pets = new Map<string, PetSnapshot>();
  const events: StoredEvent[] = [];
  const pushes: StoredPush[] = [];

  const petStore: PetStore = {
    async get(userId) {
      return pets.get(userId) ?? null;
    },
    async save(state, expectedVersion) {
      const existing = pets.get(state.userId);
      if (expectedVersion === 0) {
        if (existing) return null;
        const snapshot: PetSnapshot = {
          state: persistPet(state, 0, 1),
          clockOffsetMs: 0,
          version: 1,
        };
        pets.set(state.userId, snapshot);
        return snapshot;
      }
      if (!existing || existing.version !== expectedVersion) return null;
      const version = existing.version + 1;
      const snapshot: PetSnapshot = {
        state: persistPet(state, existing.clockOffsetMs, version),
        clockOffsetMs: existing.clockOffsetMs,
        version,
      };
      pets.set(state.userId, snapshot);
      return snapshot;
    },
  };

  const taskStore: TaskStore = {
    async getTasks(userId) {
      return tasks
        .filter((task) => task.userId === userId && task.deletedAt === null)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt - right.createdAt);
    },
    async upsertTask(task) {
      const stored = persistTask(task);
      const index = tasks.findIndex((item) => item.id === task.id);
      if (index === -1) tasks.push(stored);
      else tasks[index] = stored;
      return stored;
    },
    async markOverdue(taskId, userId) {
      const index = tasks.findIndex((item) => item.id === taskId && item.userId === userId);
      const current = tasks[index];
      if (!current || current.deletedAt !== null || current.status !== "todo") return null;
      const overdue = persistTask({ ...current, status: "overdue" });
      tasks[index] = overdue;
      return overdue;
    },
    async updateOpen(task) {
      const index = tasks.findIndex((item) => item.id === task.id && item.userId === task.userId);
      const current = tasks[index];
      if (!current || current.deletedAt !== null || current.status === "done") return null;
      const stored = persistTask(task);
      tasks[index] = stored;
      return stored;
    },
    async softDeleteTask(taskId, userId, now) {
      const index = tasks.findIndex((item) => item.id === taskId && item.userId === userId);
      const task = tasks[index];
      if (!task || task.deletedAt !== null) return null;
      const deleted = persistTask({ ...task, deletedAt: now });
      tasks[index] = deleted;
      return deleted;
    },
    async claimBreakdown(taskId, userId) {
      const index = tasks.findIndex((item) => item.id === taskId && item.userId === userId);
      const current = tasks[index];
      if (
        !current ||
        current.deletedAt !== null ||
        current.status === "done" ||
        current.breakdownSuggested
      ) {
        return null;
      }
      const claimed = persistTask({ ...current, breakdownSuggested: true });
      tasks[index] = claimed;
      return claimed;
    },
    async releaseBreakdown(taskId, userId) {
      const index = tasks.findIndex((item) => item.id === taskId && item.userId === userId);
      const current = tasks[index];
      if (!current || !current.breakdownSuggested) return;
      tasks[index] = persistTask({ ...current, breakdownSuggested: false });
    },
  };

  const eventStore: EventStore = {
    async appendEvent(userId, eventType, payload) {
      events.push({ userId, eventType, payload });
    },
    async listEvents(userId) {
      return events
        .filter((event) => event.userId === userId)
        .map((event) => ({ eventType: event.eventType, payload: event.payload }));
    },
  };

  const pushStore: PushStore = {
    async list(userId) {
      return pushes
        .filter((row) => row.userId === userId)
        .map((row) => ({
          endpoint: row.endpoint,
          p256dh: row.p256dh,
          auth: row.auth,
          locale: row.locale === "zh-TW" ? ("zh-TW" as const) : ("en" as const),
        }));
    },
    async upsert(userId, subscription) {
      const index = pushes.findIndex(
        (row) => row.userId === userId && row.endpoint === subscription.endpoint,
      );
      if (index === -1) {
        const count = pushes.filter((row) => row.userId === userId).length;
        if (count >= MAX_PUSH_SUBSCRIPTIONS) throw new PushCapError();
      }
      const stored: StoredPush = { userId, ...subscription };
      if (index === -1) pushes.push(stored);
      else pushes[index] = stored;
    },
    async remove(userId, endpoint) {
      const index = pushes.findIndex((row) => row.userId === userId && row.endpoint === endpoint);
      if (index >= 0) pushes.splice(index, 1);
    },
  };

  const nagDays = new Map<string, string>();
  const nagStore: NagStore = {
    async claimDay(userId, day) {
      if (nagDays.get(userId) === day) return false;
      nagDays.set(userId, day);
      return true;
    },
  };

  const spent = new Map<string, number>();
  const budgetStore: BudgetStore = {
    async take(userId, now) {
      const day = budgetDay(now);
      const siteKey = `site:${day}`;
      const userKey = `user:${userId}:${day}`;
      const site = spent.get(siteKey) ?? 0;
      const user = spent.get(userKey) ?? 0;
      if (site >= siteAiDailyCap() || user >= USER_AI_DAILY_CAP) return false;
      spent.set(siteKey, site + 1);
      spent.set(userKey, user + 1);
      return true;
    },
  };

  function commitCompletion(input: CompletionCommit): Promise<CompletionResult> {
    const index = tasks.findIndex(
      (item) => item.id === input.task.id && item.userId === input.task.userId,
    );
    const current = tasks[index];
    if (!current || current.deletedAt !== null || current.status === "done") {
      return Promise.resolve({ status: "conflict" });
    }
    const pet = pets.get(input.task.userId);
    if (!pet || pet.version !== input.expectedVersion) {
      return Promise.resolve({ status: "retry" });
    }
    const done = persistTask({
      ...input.task,
      status: "done",
      completedAt: input.task.completedAt,
    });
    const version = pet.version + 1;
    const snapshot: PetSnapshot = {
      state: persistPet(input.pet, pet.clockOffsetMs, version),
      clockOffsetMs: pet.clockOffsetMs,
      version,
    };
    tasks[index] = done;
    pets.set(input.task.userId, snapshot);
    for (const event of input.events) {
      events.push({
        userId: input.task.userId,
        eventType: event.eventType,
        payload: event.payload,
      });
    }
    return Promise.resolve({ status: "ok", snapshot, task: done });
  }

  return {
    tasks,
    pets,
    events,
    pushes,
    deps(userId, now, demoMode = false) {
      const clock = typeof now === "function" ? now : () => now;
      return {
        now: clock,
        newId: () => crypto.randomUUID(),
        demoMode,
        authorize: async () =>
          userId
            ? {
                userId,
                pets: petStore,
                tasks: taskStore,
                events: eventStore,
                push: pushStore,
                nags: nagStore,
                budget: budgetStore,
                commitCompletion: (input) => commitCompletion(input),
                async setClockOffset(id, shift) {
                  const existing = pets.get(id);
                  if (!existing) return null;
                  if (!Number.isSafeInteger(shift.clockOffsetMs) || shift.clockOffsetMs < 0) {
                    throw new Error(en.errors.clockOffset);
                  }
                  let state = existing.state;
                  if (shift.clampTo !== null) {
                    state = clampFuturePetTimes(state, shift.clampTo);
                    for (let index = 0; index < tasks.length; index += 1) {
                      const task = tasks[index];
                      if (!task || task.userId !== id || task.status === "done") continue;
                      tasks[index] = persistTask(clampFutureTaskTimes(task, shift.clampTo));
                    }
                  }
                  const version = existing.version + 1;
                  const snapshot: PetSnapshot = {
                    state: persistPet(state, shift.clockOffsetMs, version),
                    clockOffsetMs: shift.clockOffsetMs,
                    version,
                  };
                  pets.set(id, snapshot);
                  return snapshot;
                },
              }
            : null,
      };
    },
  };
}
