import type { SupabaseClient } from "@supabase/supabase-js";
import { petStateToRow } from "@/lib/db/pet";
import type { CompletionCommit, CompletionResult } from "@/lib/server/stores";

/** SQLSTATE raised by complete_task when the pet version compare-and-swap misses. */
const VERSION_CONFLICT = "HA001";

function isVersionConflict(error: { code?: string }): boolean {
  return error.code === VERSION_CONFLICT;
}

/**
 * One Postgres transaction: claim the task, compare-and-swap the pet, insert events.
 * A version miss rolls the claim back.
 */
export async function commitCompletion(
  supabase: SupabaseClient,
  input: CompletionCommit,
): Promise<CompletionResult> {
  const completedAt = new Date(input.task.completedAt ?? 0).toISOString();
  const { data, error } = await supabase.rpc("complete_task", {
    p_user_id: input.task.userId,
    p_task_id: input.task.id,
    p_expected_version: input.expectedVersion,
    p_completed_at: completedAt,
    p_task: {
      title: input.task.title,
      notes: input.task.notes,
      category: input.task.category,
      size: input.task.size,
      due_at: input.task.dueAt === null ? null : new Date(input.task.dueAt).toISOString(),
      sort_order: input.sortOrder,
    },
    p_pet: petStateToRow(input.pet),
    p_events: input.events.map((event) => ({
      event_type: event.eventType,
      payload: event.payload,
    })),
  });

  if (error) {
    if (isVersionConflict(error)) return { status: "retry" };
    throw new Error(error.message);
  }

  const body = data as { status?: string; version?: number; clock_offset_ms?: number } | null;
  if (!body || body.status === "conflict") return { status: "conflict" };
  if (body.status !== "ok" || typeof body.version !== "number") {
    throw new Error("complete_task returned an unexpected payload");
  }
  return {
    status: "ok",
    task: { ...input.task, status: "done", completedAt: input.task.completedAt ?? 0 },
    snapshot: {
      state: input.pet,
      clockOffsetMs: body.clock_offset_ms ?? 0,
      version: body.version,
    },
  };
}
