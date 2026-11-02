/**
 * Real-Postgres concurrency tests for task completion.
 *
 * The suite runs only when both of these are true:
 * 1. `HAUNTED_TEST_DATABASE_URL` is set, and
 * 2. the database name in that URL contains `test` (case-insensitive).
 *
 * It drops schemas `public` and `auth`, then reapplies the migrations.
 * If the URL is set but the name does not contain `test`, loading this file
 * throws and nothing is dropped. If the URL is unset, the suite skips so
 * `pnpm test` stays green without a database.
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { getTasksRoute, patchTask, postTask } from "@/app/api/tasks/handlers";
import { commitCompletion } from "@/lib/db/completion";
import { appendEvent } from "@/lib/db/events";
import { getPetRecord, savePetState } from "@/lib/db/pet";
import { getTasks, markOverdue, softDeleteTask, updateOpen, upsertTask } from "@/lib/db/tasks";
import { SystemClock } from "@/lib/server/clock";
import type { AppDeps } from "@/lib/server/stores";
import { request, USER_ID } from "../helpers/world";
import { createPgSupabase } from "./pg-supabase";

export function databaseName(connectionString: string): string {
  const normalized = connectionString.replace(/^postgres(ql)?:\/\//i, "http://");
  try {
    const url = new URL(normalized);
    const fromPath = decodeURIComponent(url.pathname.replace(/^\//, "").split("/")[0] ?? "");
    // `postgresql:///dbname?host=/socket` puts the name in the host, not the path.
    return fromPath || decodeURIComponent(url.hostname);
  } catch {
    return "";
  }
}

export function assertSafeTestDatabase(connectionString: string): void {
  const name = databaseName(connectionString);
  if (!name.toLowerCase().includes("test")) {
    throw new Error(
      `Refusing to drop schemas: database "${name || "(unknown)"}" does not contain "test". HAUNTED_TEST_DATABASE_URL must name a database whose name contains "test".`,
    );
  }
}

const databaseUrl = process.env.HAUNTED_TEST_DATABASE_URL;
if (databaseUrl) assertSafeTestDatabase(databaseUrl);

describe("postgres test guard", () => {
  it("rejects a database whose name does not contain test", () => {
    expect(() => assertSafeTestDatabase("postgres://localhost/postgres")).toThrow(/test/);
    expect(() => assertSafeTestDatabase("postgresql://localhost/haunted")).toThrow(/test/);
  });

  it("accepts a database whose name contains test", () => {
    expect(() =>
      assertSafeTestDatabase("postgresql:///haunted_test?host=/var/run/postgresql"),
    ).not.toThrow();
    expect(() =>
      assertSafeTestDatabase("postgres://postgres:postgres@localhost:5432/haunted_test"),
    ).not.toThrow();
    expect(databaseName("postgresql:///Haunted_Test?host=/var/run/postgresql")).toBe("haunted_test");
  });
});

function pgDeps(pool: Pool): AppDeps {
  const supabase = createPgSupabase(pool);
  const clock = new SystemClock();
  return {
    now: () => clock.now(),
    newId: () => crypto.randomUUID(),
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
        updateOpen: (task) => updateOpen(supabase, task),
        softDeleteTask: (taskId, id, now) => softDeleteTask(supabase, taskId, id, now),
      },
      events: {
        appendEvent: (id, eventType, payload) => appendEvent(supabase, id, eventType, payload),
      },
      commitCompletion: (input) => commitCompletion(supabase, input),
    }),
  };
}

const describeDb = databaseUrl ? describe : describe.skip;

describeDb("postgres concurrency", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 20 });
  const supabase = createPgSupabase(pool);

  beforeAll(async () => {
    assertSafeTestDatabase(databaseUrl!);
    await pool.query("drop schema if exists public cascade");
    await pool.query("drop schema if exists auth cascade");
    await pool.query("create schema public");
    const bootstrap = readFileSync("tests/db/bootstrap.sql", "utf8");
    const init = readFileSync("supabase/migrations/0001_init.sql", "utf8");
    const rls = readFileSync("supabase/migrations/0002_rls.sql", "utf8");
    await pool.query(bootstrap);
    await pool.query(init);
    await pool.query(rls);
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
});
