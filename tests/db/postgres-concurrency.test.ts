/**
 * Real-Postgres concurrency tests for task completion.
 *
 * The suite runs only when `HAUNTED_TEST_DATABASE_URL` is set. If that URL's
 * path names a database and the name does not contain `test`, loading this
 * file throws before connecting. A path with no database name is not filled
 * in from the hostname. After connecting, and before any DROP, the suite
 * requires `select current_database()` to return a name containing `test`.
 * If the URL is unset, the suite skips so `pnpm test` stays green.
 */
import { BREAKDOWN_CLAIM_LOST } from "@/lib/ai/messages";
import { Pool } from "pg";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { postBreakdown } from "@/app/api/ai/breakdown/handlers";
import { getTasksRoute, patchTask, postTask } from "@/app/api/tasks/handlers";
import { takeAiBudget } from "@/lib/db/ai-budget";
import { commitCompletion } from "@/lib/db/completion";
import { claimNagDay } from "@/lib/db/nag";
import { appendEvent, listEvents } from "@/lib/db/events";
import { getPetRecord, savePetState, setClockOffset } from "@/lib/db/pet";
import {
  deletePushSubscription,
  listPushSubscriptions,
  upsertPushSubscription,
} from "@/lib/db/push";
import {
  claimBreakdown,
  getTasks,
  releaseBreakdown,
  reorderTasks,
  markOverdue,
  softDeleteTask,
  updateOpen,
  upsertTask,
} from "@/lib/db/tasks";
import { SystemClock } from "@/lib/server/clock";
import type { AppDeps } from "@/lib/server/stores";
import { request, USER_ID } from "../helpers/world";
import { assertSafeTestDatabase, databaseName } from "./guard";
import { createPgSupabase } from "./pg-supabase";
import { resetDatabase } from "./prepare";

const databaseUrl = process.env.HAUNTED_TEST_DATABASE_URL;
if (databaseUrl) assertSafeTestDatabase(databaseUrl);

describe("postgres test guard", () => {
  it("rejects a database whose name does not contain test", () => {
    expect(() => assertSafeTestDatabase("postgres://localhost/postgres")).toThrow(/test/);
    expect(() => assertSafeTestDatabase("postgresql://localhost/haunted")).toThrow(/test/);
  });

  it("does not treat the hostname as the database name", () => {
    expect(databaseName("postgresql:///haunted_test?host=/var/run/postgresql")).toBe("");
    expect(databaseName("postgres://test-host.example/postgres")).toBe("postgres");
    expect(() => assertSafeTestDatabase("postgres://test-host.example/postgres")).toThrow(/test/);
    expect(() =>
      assertSafeTestDatabase("postgres://postgres:postgres@localhost:5432/haunted_test"),
    ).not.toThrow();
  });
});

function pgDeps(pool: Pool): AppDeps {
  const supabase = createPgSupabase(pool);
  const clock = new SystemClock();
  return {
    now: () => clock.now(),
    newId: () => crypto.randomUUID(),
    demoMode: false,
    authorize: async () => ({
      userId: USER_ID,
      pets: {
        get: (id) => getPetRecord(supabase, id),
        save: (state, expectedVersion) => savePetState(supabase, state, expectedVersion),
      },
      tasks: {
        getTasks: (id) => getTasks(supabase, id),
        upsertTask: (task) => upsertTask(supabase, task),
        markOverdue: (taskId, id) => markOverdue(supabase, taskId, id),
        updateOpen: (task, sortOrder) => updateOpen(supabase, task, sortOrder),
        reorder: (id, orderedIds) => reorderTasks(supabase, id, orderedIds),
        softDeleteTask: (taskId, id, now) => softDeleteTask(supabase, taskId, id, now),
        claimBreakdown: (taskId, id) => claimBreakdown(supabase, taskId, id),
        releaseBreakdown: (taskId, id) => releaseBreakdown(supabase, taskId, id),
      },
      events: {
        appendEvent: (id, eventType, payload) => appendEvent(supabase, id, eventType, payload),
        listEvents: (id) => listEvents(supabase, id),
      },
      push: {
        list: (id) => listPushSubscriptions(supabase, id),
        upsert: (id, subscription) => upsertPushSubscription(supabase, id, subscription),
        remove: (id, endpoint) => deletePushSubscription(supabase, id, endpoint),
      },
      nags: {
        claimDay: (id, day) => claimNagDay(supabase, id, day),
      },
      budget: {
        take: (id, at) => takeAiBudget(supabase, id, at),
      },
      commitCompletion: (input) => commitCompletion(supabase, input),
      setClockOffset: (id, shift) =>
        setClockOffset(supabase, id, shift.clockOffsetMs, shift.clampTo),
    }),
  };
}

const describeDb = databaseUrl ? describe : describe.skip;

