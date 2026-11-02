import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
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
  hp: z.coerce.number().int(),
  hunger: z.coerce.number().int(),
  mood: z.coerce.number().int(),
  current_streak: z.coerce.number().int(),
  tasks_completed_total: z.coerce.number().int(),
  last_completion_at: nullableUnixMs,
  last_completion_day: z.string().nullable(),
  became_adult_at: nullableUnixMs,
  hours_as_adult: z.coerce.number(),
  recent_completion_timestamps: z.array(z.coerce.number()),
  recent_completion_categories: z.array(z.string()),
  current_epitaph: z.string().nullable(),
  graveyard: z.array(TombstoneRecordSchema),
  last_tick_at: nullableUnixMs,
  clock_offset_ms: z.coerce.number().int(),
});

export interface PetRecord {
  readonly state: PetState;
  readonly clockOffsetMs: number;
}

function floorStat(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.floor(value)));
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
    hp: floorStat(state.hp, 100),
    hunger: floorStat(state.hunger, 100),
    mood: floorStat(state.mood, 100),
    current_streak: Math.max(0, Math.floor(state.currentStreak)),
    tasks_completed_total: Math.max(0, Math.floor(state.tasksCompletedTotal)),
    last_completion_at: toTimestamptz(state.lastCompletionAt),
    last_completion_day: state.lastCompletionDay,
    became_adult_at: toTimestamptz(state.becameAdultAt),
    hours_as_adult: state.hoursAsAdult,
    recent_completion_timestamps: state.recentCompletionTimestamps.slice(0, 10),
    recent_completion_categories: state.recentCompletionCategories.slice(0, 10),
    current_epitaph: state.currentEpitaph,
    graveyard: state.graveyard,
    last_tick_at: toTimestamptz(state.lastTickAt),
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
      currentEpitaph: parsed.current_epitaph,
      graveyard,
      lastTickAt: parsed.last_tick_at,
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
 * Upsert the pet row. `clock_offset_ms` is omitted so a save does not
 * reset the demo offset (column default 0 applies only on insert).
 */
export async function savePetState(supabase: SupabaseClient, state: PetState): Promise<PetState> {
  const { data, error } = await supabase
    .from("pet_state")
    .upsert(petStateToRow(state), { onConflict: "id" })
    .select("*")
    .single();
  throwOnError(error);
  return petRecordFromRow(data).state;
}
