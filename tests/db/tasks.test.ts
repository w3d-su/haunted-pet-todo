/**
 * Postgres checks for task helpers, the events seq timeline, and the cron.
 * Skips unless HAUNTED_TEST_DATABASE_URL names a database containing "test".
 */
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runDecayCron } from "@/app/api/cron/decay/handlers";
import { getPet } from "@/app/api/pet/handlers";
import { postTask } from "@/app/api/tasks/handlers";
import { takeAiBudget } from "@/lib/db/ai-budget";
import { commitCompletion } from "@/lib/db/completion";
import { claimNagDay } from "@/lib/db/nag";
import { appendEvent, listEvents } from "@/lib/db/events";
import { getPetRecord, listPetUserIds, savePetState, setClockOffset } from "@/lib/db/pet";
import {
  deletePushSubscription,
  listPushSubscriptions,
  upsertPushSubscription,
} from "@/lib/db/push";
import {
  claimBreakdown,
  getTasks,
  releaseBreakdown,
  markOverdue,
  softDeleteTask,
  updateOpen,
  upsertTask,
} from "@/lib/db/tasks";
import type { Task } from "@/lib/game/tasks";
import type { AppDeps, AuthedStores } from "@/lib/server/stores";
import { request, USER_ID } from "../helpers/world";
import { assertSafeTestDatabase } from "./guard";
import { createPgSupabase } from "./pg-supabase";
import { resetDatabase } from "./prepare";

const databaseUrl = process.env.HAUNTED_TEST_DATABASE_URL;
if (databaseUrl) assertSafeTestDatabase(databaseUrl);

const describeDb = databaseUrl ? describe : describe.skip;
const START = Date.UTC(2026, 6, 4, 8);
const HOUR = 3_600_000;

function pgStores(pool: Pool, now: number): { deps: AppDeps; stores: () => Promise<AuthedStores> } {
  const supabase = createPgSupabase(pool);
  const stores = async (): Promise<AuthedStores> => ({
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
      softDeleteTask: (taskId, id, at) => softDeleteTask(supabase, taskId, id, at),
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
    setClockOffset: (id, shift) => setClockOffset(supabase, id, shift.clockOffsetMs, shift.clampTo),
  });
  return {
    stores,
    deps: {
      now: () => now,
      newId: () => crypto.randomUUID(),
      demoMode: true,
      authorize: () => stores(),
    },
  };
}

