import type { PetState } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";
import type { AppDeps, EventStore, PetStore, TaskStore } from "@/lib/server/stores";

export interface StoredEvent {
  userId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface MemoryWorld {
  tasks: Task[];
  pets: Map<string, { state: PetState; clockOffsetMs: number }>;
  events: StoredEvent[];
  deps: (userId: string | null, now: number) => AppDeps;
}

export function createMemoryWorld(): MemoryWorld {
  const tasks: Task[] = [];
  const pets = new Map<string, { state: PetState; clockOffsetMs: number }>();
  const events: StoredEvent[] = [];

  const petStore: PetStore = {
    async get(userId) {
      return pets.get(userId) ?? null;
    },
    async save(state) {
      const existing = pets.get(state.userId);
      pets.set(state.userId, { state, clockOffsetMs: existing?.clockOffsetMs ?? 0 });
      return state;
    },
  };

  const taskStore: TaskStore = {
    async getTasks(userId) {
      return tasks.filter((task) => task.userId === userId && task.deletedAt === null);
    },
    async upsertTask(task) {
      const index = tasks.findIndex((item) => item.id === task.id);
      if (index === -1) tasks.push(task);
      else tasks[index] = task;
      return task;
    },
    async softDeleteTask(taskId, userId, now) {
      const index = tasks.findIndex((item) => item.id === taskId && item.userId === userId);
      const task = tasks[index];
      if (!task || task.deletedAt !== null) return null;
      const deleted = { ...task, deletedAt: now };
      tasks[index] = deleted;
      return deleted;
    },
  };

  const eventStore: EventStore = {
    async appendEvent(userId, eventType, payload) {
      events.push({ userId, eventType, payload });
    },
  };

  return {
    tasks,
    pets,
    events,
    deps(userId, now) {
      return {
        now: () => now,
        newId: () => crypto.randomUUID(),
        authorize: async () =>
          userId ? { userId, pets: petStore, tasks: taskStore, events: eventStore } : null,
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
