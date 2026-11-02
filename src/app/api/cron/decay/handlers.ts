import { listPetUserIds } from "@/lib/db/pet";
import { createServiceClient } from "@/lib/db/client";
import { serverEnv } from "@/lib/server/env";
import { json, storageFailure } from "@/lib/server/http";
import { productionServiceStores } from "@/lib/server/production";
import { bearerMatchesSecret } from "@/lib/server/secret";
import { SystemClock } from "@/lib/server/clock";
import type { AuthedStores } from "@/lib/server/stores";
import { syncWorld } from "@/lib/server/sync";

export interface CronDeps {
  now(): number;
  newId(): string;
  secret: string | undefined;
  listUserIds(): Promise<string[]>;
  storesFor(userId: string): Promise<AuthedStores>;
}

/**
 * Daily backstop. The same catch-up as a signed-in read: mark newly overdue
 * tasks, decay, and apply zombie drain for the hours each zombie was overdue.
 * Epitaph text is Week 3 (`/api/ai/epitaph`); this handler only counts deaths.
 */
export async function runDecayCron(request: Request, deps: CronDeps): Promise<Response> {
  if (!bearerMatchesSecret(request.headers.get("authorization"), deps.secret)) {
    return json({ error: "Unauthorized" }, 401);
  }
  try {
    const userIds = await deps.listUserIds();
    let processed = 0;
    let deaths = 0;
    let failures = 0;
    for (const userId of userIds) {
      try {
        const stores = await deps.storesFor(userId);
        const before = await stores.pets.get(userId);
        if (!before) continue;
        const world = await syncWorld(stores, deps.now(), null, deps.newId);
        processed += 1;
        if (before.state.status === "alive" && world.pet.status === "dead") deaths += 1;
      } catch (error) {
        console.error(error);
        failures += 1;
      }
    }
    return json({ processed, deaths, failures });
  } catch (error) {
    return storageFailure(error);
  }
}

export function productionCronDeps(): CronDeps {
  const clock = new SystemClock();
  return {
    now: () => clock.now(),
    newId: () => crypto.randomUUID(),
    secret: serverEnv("CRON_SECRET"),
    async listUserIds() {
      return listPetUserIds(createServiceClient());
    },
    async storesFor(userId) {
      return productionServiceStores(userId);
    },
  };
}
