import { expect, it } from "vitest";
import { postFastForward } from "@/app/api/demo/fast-forward/handlers";
import { POST as postDemoSession } from "@/app/api/demo/session/route";
import { getPet } from "@/app/api/pet/handlers";
import { DECAY_RATE_HP } from "@/lib/game/constants";
import { createMemoryWorld, request, USER_ID } from "../helpers/world";

const NOW = Date.UTC(2026, 6, 4, 8);
const HOUR = 3_600_000;

async function hatchling(demoMode: boolean) {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW, demoMode);
  await getPet(request("GET", "/api/pet"), deps);
  const record = world.pets.get(USER_ID);
  if (!record) throw new Error("missing pet");
  world.pets.set(USER_ID, {
    ...record,
    state: { ...record.state, stage: "hatchling" },
  });
  return { world, deps };
}

it("issues a demo cookie only when demo mode is on", async () => {
  const previous = process.env.DEMO_MODE;
  delete process.env.DEMO_MODE;
  const locked = await postDemoSession(new Request("http://localhost/api/demo/session", { method: "POST" }));
  expect(locked.status).toBe(403);
  process.env.DEMO_MODE = "true";
  const open = await postDemoSession(new Request("http://localhost/api/demo/session", { method: "POST" }));
  expect(open.status).toBe(200);
  expect(open.headers.get("set-cookie")).toMatch(/haunted_demo=.*Secure/);
  if (previous === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = previous;
});

it("returns 403 when demo mode is off or the caller is signed out", async () => {
  const off = createMemoryWorld().deps(USER_ID, NOW, false);
  const hidden = await postFastForward(request("POST", "/api/demo/fast-forward", { hours: 1 }), off);
  expect(hidden.status).toBe(403);

  const signedOut = createMemoryWorld().deps(null, NOW, true);
  const refused = await postFastForward(
    request("POST", "/api/demo/fast-forward", { hours: 1 }),
    signedOut,
  );
  expect(refused.status).toBe(403);
});

it("returns 400 for an hour value outside the demo set", async () => {
  const { deps } = await hatchling(true);
  const response = await postFastForward(
    request("POST", "/api/demo/fast-forward", { hours: 2 }),
    deps,
  );
  expect(response.status).toBe(400);
});

it("adds hours to the offset and catches up without passing the effective clock", async () => {
  const { world, deps } = await hatchling(true);
  const response = await postFastForward(
    request("POST", "/api/demo/fast-forward", { hours: 1 }),
    deps,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    pet: { hp: number; lastTickAt: number; stage: string };
    now: number;
    clockOffsetMs: number;
  };
  expect(body.clockOffsetMs).toBe(HOUR);
  expect(body.now).toBe(NOW + HOUR);
  expect(body.pet.hp).toBe(100 - DECAY_RATE_HP);
  expect(body.pet.lastTickAt).toBe(NOW + HOUR);
  expect(body.pet.lastTickAt).toBeLessThanOrEqual(body.now);
  expect(world.pets.get(USER_ID)?.clockOffsetMs).toBe(HOUR);
});

it("leaves an egg's HP alone while the clock jumps", async () => {
  const world = createMemoryWorld();
  const deps = world.deps(USER_ID, NOW, true);
  await getPet(request("GET", "/api/pet"), deps);
  const response = await postFastForward(
    request("POST", "/api/demo/fast-forward", { hours: 24 }),
    deps,
  );
  const body = (await response.json()) as { pet: { hp: number; stage: string } };
  expect(body.pet.stage).toBe("egg");
  expect(body.pet.hp).toBe(100);
});

it("resets the offset and clamps future cursors but not due dates", async () => {
  const { world, deps } = await hatchling(true);
  const record = world.pets.get(USER_ID);
  if (!record) throw new Error("missing pet");
  world.pets.set(USER_ID, {
    ...record,
    clockOffsetMs: 5 * HOUR,
    state: { ...record.state, lastTickAt: NOW + 5 * HOUR },
  });
  world.tasks.push({
    id: crypto.randomUUID(),
    userId: USER_ID,
    title: "Later",
    notes: null,
    category: "chores",
    size: "small",
    status: "todo",
    dueAt: NOW + 10 * HOUR,
    completedAt: null,
    deletedAt: null,
    parentId: null,
    breakdownSuggested: false,
    allSubtasksDone: false,
    sortOrder: 1,
    createdAt: NOW + 5 * HOUR,
  });

  const response = await postFastForward(
    request("POST", "/api/demo/fast-forward", { reset: true }),
    deps,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    clockOffsetMs: number;
    pet: { lastTickAt: number };
  };
  expect(body.clockOffsetMs).toBe(0);
  expect(body.pet.lastTickAt).toBeLessThanOrEqual(NOW);
  expect(world.tasks[0]?.createdAt).toBeLessThanOrEqual(NOW);
  expect(world.tasks[0]?.dueAt).toBe(NOW + 10 * HOUR);
});
