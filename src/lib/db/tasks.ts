import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  TASK_CATEGORIES,
  TASK_SIZES,
  TASK_STATUSES,
  type Task,
} from "@/lib/game/tasks";

const unixMs = z.union([z.number(), z.string()]).transform((value, ctx) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  ctx.addIssue({ code: "custom", message: "Expected a timestamp" });
  return z.NEVER;
});

const nullableUnixMs = z.union([unixMs, z.null()]);

export const TaskRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  title: z.string().min(1),
  notes: z.string().nullable(),
  category: z.enum(TASK_CATEGORIES),
  size: z.enum(TASK_SIZES),
  status: z.enum(TASK_STATUSES),
  due_at: nullableUnixMs,
  completed_at: nullableUnixMs,
  deleted_at: nullableUnixMs,
  parent_id: z.uuid().nullable(),
  breakdown_suggested: z.boolean(),
  all_subtasks_done: z.boolean(),
  sort_order: z.coerce.number().int(),
  created_at: unixMs,
});

function toTimestamptz(ms: number | null): string | null {
  if (ms === null) return null;
  return new Date(ms).toISOString();
}

export function taskToRow(task: Task): Record<string, unknown> {
  return {
    id: task.id,
    user_id: task.userId,
    title: task.title,
    notes: task.notes,
    category: task.category,
    size: task.size,
    status: task.status,
    due_at: toTimestamptz(task.dueAt),
    completed_at: toTimestamptz(task.completedAt),
    deleted_at: toTimestamptz(task.deletedAt),
    parent_id: task.parentId,
    breakdown_suggested: task.breakdownSuggested,
    all_subtasks_done: task.allSubtasksDone,
    sort_order: task.sortOrder,
    created_at: toTimestamptz(task.createdAt),
  };
}

export function taskFromRow(row: unknown): Task {
  const parsed = TaskRowSchema.parse(row);
  return {
    id: parsed.id,
    userId: parsed.user_id,
    title: parsed.title,
    notes: parsed.notes,
    category: parsed.category,
    size: parsed.size,
    status: parsed.status,
    dueAt: parsed.due_at,
    completedAt: parsed.completed_at,
    deletedAt: parsed.deleted_at,
    parentId: parsed.parent_id,
    breakdownSuggested: parsed.breakdown_suggested,
    allSubtasksDone: parsed.all_subtasks_done,
    sortOrder: parsed.sort_order,
    createdAt: parsed.created_at,
  };
}

function throwOnError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function getTasks(supabase: SupabaseClient, userId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  throwOnError(error);
  return z.array(z.unknown()).parse(data ?? []).map((row) => taskFromRow(row));
}

export async function upsertTask(supabase: SupabaseClient, task: Task): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .upsert(taskToRow(task), { onConflict: "id" })
    .select("*")
    .single();
  throwOnError(error);
  return taskFromRow(data);
}

/**
 * One winner: `status <> 'done'` in the same update. A concurrent complete gets null.
 */
export async function claimDone(
  supabase: SupabaseClient,
  task: Task,
  now: number,
): Promise<Task | null> {
  const done: Task = { ...task, status: "done", completedAt: now };
  const { data, error } = await supabase
    .from("tasks")
    .update(taskToRow(done))
    .eq("id", task.id)
    .eq("user_id", task.userId)
    .neq("status", "done")
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  throwOnError(error);
  if (!data) return null;
  return taskFromRow(data);
}

export async function softDeleteTask(
  supabase: SupabaseClient,
  taskId: string,
  userId: string,
  now: number,
): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tasks")
    .update({
      deleted_at: new Date(now).toISOString(),
    })
    .eq("id", taskId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  throwOnError(error);
  if (!data) return null;
  return taskFromRow(data);
}
