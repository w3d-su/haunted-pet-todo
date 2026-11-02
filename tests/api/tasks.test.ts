import { expect, it } from "vitest";
import { deleteTask, getTasksRoute, patchTask, postTask } from "@/app/api/tasks/handlers";
import { MAX_HP } from "@/lib/game/constants";
import { initialPetState } from "@/lib/game/pet";
import { SystemClock } from "@/lib/server/clock";
import type { AppDeps } from "@/lib/server/stores";
import { createMemoryWorld, request, USER_ID } from "../helpers/world";

const NOW = Date.UTC(2026, 3, 2, 15);

it("rejects anonymous callers", async () => {
  const world = createMemoryWorld();
  const response = await getTasksRoute(request("GET", "/api/tasks"), world.deps(null, NOW));
  expect(response.status).toBe(401);
});

it("creates a task, nests subtasks, and rejects an empty title", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  const missing = await postTask(request("POST", "/api/tasks", { title: "  " }), deps);
  expect(missing.status).toBe(400);

  const created = await postTask(
    request("POST", "/api/tasks", { title: "Feed the ghost", category: "chores", size: "large" }),
    deps,
  );
  expect(created.status).toBe(201);
  const parent = (await created.json()) as { task: { id: string; breakdownSuggested: boolean } };
  expect(parent.task.breakdownSuggested).toBe(false);
  expect(world.events.some((event) => event.eventType === "TASK_CREATED")).toBe(true);

  const child = await postTask(
    request("POST", "/api/tasks", { title: "Buy oats", parentId: parent.task.id }),
    deps,
  );
  expect(child.status).toBe(201);

  const listed = await getTasksRoute(request("GET", "/api/tasks"), deps);
  const body = (await listed.json()) as { tasks: { id: string; subtasks: { title: string }[] }[] };
  expect(body.tasks).toHaveLength(1);
  expect(body.tasks[0]?.subtasks.map((task) => task.title)).toEqual(["Buy oats"]);
});

it("returns 409 when a done task is completed again and does not change the pet", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  const created = await postTask(request("POST", "/api/tasks", { title: "One" }), deps);
  const { task } = (await created.json()) as { task: { id: string } };

  const first = await patchTask(request("PATCH", "/api/tasks", { id: task.id, status: "done" }), deps);
  expect(first.status).toBe(200);
  const firstBody = (await first.json()) as { emitted: { type: string }[] };
  expect(firstBody.emitted.map((event) => event.type)).toContain("PET_HATCHED");
  const petBefore = world.pets.get(USER_ID)?.state;
  expect(petBefore?.stage).toBe("hatchling");

  const second = await patchTask(request("PATCH", "/api/tasks", { id: task.id, status: "done" }), deps);
  expect(second.status).toBe(409);
  expect(world.pets.get(USER_ID)?.state).toEqual(petBefore);
  expect(world.events.filter((event) => event.eventType === "TASK_COMPLETED")).toHaveLength(1);
});

it("rejects a status change on a done task and restores a future due date", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  world.pets.set(USER_ID, {
    state: {
      ...initialPetState(USER_ID, NOW, crypto.randomUUID(), "UTC"),
      stage: "adult",
    },
    clockOffsetMs: 0,
    version: 1,
  });
  const created = await postTask(
    request("POST", "/api/tasks", { title: "Late", dueAt: NOW - 3_600_000 }),
    deps,
  );
  const { task } = (await created.json()) as { task: { id: string } };

  const listed = await getTasksRoute(request("GET", "/api/tasks"), deps);
  const body = (await listed.json()) as { tasks: { status: string }[] };
  expect(body.tasks[0]?.status).toBe("overdue");

  const moved = await patchTask(
    request("PATCH", "/api/tasks", { id: task.id, dueAt: NOW + 3_600_000 }),
    deps,
  );
  expect(moved.status).toBe(200);
  expect(((await moved.json()) as { task: { status: string } }).task.status).toBe("todo");

  await patchTask(request("PATCH", "/api/tasks", { id: task.id, status: "done" }), deps);
  const blocked = await patchTask(
    request("PATCH", "/api/tasks", { id: task.id, status: "overdue" }),
    deps,
  );
  expect(blocked.status).toBe(400);
});

it("lets a client mark a task done, but not clear an overdue zombie by setting todo", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  const created = await postTask(
    request("POST", "/api/tasks", { title: "Late", dueAt: NOW - 1000 }),
    deps,
  );
  const { task } = (await created.json()) as { task: { id: string } };
  await getTasksRoute(request("GET", "/api/tasks"), deps);

  const erased = await patchTask(
    request("PATCH", "/api/tasks", { id: task.id, status: "todo" }),
    deps,
  );
  expect(erased.status).toBe(400);
  expect(world.tasks.find((item) => item.id === task.id)?.status).toBe("overdue");

  const moved = await patchTask(
    request("PATCH", "/api/tasks", { id: task.id, dueAt: NOW + 3_600_000 }),
    deps,
  );
  expect(moved.status).toBe(200);
  expect(((await moved.json()) as { task: { status: string } }).task.status).toBe("todo");
});

