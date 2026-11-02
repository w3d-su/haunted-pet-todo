import { expect, it } from "vitest";
import { deleteTask, getTasksRoute, patchTask, postTask } from "@/app/api/tasks/handlers";
import { MAX_HP } from "@/lib/game/constants";
import { initialPetState } from "@/lib/game/pet";
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
