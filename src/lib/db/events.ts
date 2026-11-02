import type { SupabaseClient } from "@supabase/supabase-js";

/** Append-only insert. RLS allows INSERT for the signed-in user and no DELETE. */
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
