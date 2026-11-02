import { petRecordFromRow, petStateToRow } from "@/lib/db/pet";
import { taskFromRow, taskToRow } from "@/lib/db/tasks";
import { clampFuturePetTimes, type PetState } from "@/lib/game/pet";
import { clampFutureTaskTimes, type Task } from "@/lib/game/tasks";
import type {
  AppDeps,
  CompletionCommit,
  CompletionResult,
  EventStore,
  PetSnapshot,
  PetStore,
  TaskStore,
} from "@/lib/server/stores";

export interface StoredEvent {
  userId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface MemoryWorld {
  tasks: Task[];
  pets: Map<string, PetSnapshot>;
  events: StoredEvent[];
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
      return tasks.filter((task) => task.userId === userId && task.deletedAt === null);
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
  };

  const eventStore: EventStore = {
    async appendEvent(userId, eventType, payload) {
      events.push({ userId, eventType, payload });
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
                commitCompletion: (input) => commitCompletion(input),
                async setClockOffset(id, shift) {
                  const existing = pets.get(id);
                  if (!existing) return null;
                  if (!Number.isSafeInteger(shift.clockOffsetMs) || shift.clockOffsetMs < 0) {
                    throw new Error("clock offset must be a non-negative integer");
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
