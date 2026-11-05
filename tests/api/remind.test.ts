import { expect, it } from "vitest";
import { runDecayCron, type CronDeps } from "@/app/api/cron/decay/handlers";
import { runRemindCron, type RemindDeps } from "@/app/api/cron/remind/handlers";
import { initialPetState } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";
import type { AuthedStores } from "@/lib/server/stores";
import { createMemoryWorld, USER_ID } from "../helpers/world";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 2026-07-04, a UTC date. Each test picks the hour. */
const MIDNIGHT = Date.UTC(2026, 6, 4);
const SECRET = "cron-secret";

function task(createdAt: number): Task {
  return {
    id: crypto.randomUUID(),
    userId: USER_ID,
    title: "Sweep the hall",
    notes: null,
    category: "chores",
    size: "small",
    status: "todo",
    dueAt: null,
    completedAt: null,
    deletedAt: null,
    parentId: null,
    breakdownSuggested: false,
    allSubtasksDone: false,
    sortOrder: 1,
    createdAt,
  };
}

/** A hatchling with one open task, a subscription, and completions at `habitHours` (UTC) on earlier days. */
function seed(now: number, habitHours: number[]) {
  const world = createMemoryWorld();
  const recent = habitHours.map((hour, index) => MIDNIGHT - (index + 1) * DAY + hour * HOUR);
  const state = {
    ...initialPetState(USER_ID, now - HOUR, crypto.randomUUID(), "UTC"),
    stage: "hatchling" as const,
    recentCompletionTimestamps: recent,
    recentCompletionCategories: recent.map(() => "chores"),
    recentCompletionTaskIds: recent.map(() => crypto.randomUUID()),
  };
  world.pets.set(USER_ID, { state, clockOffsetMs: 0, version: 1 });
  world.tasks.push(task(now - 2 * HOUR));
  world.pushes.push({
    userId: USER_ID,
    endpoint: "https://fcm.googleapis.com/fcm/send/haunt",
    p256dh: "key",
    auth: "secret",
  });
  return world;
}

function storesFor(world: ReturnType<typeof createMemoryWorld>, now: number) {
  return async (userId: string): Promise<AuthedStores> => {
    const stores = await world.deps(userId, now).authorize(new Request("http://localhost"));
    if (!stores) throw new Error("missing stores");
    return stores;
  };
}

function remindDeps(world: ReturnType<typeof createMemoryWorld>, now: number, sent: string[]): RemindDeps {
  return {
    now: () => now,
    newId: () => crypto.randomUUID(),
    secret: SECRET,
    listUserIds: async () => [...new Set(world.pushes.map((push) => push.userId))],
    storesFor: storesFor(world, now),
    deliverPush: async (_subscription, payload) => {
      sent.push(payload.body);
      return "sent";
    },
  };
}

function authed(): Request {
  return new Request("http://localhost/api/cron/remind", {
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

it("returns 401 without the cron secret", async () => {
  const now = MIDNIGHT + 21 * HOUR;
  const world = seed(now, [21, 21, 21]);
  const sent: string[] = [];
  const response = await runRemindCron(
    new Request("http://localhost/api/cron/remind"),
    remindDeps(world, now, sent),
  );
  expect(response.status).toBe(401);
  expect(sent).toHaveLength(0);
});

it("waits for the habitual hour, then sends once that day", async () => {
  const habit = [21, 21, 9];
  const early = MIDNIGHT + 20 * HOUR;
  const world = seed(early, habit);
  const sent: string[] = [];

  const before = await runRemindCron(authed(), remindDeps(world, early, sent));
  expect(await before.json()).toEqual({ checked: 1, sent: 0, failures: 0 });

  const onTime = MIDNIGHT + 21 * HOUR;
  const due = await runRemindCron(authed(), remindDeps(world, onTime, sent));
  expect(await due.json()).toEqual({ checked: 1, sent: 1, failures: 0 });
  expect(sent).toHaveLength(1);

  const later = MIDNIGHT + 22 * HOUR;
  await runRemindCron(authed(), remindDeps(world, later, sent));
  expect(sent).toHaveLength(1);
});

it("uses 19:00 local when there is no habit yet", async () => {
  const sent: string[] = [];
  const at18 = MIDNIGHT + 18 * HOUR;
  const world = seed(at18, [7]);
  await runRemindCron(authed(), remindDeps(world, at18, sent));
  expect(sent).toHaveLength(0);
  const at19 = MIDNIGHT + 19 * HOUR;
  await runRemindCron(authed(), remindDeps(world, at19, sent));
  expect(sent).toHaveLength(1);
});

it("the daily cron skips the nag when dailyNag is false", async () => {
  const now = MIDNIGHT + 8 * HOUR;
  const world = seed(now, [8, 8, 8]);
  const sent: string[] = [];
  const deps: CronDeps = {
    now: () => now,
    newId: () => crypto.randomUUID(),
    secret: SECRET,
    listUserIds: async () => [...world.pets.keys()],
    storesFor: storesFor(world, now),
    deliverPush: async (_subscription, payload) => {
      sent.push(payload.body);
      return "sent";
    },
    dailyNag: false,
  };
  const response = await runDecayCron(
    new Request("http://localhost/api/cron/decay", { headers: { authorization: `Bearer ${SECRET}` } }),
    deps,
  );
  expect(response.status).toBe(200);
  expect(sent).toHaveLength(0);
});
