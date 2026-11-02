import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/** Append-only insert. The identity column `seq` is assigned by Postgres. */
export async function appendEvent(
  supabase: SupabaseClient,
  userId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("events").insert({
    user_id: userId,
    event_type: eventType,
    payload,
  });
  if (error) throw new Error(error.message);
}

const EventRowSchema = z.object({
  user_id: z.uuid(),
  event_type: z.string().min(1),
  payload: z.unknown(),
  seq: z.coerce.number().int(),
});

export interface TimelineEvent {
  readonly seq: number;
  readonly userId: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}

/** Timeline order is `seq`, which stays monotonic when `created_at` ties. */
export async function listEvents(
  supabase: SupabaseClient,
  userId: string,
): Promise<TimelineEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("user_id", userId)
    .order("seq", { ascending: true });
  if (error) throw new Error(error.message);
  return z
    .array(EventRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      seq: row.seq,
      userId: row.user_id,
      eventType: row.event_type,
      payload:
        row.payload !== null && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {},
    }));
}
