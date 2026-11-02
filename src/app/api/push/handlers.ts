import { z } from "zod";
import { badRequest, json, readJson, storageFailure, unauthorized } from "@/lib/server/http";
import type { AppDeps } from "@/lib/server/stores";

const PushBodySchema = z.object({
  endpoint: z.string().min(1).max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

const DeletePushSchema = z.object({ endpoint: z.string().min(1).max(2048) }).strict();

export async function postPush(request: Request, deps: AppDeps): Promise<Response> {
  try {
    const stores = await deps.authorize(request);
    if (!stores) return unauthorized();
    const parsed = PushBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(parsed.error);
    await stores.push.upsert(stores.userId, {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
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