it("twenty concurrent completions of one task yield one 200, nineteen 409s, and no 500s", async () => {
  const clock = new SystemClock();
  const start = clock.now();
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, () => clock.now());
  world.pets.set(USER_ID, {
    state: {
      ...initialPetState(USER_ID, start, crypto.randomUUID(), "UTC"),
      stage: "hatchling",
      hp: 40,
    },
    clockOffsetMs: 0,
    version: 1,
  });
  const created = await postTask(request("POST", "/api/tasks", { title: "Once" }), deps);
  const { task } = (await created.json()) as { task: { id: string } };
  const responses = await Promise.all(
    Array.from({ length: 20 }, () =>
      patchTask(request("PATCH", "/api/tasks", { id: task.id, status: "done" }), deps),
    ),
  );
  const statuses = responses.map((response) => response.status);
  expect(statuses.filter((status) => status === 200)).toHaveLength(1);
  expect(statuses.filter((status) => status === 409)).toHaveLength(19);
  expect(statuses.filter((status) => status === 500)).toHaveLength(0);
  expect(statuses.filter((status) => status === 503)).toHaveLength(0);
  expect(world.events.filter((event) => event.eventType === "TASK_COMPLETED")).toHaveLength(1);
  const hp = world.pets.get(USER_ID)?.state.hp ?? 0;
  expect(hp).toBeGreaterThan(49);
  expect(hp).toBeLessThanOrEqual(50);
});

it("the pet dies during the retry", async () => {
  const world = createMemoryWorld();
  const base = world.deps(USER_ID, NOW);
  const created = await postTask(request("POST", "/api/tasks", { title: "Too late" }), base);
  const { task } = (await created.json()) as { task: { id: string } };
  const dyingAt = NOW - 3 * 3_600_000;
  let attempts = 0;
  const deps: AppDeps = {
    ...base,
    authorize: async (incoming) => {
      const stores = await base.authorize(incoming);
      if (!stores) return null;
      return {
        ...stores,
        commitCompletion: async (input) => {
          attempts += 1;
          if (attempts === 1) {
            const current = world.pets.get(USER_ID);
            world.pets.set(USER_ID, {
              state: {
                ...(current?.state ?? input.pet),
                stage: "hatchling",
                status: "alive",
                hp: 1,
                lastTickAt: dyingAt,
              },
              clockOffsetMs: current?.clockOffsetMs ?? 0,
              version: (current?.version ?? 1) + 1,
            });
            return { status: "retry" };
          }
          return stores.commitCompletion(input);
        },
      };
    },
  };
  const response = await patchTask(
    request("PATCH", "/api/tasks", { id: task.id, status: "done" }),
    deps,
  );
  expect(response.status).toBe(200);
  expect(attempts).toBe(2);
  expect(world.pets.get(USER_ID)?.state.status).toBe("dead");
  expect(world.events.filter((event) => event.eventType === "PET_DIED")).toHaveLength(1);
  expect(world.events.filter((event) => event.eventType === "TASK_COMPLETED")).toHaveLength(1);
});

it("returns 503 with Retry-After when pet version retries are exhausted", async () => {
  const world = createMemoryWorld();
  const base = world.deps(USER_ID, NOW);
  const created = await postTask(request("POST", "/api/tasks", { title: "Busy" }), base);
  const { task } = (await created.json()) as { task: { id: string } };
  const busy: AppDeps = {
    ...base,
    authorize: async (incoming) => {
      const stores = await base.authorize(incoming);
      if (!stores) return null;
      return { ...stores, commitCompletion: async () => ({ status: "retry" }) };
    },
  };
  const response = await patchTask(
    request("PATCH", "/api/tasks", { id: task.id, status: "done" }),
    busy,
  );
  expect(response.status).toBe(503);
  expect(response.headers.get("retry-after")).toBe("1");
  expect(world.tasks.find((item) => item.id === task.id)?.status).not.toBe("done");
});

it("two concurrent completions produce one 200 and one 409", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  world.pets.set(USER_ID, {
    state: {
      ...initialPetState(USER_ID, NOW, crypto.randomUUID(), "UTC"),
      stage: "hatchling",
      hp: 40,
    },
    clockOffsetMs: 0,
    version: 1,
  });
  const created = await postTask(request("POST", "/api/tasks", { title: "Once" }), deps);
  const { task } = (await created.json()) as { task: { id: string } };
  const [first, second] = await Promise.all([
    patchTask(request("PATCH", "/api/tasks", { id: task.id, status: "done" }), deps),
    patchTask(request("PATCH", "/api/tasks", { id: task.id, status: "done" }), deps),
  ]);
  expect([first.status, second.status].sort()).toEqual([200, 409]);
  expect(world.events.filter((event) => event.eventType === "TASK_COMPLETED")).toHaveLength(1);
  expect(world.pets.get(USER_ID)?.state.hp).toBe(50);
});

