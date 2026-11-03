import { z } from "zod";
import { MAX_PUSH_SUBSCRIPTIONS, normalizedPushEndpoint, validPushKeys } from "@/lib/push/endpoint";
import type { Locale } from "@/lib/i18n/locale";
import { badRequest, json, readJson, storageFailure, unauthorized } from "@/lib/server/http";
import type { AppDeps } from "@/lib/server/stores";

const PushBodySchema = z.object({
  endpoint: z.string().min(1).max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
  locale: z.enum(["en", "zh-TW"]).optional(),
});

const DeletePushSchema = z.object({ endpoint: z.string().min(1).max(2048) }).strict();

export async function postPush(request: Request, deps: AppDeps): Promise<Response> {
  try {
    const stores = await deps.authorize(request);
    if (!stores) return unauthorized();
    const parsed = PushBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(parsed.error);
    const endpoint = normalizedPushEndpoint(parsed.data.endpoint);
    if (!endpoint) return json({ error: "Push endpoint is not allowed" }, 400);
    if (!validPushKeys(parsed.data.keys.p256dh, parsed.data.keys.auth)) {
      return json({ error: "Push keys are not valid" }, 400);
    }
    const current = await stores.push.list(stores.userId);
    const updating = current.some((row) => row.endpoint === endpoint);
    if (!updating && current.length >= MAX_PUSH_SUBSCRIPTIONS) {
      return json({ error: "Too many push subscriptions" }, 409);
    }
    const locale: Locale = parsed.data.locale === "zh-TW" ? "zh-TW" : "en";
    await stores.push.upsert(stores.userId, {
      endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      locale,
    });
    return json({ ok: true });
  } catch (error) {
    return storageFailure(error);
  }
}

export async function deletePush(request: Request, deps: AppDeps): Promise<Response> {
  try {
    const stores = await deps.authorize(request);
    if (!stores) return unauthorized();
    const parsed = DeletePushSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(parsed.error);
    await stores.push.remove(stores.userId, parsed.data.endpoint);
    return json({ ok: true });
  } catch (error) {
    return storageFailure(error);
  }
}
