import { expect, it } from "vitest";
import { postBreakdown, type BreakdownDeps } from "@/app/api/ai/breakdown/handlers";
import { createMemoryWorld, request, USER_ID } from "../helpers/world";

const NOW = Date.UTC(2026, 6, 4, 8);

function deps(
  world: ReturnType<typeof createMemoryWorld>,
  extras: Partial<BreakdownDeps> = {},
): BreakdownDeps {
  return {
    ...world.deps(USER_ID, NOW),
    completeJson: async () => null,
    ...extras,
  };
}

it("rejects a signed-out caller and a task that is not large", async () => {
  const world = createMemoryWorld();
  const denied = await postBreakdown(
    request("POST", "/api/ai/breakdown", { taskId: crypto.randomUUID() }),
    world.deps(null, NOW) as BreakdownDeps,
  );
  expect(denied.status).toBe(401);

  const signed = createMemoryWorld();
  const created = await (await import("@/app/api/tasks/handlers")).postTask(
    request("POST", "/api/tasks", { title: "Dust", size: "small" }),
    signed.deps(USER_ID, NOW),
  );
  const { task } = (await created.json()) as { task: { id: string } };
  const response = await postBreakdown(
    request("POST", "/api/ai/breakdown", { taskId: task.id }),
    deps(signed),
  );
  expect(response.status).toBe(409);
  expect(signed.tasks.filter((item) => item.parentId === task.id)).toHaveLength(0);
});

it("creates 3 to 7 subtasks from the fallback and does not duplicate them", async () => {
  const world = createMemoryWorld();
  const { postTask } = await import("@/app/api/tasks/handlers");
  const created = await postTask(
    request("POST", "/api/tasks", { title: "Write research paper", size: "large", category: "study" }),
    world.deps(USER_ID, NOW),
  );
  const { task } = (await created.json()) as { task: { id: string } };
  let calls = 0;
  const response = await postBreakdown(
    request("POST", "/api/ai/breakdown", { taskId: task.id }),
    deps(world, {
      completeJson: async () => {
        calls += 1;
        return null;
      },
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { subtasks: string[]; source: string; intro: string };
  expect(body.source).toBe("fallback");
  expect(body.subtasks.length).toBeGreaterThanOrEqual(3);
  expect(body.subtasks.length).toBeLessThanOrEqual(7);
  expect(body.intro.length).toBeLessThanOrEqual(140);
  expect(world.tasks.find((item) => item.id === task.id)?.breakdownSuggested).toBe(true);
  expect(world.tasks.filter((item) => item.parentId === task.id)).toHaveLength(body.subtasks.length);
  expect(calls).toBe(1);

  const again = await postBreakdown(
    request("POST", "/api/ai/breakdown", { taskId: task.id }),
    deps(world, {
      completeJson: async () => {
        calls += 1;
        return {
          intro: "fresh",
          subtasks: ["Open the draft", "Write the middle", "Check the end"],
        };
      },
    }),
  );
  expect(again.status).toBe(200);
  expect(calls).toBe(1);
  expect(world.tasks.filter((item) => item.parentId === task.id)).toHaveLength(body.subtasks.length);
});

it("uses the fallback when the daily cap is spent and refuses a done task", async () => {
  const world = createMemoryWorld();
  const { postTask, patchTask } = await import("@/app/api/tasks/handlers");
  const created = await postTask(
    request("POST", "/api/tasks", { title: "Write research paper", size: "large" }),
    world.deps(USER_ID, NOW),
  );
  const { task } = (await created.json()) as { task: { id: string } };
  let calls = 0;
  const base = deps(world, {
    completeJson: async () => {
      calls += 1;
      return null;
    },
  });
  const response = await postBreakdown(request("POST", "/api/ai/breakdown", { taskId: task.id }), {
    ...base,
    authorize: async (incoming) => {
      const stores = await base.authorize(incoming);
      if (!stores) return null;
      return { ...stores, budget: { take: async () => false } };
    },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { source: string; subtasks: string[] };
  expect(body.source).toBe("fallback");
  expect(body.subtasks.length).toBeGreaterThanOrEqual(3);
  expect(calls).toBe(0);

  const doneWorld = createMemoryWorld();
  const doneCreated = await postTask(
    request("POST", "/api/tasks", { title: "Already finished", size: "large" }),
    doneWorld.deps(USER_ID, NOW),
  );
  const doneTask = ((await doneCreated.json()) as { task: { id: string } }).task;
  await patchTask(
    request("PATCH", "/api/tasks", { id: doneTask.id, status: "done" }),
    doneWorld.deps(USER_ID, NOW),
  );
  const refused = await postBreakdown(
    request("POST", "/api/ai/breakdown", { taskId: doneTask.id }),
    deps(doneWorld),
  );
  expect(refused.status).toBe(409);
  expect(doneWorld.tasks.filter((item) => item.parentId === doneTask.id)).toHaveLength(0);
});