describeDb("postgres task helpers, seq, and cron", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const supabase = createPgSupabase(pool);

  beforeAll(async () => {
    await resetDatabase(pool);
    await pool.query("insert into auth.users (id) values ($1)", [USER_ID]);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function empty(): Promise<void> {
    await pool.query(
      "truncate public.tasks, public.events, public.pet_state, public.push_subscriptions",
    );
  }

  it("maps a task to snake_case and hides soft-deleted rows", async () => {
    await empty();
    const task: Task = {
      id: crypto.randomUUID(),
      userId: USER_ID,
      title: "Fold the shroud",
      notes: null,
      category: "chores",
      size: "small",
      status: "todo",
      dueAt: START,
      completedAt: null,
      deletedAt: null,
      parentId: null,
      breakdownSuggested: false,
      allSubtasksDone: false,
      sortOrder: 4,
      createdAt: START,
    };
    await upsertTask(supabase, task);
    const raw = await pool.query<{ user_id: string; sort_order: number; due_at: Date }>(
      "select user_id, sort_order, due_at from public.tasks where id = $1",
      [task.id],
    );
    expect(raw.rows[0]?.user_id).toBe(USER_ID);
    expect(raw.rows[0]?.sort_order).toBe(4);
    expect(new Date(raw.rows[0]!.due_at).getTime()).toBe(START);

    await softDeleteTask(supabase, task.id, USER_ID, START + 10);
    expect(await getTasks(supabase, USER_ID)).toEqual([]);
  });

  it("appends events and orders the timeline by seq when created_at ties", async () => {
    await empty();
    await appendEvent(supabase, USER_ID, "TASK_CREATED", { taskId: "a" });
    await pool.query(
      `insert into public.events (user_id, event_type, payload, created_at)
       values ($1, 'FIRST', '{}'::jsonb, '2026-01-01T00:00:00Z'),
              ($1, 'SECOND', '{}'::jsonb, '2026-01-01T00:00:00Z')`,
      [USER_ID],
    );
    const timeline = await listEvents(supabase, USER_ID);
    expect(timeline[0]).toMatchObject({ eventType: "TASK_CREATED", userId: USER_ID });
    const tied = timeline.filter((event) => event.eventType === "FIRST" || event.eventType === "SECOND");
    expect(tied.map((event) => event.eventType)).toEqual(["FIRST", "SECOND"]);
    expect(tied[0]!.seq).toBeLessThan(tied[1]!.seq);

    const identity = await pool.query<{ is_identity: string; identity_generation: string }>(
      `select is_identity, identity_generation
       from information_schema.columns
       where table_schema = 'public' and table_name = 'events' and column_name = 'seq'`,
    );
    expect(identity.rows[0]).toEqual({ is_identity: "YES", identity_generation: "ALWAYS" });
    const usage = await pool.query<{ ok: boolean }>(
      "select has_sequence_privilege('authenticated', 'public.events_seq_seq', 'USAGE') as ok",
    );
    expect(usage.rows[0]?.ok).toBe(false);
  });

  it("does not let the authenticated role write events", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await expect(
        client.query(
          "insert into public.events (user_id, event_type, payload) values ($1, 'NOPE', '{}'::jsonb)",
          [USER_ID],
        ),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("runs the cron against stored rows and records the death", async () => {
    await empty();
    const { deps, stores } = pgStores(pool, START);
    const created = await postTask(
      request("POST", "/api/tasks", { title: "Light a candle", dueAt: START + HOUR }),
      deps,
    );
    expect(created.status).toBe(201);
    await getPet(request("GET", "/api/pet"), deps);
    const record = await getPetRecord(supabase, USER_ID);
    expect(record).not.toBeNull();
    const saved = await savePetState(
      supabase,
      { ...record!.state, stage: "hatchling", hp: 4, lastTickAt: START },
      record!.version,
    );
    expect(saved).not.toBeNull();

    const cronBase = {
      now: () => START + 2 * HOUR,
      newId: () => crypto.randomUUID(),
      secret: "db-cron",
      listUserIds: () => listPetUserIds(supabase),
      storesFor: () => stores(),
      deliverPush: async () => "sent" as const,
    };
    const denied = await runDecayCron(new Request("http://localhost/api/cron/decay"), cronBase);
    expect(denied.status).toBe(401);
    expect((await getPetRecord(supabase, USER_ID))?.state.hp).toBe(4);

    const ran = await runDecayCron(
      new Request("http://localhost/api/cron/decay", {
        headers: { authorization: "Bearer db-cron" },
      }),
      cronBase,
    );
    expect(ran.status).toBe(200);
    const body = (await ran.json()) as { processed: number; deaths: number };
    expect(body.processed).toBe(1);
    expect(body.deaths).toBe(1);
    const pet = await getPetRecord(supabase, USER_ID);
    expect(pet?.state.status).toBe("dead");
    expect(pet?.state.hp).toBe(0);
    expect(pet?.state.currentEpitaph).toBe("Here lies a to-do list. It never stood a chance.");
    const tasks = await getTasks(supabase, USER_ID);
    expect(tasks[0]?.status).toBe("overdue");
    const timeline = await listEvents(supabase, USER_ID);
    const types = timeline.map((event) => event.eventType);
    expect(types).toContain("TASK_OVERDUE");
    expect(types).toContain("PET_DIED");
    expect(types).not.toContain("EPITAPH_READY");
    const seqs = timeline.map((event) => event.seq);
    expect([...seqs].sort((left, right) => left - right)).toEqual(seqs);
  });
});
