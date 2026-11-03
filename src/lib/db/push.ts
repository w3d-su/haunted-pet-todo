import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PushCapError } from "@/lib/server/http";
import type { PushSubscription } from "@/lib/server/stores";

const PushRowSchema = z.object({
  user_id: z.uuid(),
  endpoint: z.string().min(1),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  locale: z.enum(["en", "zh-TW"]),
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
    .select("user_id, endpoint, p256dh, auth, locale")
    .eq("user_id", userId);
  throwOnError(error);
  return z
    .array(PushRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      locale: row.locale,
    }));
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
      locale: subscription.locale === "zh-TW" ? "zh-TW" : "en",
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
