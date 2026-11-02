import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { clampStoredTaskTimes } from "@/lib/db/tasks";
import {
  clampFuturePetTimes,
  PET_STAGES,
  PET_STATUSES,
  type PetState,
  type TombstoneRecord,
} from "@/lib/game/pet";

const TombstoneRecordSchema = z.object({
  id: z.string().min(1),
  diedAt: z.number(),
  stage: z.enum(PET_STAGES),
  finalHp: z.number(),
  finalHunger: z.number(),
  finalMood: z.number(),
  tasksCompletedTotal: z.number(),
  epitaph: z.string(),
  overdueTaskIds: z.array(z.string()),
});

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

export const PetStateRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  time_zone: z.string().min(1),
  stage: z.enum(PET_STAGES),
  status: z.enum(PET_STATUSES),
  hp: z.coerce.number().min(0).max(100),
  hunger: z.coerce.number().min(0).max(100),
  mood: z.coerce.number().min(0).max(100),
  current_streak: z.coerce.number().int(),
  tasks_completed_total: z.coerce.number().int(),
  last_completion_at: nullableUnixMs,
  last_completion_day: z.string().nullable(),
  became_adult_at: nullableUnixMs,
  hours_as_adult: z.coerce.number(),
  recent_completion_timestamps: z.array(z.coerce.number()),
  recent_completion_categories: z.array(z.string()),
  recent_completion_task_ids: z.array(z.string()),
  current_epitaph: z.string().nullable(),
  graveyard: z.array(TombstoneRecordSchema),
  last_tick_at: nullableUnixMs,
  died_at: nullableUnixMs,
  clock_offset_ms: z.coerce.number().int(),
  version: z.coerce.number().int(),
});

export interface PetRecord {
  readonly state: PetState;
  readonly clockOffsetMs: number;
  readonly version: number;
}

function toTimestamptz(ms: number | null): string | null {
  if (ms === null) return null;
  return new Date(ms).toISOString();
}

export function petStateToRow(state: PetState): Record<string, unknown> {
  return {
    id: state.id,
    user_id: state.userId,
    time_zone: state.timeZone,
    stage: state.stage,
    status: state.status,
    hp: state.hp,
    hunger: state.hunger,
    mood: state.mood,
    current_streak: Math.max(0, Math.floor(state.currentStreak)),
    tasks_completed_total: Math.max(0, Math.floor(state.tasksCompletedTotal)),
    last_completion_at: toTimestamptz(state.lastCompletionAt),
    last_completion_day: state.lastCompletionDay,
    became_adult_at: toTimestamptz(state.becameAdultAt),
    hours_as_adult: state.hoursAsAdult,
    recent_completion_timestamps: state.recentCompletionTimestamps.slice(0, 10),
    recent_completion_categories: state.recentCompletionCategories.slice(0, 10),
    recent_completion_task_ids: state.recentCompletionTaskIds.slice(0, 10),
    current_epitaph: state.currentEpitaph,
    graveyard: state.graveyard,
    last_tick_at: toTimestamptz(state.lastTickAt),
    died_at: toTimestamptz(state.diedAt),
  };
}

export function petRecordFromRow(row: unknown): PetRecord {
  const parsed = PetStateRowSchema.parse(row);
  const graveyard: TombstoneRecord[] = parsed.graveyard.map((record) => ({
    ...record,
    overdueTaskIds: record.overdueTaskIds,
  }));
  return {
    clockOffsetMs: parsed.clock_offset_ms,
    version: parsed.version,
    state: {
      id: parsed.id,
      userId: parsed.user_id,
      timeZone: parsed.time_zone,
      stage: parsed.stage,
      status: parsed.status,
      hp: parsed.hp,
      hunger: parsed.hunger,
      mood: parsed.mood,
      currentStreak: parsed.current_streak,
      tasksCompletedTotal: parsed.tasks_completed_total,
      lastCompletionAt: parsed.last_completion_at,
      lastCompletionDay: parsed.last_completion_day,
      becameAdultAt: parsed.became_adult_at,
      hoursAsAdult: parsed.hours_as_adult,
      recentCompletionTimestamps: parsed.recent_completion_timestamps,
      recentCompletionCategories: parsed.recent_completion_categories,
      recentCompletionTaskIds: parsed.recent_completion_task_ids,
      currentEpitaph: parsed.current_epitaph,
      graveyard,
      lastTickAt: parsed.last_tick_at,
      diedAt: parsed.died_at,
    },
  };
}