describeDb("postgres concurrency", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 20 });
  const supabase = createPgSupabase(pool);

  beforeAll(async () => {
    await resetDatabase(pool);
    await pool.query("insert into auth.users (id) values ($1)", [USER_ID]);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function resetRows(): Promise<void> {
    await pool.query("truncate public.tasks, public.events, public.pet_state");
  }

  async function hatchling(hp: number): Promise<void> {
    const record = await getPetRecord(supabase, USER_ID);
    expect(record).not.toBeNull();
    const saved = await savePetState(
      supabase,
      { ...record!.state, stage: "hatchling", hp },
      record!.version,
    );
    expect(saved).not.toBeNull();
  }

  it("reorders completed and open roots atomically and rejects stale or duplicate IDs", async () => {
    await resetRows();
    const deps = pgDeps(pool);
    const ids: string[] = [];
    for (const title of ["First", "Second"]) {
      const response = await postTask(request("POST", "/api/tasks", { title }), deps);
      ids.push((await response.json()).task.id);
    }
    const [first, second] = ids;
    await patchTask(request("PATCH", "/api/tasks", { id: first, status: "done" }), deps);
    await postTask(request("POST", "/api/tasks", { title: "Child", parentId: first }), deps);
    const reorder = (orderedIds: string[]) =>
      patchTask(request("PATCH", "/api/tasks", { orderedIds }), deps);
    expect((await reorder([second, first])).status).toBe(200);
    expect((await reorder([first, crypto.randomUUID()])).status).toBe(409);
    expect((await reorder([first, first])).status).toBe(400);
    const rows = await getTasks(supabase, USER_ID);
    rows.sort((a, b) => a.sortOrder - b.sortOrder);
    expect(rows.map((row) => [row.title, row.status, row.sortOrder])).toEqual([
      ["Second", "todo", 1], ["First", "done", 2], ["Child", "todo", 3],
    ]);
  });

  it("completes the same task 20 times concurrently: one 200, nineteen 409s, no 500s", async () => {
    await resetRows();
    const deps = pgDeps(pool);
    const created = await postTask(request("POST", "/api/tasks", { title: "Once" }), deps);
    expect(created.status).toBe(201);
    const { task } = (await created.json()) as { task: { id: string } };
    await hatchling(40);

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

    const completions = await pool.query(
      "select payload->>'taskId' as task_id from public.events where user_id = $1 and event_type = 'TASK_COMPLETED'",
      [USER_ID],
    );
    expect(completions.rows).toHaveLength(1);
    const pet = await pool.query(
      "select hp, tasks_completed_total from public.pet_state where user_id = $1",
      [USER_ID],
    );
    expect(Number(pet.rows[0]?.tasks_completed_total)).toBe(1);
    const hp = Number(pet.rows[0]?.hp);
    expect(hp).toBeGreaterThan(49);
    expect(hp).toBeLessThanOrEqual(50);
  });

  it("completes four different tasks and serves reads with no 500s and one reward each", async () => {
    await resetRows();
    const deps = pgDeps(pool);
    const ids: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const created = await postTask(
        request("POST", "/api/tasks", { title: `Pg ${index}`, category: "chores" }),
        deps,
      );
      expect(created.status).toBe(201);
      ids.push(((await created.json()) as { task: { id: string } }).task.id);
    }
    await hatchling(10);

    const responses = await Promise.all([
      ...ids.map((id) => patchTask(request("PATCH", "/api/tasks", { id, status: "done" }), deps)),
      ...ids.map(() => getTasksRoute(request("GET", "/api/tasks"), deps)),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 200, 200, 200, 200, 200, 200, 200,
    ]);

    const tasks = await pool.query(
      "select id, status from public.tasks where user_id = $1 order by sort_order",
      [USER_ID],
    );
    expect(tasks.rows.every((row) => row.status === "done")).toBe(true);
    const completions = await pool.query(
      "select payload->>'taskId' as task_id from public.events where user_id = $1 and event_type = 'TASK_COMPLETED'",
      [USER_ID],
    );
    expect(completions.rows).toHaveLength(4);
    expect(new Set(completions.rows.map((row) => row.task_id))).toEqual(new Set(ids));
    const pet = await pool.query(
      "select hp, tasks_completed_total from public.pet_state where user_id = $1",
      [USER_ID],
    );
    expect(Number(pet.rows[0]?.tasks_completed_total)).toBe(4);
    const hp = Number(pet.rows[0]?.hp);
    expect(hp).toBeGreaterThan(49);
    expect(hp).toBeLessThanOrEqual(50);
  });

  it("lets one breakdown claim create the subtasks", async () => {
    await resetRows();
    const deps = pgDeps(pool);
    const created = await postTask(
      request("POST", "/api/tasks", { title: "Write research paper", size: "large" }),
      deps,
    );
    expect(created.status).toBe(201);
    const { task } = (await created.json()) as { task: { id: string } };
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        postBreakdown(request("POST", "/api/ai/breakdown", { taskId: task.id }), {
          ...deps,
          completeJson: async () => null,
        }),
      ),
    );
    // A late reader can replay stored steps with a 200; only the winner generates them.
    const generated: string[][] = [];
    for (const response of responses) {
      const body = await response.json();
      if (response.status === 409) {
        expect(body.error).toBe(BREAKDOWN_CLAIM_LOST);
        continue;
      }
      expect(response.status).toBe(200);
      if (body.source === "fallback") generated.push(body.subtasks);
      else expect(body.source).toBe("stored");
    }
    expect(generated).toHaveLength(1);
    expect(generated[0]).toHaveLength(3);
    const children = await pool.query(
      "select title from public.tasks where parent_id = $1 order by sort_order",
      [task.id],
    );
    expect(children.rows.map((row) => row.title)).toEqual(generated[0]);
  });
});
