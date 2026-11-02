import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDay } from "@/lib/game/evolution";
import { serverEnv } from "@/lib/server/env";

/** Model calls one user may make on a UTC day before the fallback takes over. */
export const USER_AI_DAILY_CAP = 20;
/** Site-wide default when `AI_DAILY_CAP` is unset. */
export const DEFAULT_SITE_AI_DAILY_CAP = 200;

export function siteAiDailyCap(): number {
  const raw = serverEnv("AI_DAILY_CAP");
  if (!raw) return DEFAULT_SITE_AI_DAILY_CAP;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_SITE_AI_DAILY_CAP;
  return parsed;
}

export function budgetDay(now: number): string {
  return calendarDay(now, "UTC");
}

/** True when this attempt was counted under both caps. */
export async function takeAiBudget(
  supabase: SupabaseClient,
  userId: string,
  now: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("take_ai_budget", {
    p_user_id: userId,
    p_day: budgetDay(now),
    p_user_cap: USER_AI_DAILY_CAP,
    p_site_cap: siteAiDailyCap(),
  });
  if (error) throw new Error(error.message);
  return data === true;
}
