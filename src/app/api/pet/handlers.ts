import { z } from "zod";
import { applyPetEvent } from "@/lib/game/pet";
import { badRequest, conflict, json, readJson, storageFailure, unauthorized } from "@/lib/server/http";
import type { AppDeps } from "@/lib/server/stores";
import { syncWorld } from "@/lib/server/sync";

/**
 * Client-writable pet operations. Game events such as TASK_COMPLETED,
 * DECAY_TICK, and ZOMBIE_DRAIN are produced by the server, not accepted here.
 */
const PetPatchSchema = z.union([
  z.object({ type: z.literal("REBIRTH") }).strict(),
  z.object({ timeZone: z.string().min(1) }).strict(),
]);

export async function getPet(request: Request, deps: AppDeps): Promise<Response> {
  try {
    const stores = await deps.authorize(request);
    if (!stores) return unauthorized();
    const world = await syncWorld(
      stores,
      deps.now(),
      request.headers.get("x-time-zone"),
      deps.newId,
    );
    return json({ pet: world.pet, now: world.now, clockOffsetMs: world.clockOffsetMs });
  } catch (error) {
    return storageFailure(error);
  }
}

export async function patchPet(request: Request, deps: AppDeps): Promise<Response> {
  try {
    const stores = await deps.authorize(request);
    if (!stores) return unauthorized();
    const parsed = PetPatchSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(parsed.error);

    if ("timeZone" in parsed.data) {
      const world = await syncWorld(stores, deps.now(), null, deps.newId);
      if (world.pet.timeZone !== parsed.data.timeZone) {
        return conflict("Time zone is fixed when the pet is created");
      }
      return json({ pet: world.pet });
    }

    const world = await syncWorld(
      stores,
      deps.now(),
      request.headers.get("x-time-zone"),
      deps.newId,
    );
    if (world.pet.status !== "tombstone" && world.pet.status !== "dead") {
      return conflict("Rebirth is only available after the pet has died");
    }
    const reduction = applyPetEvent(
      world.pet,
      { type: "REBIRTH", tombstoneId: deps.newId() },
      world.now,
    );
    const saved = await stores.pets.save(reduction.state, world.version);
    if (!saved) return conflict("Pet changed while rebirth was saving");
    await stores.events.appendEvent(stores.userId, "REBIRTH", {
      tombstoneId: reduction.state.graveyard.at(-1)?.id ?? null,
      at: world.now,
    });
    return json({ pet: reduction.state, emitted: reduction.emitted });
  } catch (error) {
    return storageFailure(error);
  }
}
