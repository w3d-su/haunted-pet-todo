import { petRecordFromRow, petStateToRow } from "@/lib/db/pet";
import { taskFromRow, taskToRow } from "@/lib/db/tasks";
import type { PetState } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";
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
  deps: (userId: string | null, now: number | (() => number)) => AppDeps;
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
    deps(userId, now) {
      const clock = typeof now === "function" ? now : () => now;
      return {
        now: clock,
        newId: () => crypto.randomUUID(),
        authorize: async () =>
          userId
            ? {
                userId,
                pets: petStore,
                tasks: taskStore,
                events: eventStore,
                commitCompletion: (input) => commitCompletion(input),
              }
            : null,
      };
    },
  };
}

export const USER_ID = "11111111-1111-4111-8111-111111111111";

export function request(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