function throwOnError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function getPetRecord(
  supabase: SupabaseClient,
  userId: string,
): Promise<PetRecord | null> {
  const { data, error } = await supabase
    .from("pet_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  throwOnError(error);
  if (!data) return null;
  return petRecordFromRow(data);
}

export async function getPetState(
  supabase: SupabaseClient,
  userId: string,
): Promise<PetState | null> {
  const record = await getPetRecord(supabase, userId);
  return record?.state ?? null;
}

/**
 * Insert when `expectedVersion` is 0, otherwise compare-and-swap on `version`.
 * `clock_offset_ms` is omitted so a save does not reset the demo offset.
 * Returns null when another writer won the version check.
 */
export async function savePetState(
  supabase: SupabaseClient,
  state: PetState,
  expectedVersion: number,
): Promise<PetRecord | null> {
  if (expectedVersion === 0) {
    const inserted = await supabase
      .from("pet_state")
      .insert({ ...petStateToRow(state), version: 1 })
      .select("*")
      .single();
    if (inserted.error) {
      if (inserted.error.code === "23505") return null;
      throw new Error(inserted.error.message);
    }
    return petRecordFromRow(inserted.data);
  }

  const updated = await supabase
    .from("pet_state")
    .update({ ...petStateToRow(state), version: expectedVersion + 1 })
    .eq("id", state.id)
    .eq("user_id", state.userId)
    .eq("version", expectedVersion)
    .select("*")
    .maybeSingle();
  throwOnError(updated.error);
  if (!updated.data) return null;
  return petRecordFromRow(updated.data);
}

const PET_PAGE = 1000;

/** Every pet row, one page at a time. PostgREST stops a bare select at 1000. */
export async function listPetUserIds(supabase: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("pet_state")
      .select("user_id")
      .order("user_id", { ascending: true })
      .range(from, from + PET_PAGE - 1);
    throwOnError(error);
    const page = z
      .array(z.object({ user_id: z.uuid() }))
      .parse(data ?? [])
      .map((row) => row.user_id);
    if (page.length === 0) return ids;
    ids.push(...page);
    from += page.length;
  }
}

/**
 * Persist a demo clock offset. Compare-and-swap on `version` so a catch-up
 * save cannot put the old offset back. `clampTo` pulls future cursors down
 * to the reset instant; due dates are not rewritten.
 */
export async function setClockOffset(
  supabase: SupabaseClient,
  userId: string,
  clockOffsetMs: number,
  clampTo: number | null,
): Promise<PetRecord | null> {
  if (!Number.isSafeInteger(clockOffsetMs) || clockOffsetMs < 0) {
    throw new Error("clock offset must be a non-negative integer");
  }
  const current = await getPetRecord(supabase, userId);
  if (!current) return null;
  const state = clampTo === null ? current.state : clampFuturePetTimes(current.state, clampTo);
  if (clampTo !== null) await clampStoredTaskTimes(supabase, userId, clampTo);
  const updated = await supabase
    .from("pet_state")
    .update({
      ...petStateToRow(state),
      clock_offset_ms: clockOffsetMs,
      version: current.version + 1,
    })
    .eq("user_id", userId)
    .eq("version", current.version)
    .select("*")
    .maybeSingle();
  throwOnError(updated.error);
  if (!updated.data) return null;
  return petRecordFromRow(updated.data);
}
