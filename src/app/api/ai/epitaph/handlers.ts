import { z } from "zod";
import { resolveEpitaph } from "@/lib/ai/epitaph";
import { completeJson, modelConfigured } from "@/lib/ai/llm";
import { localeFromHeader } from "@/lib/i18n/locale";
import { applyPetEvent, FALLBACK_EPITAPH, hpSpent } from "@/lib/game/pet";
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
import { bearerMatchesSecret } from "@/lib/server/secret";
import type { AppDeps, AuthedStores } from "@/lib/server/stores";
import { syncWorld } from "@/lib/server/sync";

const CronBodySchema = z.object({ userId: z.uuid() }).strict();

export interface EpitaphDeps extends AppDeps {
  readonly cronSecret: string | undefined;
  storesFor(userId: string): Promise<AuthedStores>;
  completeJson(prompt: string): Promise<unknown | null>;
  /** False when no model is set up. Absent means a model is there. */
  modelAvailable?(): boolean;
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
    if (world.pet.status !== "dead" && !hpSpent(world.pet.hp)) {
      return conflict("The pet is still with us");
    }
    const resolved = await resolveEpitaph(
      world.pet,
      world.tasks,
      // Every attempt is a model call, so a retry spends budget too.
      // With no model there is no call, and no budget is spent.
      async (prompt) => {
        if (deps.modelAvailable?.() === false) return null;
        return (await stores.budget.take(stores.userId, deps.now()))
          ? deps.completeJson(prompt)
          : null;
      },
      localeFromHeader(request.headers.get("x-locale")),
    );
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
    modelAvailable: modelConfigured,
  };
}