it("concurrent completes of different tasks and concurrent reads do not 500 or double-reward", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  world.pets.set(USER_ID, {
    state: {
      ...initialPetState(USER_ID, NOW, crypto.randomUUID(), "UTC"),
      stage: "hatchling",
      hp: 10,
    },
    clockOffsetMs: 0,
    version: 1,
  });
  const ids: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    const created = await postTask(
      request("POST", "/api/tasks", { title: `Task ${index}`, category: "chores" }),
      deps,
    );
    ids.push(((await created.json()) as { task: { id: string } }).task.id);
  }
  const responses = await Promise.all([
    ...ids.map((id) => patchTask(request("PATCH", "/api/tasks", { id, status: "done" }), deps)),
    ...ids.map(() => getTasksRoute(request("GET", "/api/tasks"), deps)),
  ]);
  expect(responses.every((response) => response.status === 200)).toBe(true);
  const completions = world.events.filter((event) => event.eventType === "TASK_COMPLETED");
  expect(completions).toHaveLength(4);
  const rewarded = new Set(completions.map((event) => (event.payload as { taskId: string }).taskId));
  expect(rewarded).toEqual(new Set(ids));
  expect(world.pets.get(USER_ID)?.state.tasksCompletedTotal).toBe(4);
  expect(world.pets.get(USER_ID)?.state.hp).toBe(10 + 4 * 10);
  expect(world.tasks.filter((task) => task.status === "done")).toHaveLength(4);
});

it("does not let an overdue sync revert a completed task", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  const created = await postTask(
    request("POST", "/api/tasks", { title: "Already finished", dueAt: NOW - 60_000 }),
    deps,
  );
  const { task } = (await created.json()) as { task: { id: string } };
  const [done, listed] = await Promise.all([
    patchTask(request("PATCH", "/api/tasks", { id: task.id, status: "done" }), deps),
    getTasksRoute(request("GET", "/api/tasks"), deps),
  ]);
  expect(done.status).toBe(200);
  expect(listed.status).toBe(200);
  const second = await patchTask(request("PATCH", "/api/tasks", { id: task.id, status: "done" }), deps);
  expect(second.status).toBe(409);
  const after = await getTasksRoute(request("GET", "/api/tasks"), deps);
  const body = (await after.json()) as { tasks: { status: string }[] };
  expect(body.tasks[0]?.status).toBe("done");
  expect(world.events.filter((event) => event.eventType === "TASK_COMPLETED")).toHaveLength(1);
  expect(world.pets.get(USER_ID)?.state.tasksCompletedTotal).toBe(1);
  const edited = await patchTask(
    request("PATCH", "/api/tasks", { id: task.id, title: "Renamed" }),
    deps,
  );
  expect(edited.status).toBe(409);
  expect(world.tasks.find((item) => item.id === task.id)?.title).toBe("Already finished");
});

it("rejects a parent task owned by someone else", async () => {
  const world = createMemoryWorld();
  const owner = world.deps(USER_ID, NOW);
  const other = world.deps("22222222-2222-4222-8222-222222222222", NOW);
  const created = await postTask(request("POST", "/api/tasks", { title: "Mine" }), owner);
  const { task } = (await created.json()) as { task: { id: string } };
  const child = await postTask(
    request("POST", "/api/tasks", { title: "Not mine", parentId: task.id }),
    other,
  );
  expect(child.status).toBe(404);
});

it("soft-deletes an overdue task and records the slain zombie", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  const created = await postTask(
    request("POST", "/api/tasks", { title: "Rotten", dueAt: NOW - 1000 }),
    deps,
  );
  const { task } = (await created.json()) as { task: { id: string } };
  await getTasksRoute(request("GET", "/api/tasks"), deps);

  const removed = await deleteTask(request("DELETE", "/api/tasks", { id: task.id }), deps);
  expect(removed.status).toBe(200);
  const payload = (await removed.json()) as { task: { deletedAt: number | null } };
  expect(payload.task.deletedAt).toBe(NOW);
  expect(world.events.some((event) => event.eventType === "ZOMBIE_SLAIN")).toBe(true);
  expect(world.events.some((event) => event.eventType === "TASK_DELETED")).toBe(true);

  const listed = await getTasksRoute(request("GET", "/api/tasks"), deps);
  expect(((await listed.json()) as { tasks: unknown[] }).tasks).toEqual([]);
});

it("catches the pet up on read using the stored clock offset", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW);
  world.pets.set(USER_ID, {
    state: {
      ...initialPetState(USER_ID, NOW - 2 * 3_600_000, crypto.randomUUID(), "UTC"),
      stage: "adult",
      hp: MAX_HP,
    },
    clockOffsetMs: 0,
    version: 1,
  });
  await getTasksRoute(request("GET", "/api/tasks"), deps);
  expect(world.pets.get(USER_ID)?.state.hp).toBe(MAX_HP - 10);
});

it("rejects a bad category", async () => {
  const world = createMemoryWorld();
  const response = await postTask(
    request("POST", "/api/tasks", { title: "Nope", category: "villainy" }),
    world.deps(USER_ID, NOW),
  );
  expect(response.status).toBe(400);
});
