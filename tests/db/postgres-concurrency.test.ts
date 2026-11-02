import { readFileSync } from "node:fs";
import { Pool, type QueryResultRow } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTasksRoute, patchTask, postTask } from "@/app/api/tasks/handlers";
import { petRecordFromRow, petStateToRow } from "@/lib/db/pet";
import { taskFromRow } from "@/lib/db/tasks";
import type { PetState } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";
import type { AppDeps, CompletionCommit, CompletionResult, PetSnapshot } from "@/lib/server/stores";
import { request, USER_ID } from "../helpers/world";

const databaseUrl = process.env.HAUNTED_TEST_DATABASE_URL;
const NOW = Date.UTC(2026, 4, 2, 12);

function timestamps(row: QueryResultRow): QueryResultRow {
  const copy: QueryResultRow = { ...row };
  for (const [key, value] of Object.entries(copy)) {
    if (value instanceof Date) copy[key] = value.toISOString();
  }
  return copy;
}

function pgStores(client: Pool, userId: string): AppDeps {
  const pets = {
    async get(id: string): Promise<PetSnapshot | null> {
      const result = await client.query("select * from public.pet_state where user_id = $1", [id]);
      const row = result.rows[0];
      if (!row) return null;
      return petRecordFromRow(timestamps(row));
    },
    async save(state: PetState, expectedVersion: number): Promise<PetSnapshot | null> {
      const row = petStateToRow(state);
      if (expectedVersion === 0) {
        try {
          await client.query(
            `insert into public.pet_state (
              id, user_id, time_zone, stage, status, hp, hunger, mood,
              current_streak, tasks_completed_total, last_completion_at, last_completion_day,
              became_adult_at, hours_as_adult, recent_completion_timestamps,
              recent_completion_categories, recent_completion_task_ids, current_epitaph,
              graveyard, last_tick_at, died_at, version
            ) values (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,1
            )`,
            [
              row.id,
              row.user_id,
              row.time_zone,
              row.stage,
              row.status,
              row.hp,
              row.hunger,
              row.mood,
              row.current_streak,
              row.tasks_completed_total,
              row.last_completion_at,
              row.last_completion_day,
              row.became_adult_at,
              row.hours_as_adult,
              row.recent_completion_timestamps,
              row.recent_completion_categories,
              row.recent_completion_task_ids,
              row.current_epitaph,
              JSON.stringify(row.graveyard ?? []),
              row.last_tick_at,
              row.died_at,
            ],
          );
        } catch (error) {
          if (error && typeof error === "object" && "code" in error && error.code === "23505") {
            return null;
          }
          throw error;
        }
        return pets.get(state.userId);
      }
      const updated = await client.query(
        `update public.pet_state set
          stage = $3, status = $4, hp = $5, hunger = $6, mood = $7,
          current_streak = $8, tasks_completed_total = $9,
          last_completion_at = $10, last_completion_day = $11, became_adult_at = $12,
          hours_as_adult = $13, recent_completion_timestamps = $14,
          recent_completion_categories = $15, recent_completion_task_ids = $16,
          current_epitaph = $17, graveyard = $18::jsonb, last_tick_at = $19, died_at = $20,
          version = version + 1
        where user_id = $1 and version = $2
        returning version`,
        [
          state.userId,
          expectedVersion,
          row.stage,
          row.status,
          row.hp,
          row.hunger,
          row.mood,
          row.current_streak,
          row.tasks_completed_total,
          row.last_completion_at,
          row.last_completion_day,
          row.became_adult_at,
          row.hours_as_adult,
          row.recent_completion_timestamps,
          row.recent_completion_categories,
          row.recent_completion_task_ids,
          row.current_epitaph,
          JSON.stringify(row.graveyard ?? []),
          row.last_tick_at,
          row.died_at,
        ],
      );
      if (updated.rowCount === 0) return null;
      return pets.get(state.userId);
    },
  };

  const tasks = {
    async getTasks(id: string): Promise<Task[]> {
      const result = await client.query(
        "select * from public.tasks where user_id = $1 and deleted_at is null order by sort_order",
        [id],
      );
      return result.rows.map((row) => taskFromRow(timestamps(row)));
    },
    async upsertTask(task: Task): Promise<Task> {
      await client.query(
        `insert into public.tasks (
          id, user_id, title, notes, category, size, status, due_at, completed_at,
          deleted_at, parent_id, breakdown_suggested, all_subtasks_done, sort_order, created_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          task.id,
          task.userId,
          task.title,
          task.notes,
          task.category,
          task.size,
          task.status,
          task.dueAt === null ? null : new Date(task.dueAt).toISOString(),
          task.completedAt === null ? null : new Date(task.completedAt).toISOString(),
          task.deletedAt === null ? null : new Date(task.deletedAt).toISOString(),
          task.parentId,
          task.breakdownSuggested,
          task.allSubtasksDone,
          task.sortOrder,
          new Date(task.createdAt).toISOString(),
        ],
      );
      return task;
    },
    async markOverdue(taskId: string, ownerId: string): Promise<Task | null> {
      const result = await client.query(
        `update public.tasks set status = 'overdue'
         where id = $1 and user_id = $2 and status = 'todo' and deleted_at is null
         returning *`,
        [taskId, ownerId],
      );
      const row = result.rows[0];
      return row ? taskFromRow(timestamps(row)) : null;
    },
    async updateOpen(task: Task): Promise<Task | null> {
      const result = await client.query(
        `update public.tasks set
          title = $3, notes = $4, category = $5, size = $6, status = $7,
          due_at = $8, sort_order = $9
         where id = $1 and user_id = $2 and status <> 'done' and deleted_at is null
         returning *`,
        [
          task.id,
          task.userId,
          task.title,
          task.notes,
          task.category,
          task.size,
          task.status,
          task.dueAt === null ? null : new Date(task.dueAt).toISOString(),
          task.sortOrder,
        ],
      );
      const row = result.rows[0];
      return row ? taskFromRow(timestamps(row)) : null;
    },
    async softDeleteTask(taskId: string, ownerId: string, now: number): Promise<Task | null> {
      const result = await client.query(
        `update public.tasks set deleted_at = $3
         where id = $1 and user_id = $2 and deleted_at is null
         returning *`,
        [taskId, ownerId, new Date(now).toISOString()],
      );
      const row = result.rows[0];
      return row ? taskFromRow(timestamps(row)) : null;
    },
  };

  const events = {
    async appendEvent(ownerId: string, eventType: string, payload: Record<string, unknown>) {
      await client.query(
        "insert into public.events (user_id, event_type, payload) values ($1, $2, $3::jsonb)",
        [ownerId, eventType, JSON.stringify(payload)],
      );
    },
  };

  async function commitCompletion(input: CompletionCommit): Promise<CompletionResult> {
    try {
      const result = await client.query(
        "select public.complete_task($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb) as body",
        [
          input.task.userId,
          input.task.id,
          input.expectedVersion,
          new Date(input.task.completedAt ?? NOW).toISOString(),
          JSON.stringify({
            title: input.task.title,
            notes: input.task.notes,
            category: input.task.category,
            size: input.task.size,
            due_at: input.task.dueAt === null ? null : new Date(input.task.dueAt).toISOString(),
            sort_order: input.task.sortOrder,
          }),
          JSON.stringify(petStateToRow(input.pet)),
          JSON.stringify(
            input.events.map((event) => ({
              event_type: event.eventType,
              payload: event.payload,
            })),
          ),
        ],
      );
      const body = result.rows[0]?.body as { status?: string; version?: number; clock_offset_ms?: number };
      if (!body || body.status === "conflict") return { status: "conflict" };
      return {
        status: "ok",
        task: { ...input.task, status: "done", completedAt: input.task.completedAt ?? NOW },
        snapshot: {
          state: input.pet,
          clockOffsetMs: Number(body.clock_offset_ms ?? 0),
          version: body.version ?? input.expectedVersion + 1,
        },
      };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P0001") {
        return { status: "retry" };
      }
      throw error;
    }
  }

  const deps: AppDeps = {
    now: () => NOW,
    newId: () => crypto.randomUUID(),
    authorize: async () => ({
      userId,
      pets,
      tasks,
      events,
      commitCompletion,
    }),
  };
  return deps;
}

const describeDb = databaseUrl ? describe : describe.skip;

describeDb("postgres concurrency", () => {
  const client = new Pool({ connectionString: databaseUrl, max: 8 });

  beforeAll(async () => {
    await client.query("drop schema if exists public cascade");
    await client.query("create schema public");
    await client.query("drop schema if exists auth cascade");
    await client.query("create schema auth");
    await client.query("create table auth.users (id uuid primary key)");
    await client.query(
      "create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$",
    );
    const init = readFileSync("supabase/migrations/0001_init.sql", "utf8");
    const rls = readFileSync("supabase/migrations/0002_rls.sql", "utf8");
    await client.query(init);
    await client.query(rls);
    await client.query("insert into auth.users (id) values ($1)", [USER_ID]);
  });

  afterAll(async () => {
    await client.end();
  });

  it("completes four tasks and serves reads with no 500s and one reward each", async () => {
    const deps = pgStores(client, USER_ID);
    const ids: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const created = await postTask(
        request("POST", "/api/tasks", { title: `Pg ${index}`, category: "chores" }),
        deps,
      );
      expect(created.status).toBe(201);
      ids.push(((await created.json()) as { task: { id: string } }).task.id);
    }
    await client.query("update public.pet_state set hp = 10, stage = 'hatchling' where user_id = $1", [
      USER_ID,
    ]);

    const responses = await Promise.all([
      ...ids.map((id) => patchTask(request("PATCH", "/api/tasks", { id, status: "done" }), deps)),
      ...ids.map(() => getTasksRoute(request("GET", "/api/tasks"), deps)),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 200]);

    const tasks = await client.query(
      "select id, status from public.tasks where user_id = $1 order by sort_order",
      [USER_ID],
    );
    expect(tasks.rows.every((row) => row.status === "done")).toBe(true);
    const completions = await client.query(
      "select payload->>'taskId' as task_id from public.events where user_id = $1 and event_type = 'TASK_COMPLETED'",
      [USER_ID],
    );
    expect(completions.rows).toHaveLength(4);
    expect(new Set(completions.rows.map((row) => row.task_id))).toEqual(new Set(ids));
    const pet = await client.query(
      "select hp, tasks_completed_total from public.pet_state where user_id = $1",
      [USER_ID],
    );
    expect(Number(pet.rows[0]?.tasks_completed_total)).toBe(4);
    expect(Number(pet.rows[0]?.hp)).toBe(50);
  });
});
