import { z } from "zod";
import { resolveEpitaph } from "@/lib/ai/epitaph";
import { completeJson } from "@/lib/ai/llm";
import { applyPetEvent, FALLBACK_EPITAPH } from "@/lib/game/pet";
import { serverEnv } from "@/lib/server/env";
import {
  badRequest,
  conflict,
  json,
  readJson,
  storageFailure,
  unauthorized,
} from "@/lib/server/http";
import { productionDeps, productionServiceStores } from "@/lib/server/production";
import { allowAi } from "@/lib/server/rate-limit";
import { bearerMatchesSecret } from "@/lib/server/secret";
import type { AppDeps, AuthedStores } from "@/lib/server/stores";
import { syncWorld } from "@/lib/server/sync";

const CronBodySchema = z.object({ userId: z.uuid() }).strict();

export interface EpitaphDeps extends AppDeps {
  readonly cronSecret: string | undefined;
  storesFor(userId: string): Promise<AuthedStores>;
  completeJson(prompt: string): Promise<unknown | null>;
  allow(bucket: string, now: number): boolean;
}

/**
 * Carve an epitaph for a dead pet and apply `EPITAPH_READY` on the server.
 * The client cannot send that event to `/api/pet`. A cron bearer may name
 * the user; everyone else is limited to their own session.
 */
export async function postEpitaph(request: Request, deps: EpitaphDeps): Promise<Response> {
  try {
    const stores = await storesFrom(request, deps);
    if (stores instanceof Response) return stores;
    const world = await syncWorld(
      stores,
      deps.now(),
      request.headers.get("x-time-zone"),
      deps.newId,
    );
    if (world.pet.status === "tombstone") {
      return json({
        pet: world.pet,
        epitaph: world.pet.currentEpitaph ?? FALLBACK_EPITAPH,
        source: "stored",
      });
    }
    if (world.pet.status !== "dead") return conflict("The pet is still with us");
    if (!deps.allow(`epitaph:${stores.userId}`, deps.now())) {
      return json({ error: "Too many epitaphs" }, 429, { "Retry-After": "60" });
    }
    const resolved = await resolveEpitaph(world.pet, world.tasks, deps.completeJson);
    const reduction = applyPetEvent(
      world.pet,
      { type: "EPITAPH_READY", epitaph: resolved.epitaph },
      world.now,
    );
    const saved = await stores.pets.save(reduction.state, world.version);
    if (!saved) {
      const fresh = await stores.pets.get(stores.userId);
      if (fresh?.state.status === "tombstone") {
        return json({
          pet: fresh.state,
          epitaph: fresh.state.currentEpitaph ?? resolved.epitaph,
          source: "stored",
        });
      }
      return conflict("Pet changed while the epitaph was carved");
    }
    await stores.events.appendEvent(stores.userId, "EPITAPH_READY", {
      epitaph: resolved.epitaph,
      at: world.now,
    });
    return json({ pet: saved.state, epitaph: resolved.epitaph, source: resolved.source });
  } catch (error) {
    return storageFailure(error);
  }
}

async function storesFrom(request: Request, deps: EpitaphDeps): Promise<AuthedStores | Response> {
  if (bearerMatchesSecret(request.headers.get("authorization"), deps.cronSecret)) {
    const parsed = CronBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(parsed.error);
    return deps.storesFor(parsed.data.userId);
  }
  const stores = await deps.authorize(request);
  if (!stores) return unauthorized();
  return stores;
}

export function productionEpitaphDeps(): EpitaphDeps {
  const base = productionDeps();
  return {
    ...base,
    cronSecret: serverEnv("CRON_SECRET"),
    storesFor: (userId) => Promise.resolve(productionServiceStores(userId)),
    completeJson,
    allow: allowAi,
  };
}
