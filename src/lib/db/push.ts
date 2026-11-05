import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PushCapError } from "@/lib/server/http";
import type { PushSubscription } from "@/lib/server/stores";

const PushRowSchema = z.object({
  user_id: z.uuid(),
  endpoint: z.string().min(1),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

function throwOnError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function listPushSubscriptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<PushSubscription[]> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  throwOnError(error);
  return z
    .array(PushRowSchema)
    .parse(data ?? [])
    .map((row) => ({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }));
}

export async function upsertPushSubscription(
  supabase: SupabaseClient,
  userId: string,
  subscription: PushSubscription,
): Promise<void> {
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
    { onConflict: "user_id,endpoint" },
  );
  if (error?.message.includes("push subscription cap")) throw new PushCapError();
  throwOnError(error);
}

export async function deletePushSubscription(
  supabase: SupabaseClient,
  userId: string,
  endpoint: string,
): Promise<void> {
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
  throwOnError(error);
}

const PUSH_PAGE = 1000;

/** Distinct user ids with at least one subscription, one page at a time. */
export async function listPushUserIds(supabase: SupabaseClient): Promise<string[]> {
  const ids = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("user_id")
      .order("user_id", { ascending: true })
      .range(from, from + PUSH_PAGE - 1);
    throwOnError(error);
    const page = z.array(z.object({ user_id: z.uuid() })).parse(data ?? []);
    if (page.length === 0) return [...ids];
    for (const row of page) ids.add(row.user_id);
    from += page.length;
  }
}
