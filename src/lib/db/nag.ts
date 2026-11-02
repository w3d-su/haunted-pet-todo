import type { SupabaseClient } from "@supabase/supabase-js";

/** True the first time `day` is claimed for this user. The same day returns false. */
export async function claimNagDay(
  supabase: SupabaseClient,
  userId: string,
  day: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_nag_day", {
    p_user_id: userId,
    p_day: day,
  });
  if (error) throw new Error(error.message);
  return data === true;
}
