import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PushCapError } from "@/lib/server/http";
import type { PushSubscription } from "@/lib/server/stores";

const BaseRowSchema = z.object({
  user_id: z.uuid(),
  endpoint: z.string().min(1),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

const PushRowSchema = BaseRowSchema.extend({
  locale: z.enum(["en", "zh-TW"]),
});

type DbError = { message?: string; code?: string } | null;

/**
 * True when this database has not applied `20261105155001_push_locale.sql` yet.
 * A deploy can then keep saving subscriptions in English.
 */
export function missingLocaleColumn(error: DbError): boolean {
  if (!error?.message) return false;
  const message = error.message;
  if (error.code === "42703" && /locale/i.test(message)) return true;
  return /column ["']locale["'].*does not exist/i.test(message) || /could not find the ['"]locale['"] column/i.test(message);
}

function throwOnError(error: DbError): void {
  if (error?.message) throw new Error(error.message);
}

function storedLocale(locale: PushSubscription["locale"]): "en" | "zh-TW" {
  return locale === "zh-TW" ? "zh-TW" : "en";
}

export async function listPushSubscriptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<PushSubscription[]> {
  const withLocale = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth, locale")
    .eq("user_id", userId);
  if (missingLocaleColumn(withLocale.error)) {
    const legacy = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    throwOnError(legacy.error);
    return z
      .array(BaseRowSchema)
      .parse(legacy.data ?? [])
      .map((row) => ({
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        locale: "en" as const,
      }));
  }
  throwOnError(withLocale.error);
  return z
    .array(PushRowSchema)
    .parse(withLocale.data ?? [])
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
  const locale = storedLocale(subscription.locale);
  const row = {
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    auth: subscription.auth,
  };
  const saved = await supabase.from("push_subscriptions").upsert(
    { ...row, locale },
    { onConflict: "user_id,endpoint" },
  );
  const error = missingLocaleColumn(saved.error)
    ? (await supabase.from("push_subscriptions").upsert(row, { onConflict: "user_id,endpoint" })).error
    : saved.error;
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
