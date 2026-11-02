import { isIanaTimeZone } from "@/lib/game/evolution";
import { catchUp, deriveHoursAsAdult, initialPetState, type PetState } from "@/lib/game/pet";
import { isOverdue, type Task } from "@/lib/game/tasks";
import { effectiveNow } from "@/lib/server/clock";
import type { AuthedStores } from "@/lib/server/stores";

export interface World {
  readonly pet: PetState;
  readonly tasks: readonly Task[];
  readonly clockOffsetMs: number;
  readonly now: number;
  readonly version: number;
}

const SAVE_ATTEMPTS = 3;

function zoneFromHeader(header: string | null): string | null {
  if (!header || !isIanaTimeZone(header)) return null;
  return header;
}

/**
 * Load the user's pet and tasks, then apply catch-up decay for the gap
 * since `lastTickAt`. Creates an egg on first contact. `X-Time-Zone` is
 * stored only then; later requests cannot change it.
 *
 * Bookkeeping that does not change the game (a dead pet's tick cursor,
 * derived hours as an adult) is not written back, so concurrent readers
 * do not fight over the version.
 */
export async function syncWorld(
  stores: AuthedStores,
  systemNow: number,
  timeZoneHeader: string | null,
  newId: () => string,
): Promise<World> {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt += 1) {
    const world = await catchUpOnce(stores, systemNow, timeZoneHeader, newId);
    if (world) return world;
  }
  throw new Error("pet_state version conflict");
}

async function catchUpOnce(
  stores: AuthedStores,
  systemNow: number,
  timeZoneHeader: string | null,
  newId: () => string,
): Promise<World | null> {
  let record = await stores.pets.get(stores.userId);
  const requestedZone = zoneFromHeader(timeZoneHeader);

  if (!record) {
    const created = initialPetState(
      stores.userId,
      systemNow,
      newId(),
      requestedZone ?? "UTC",
    );
    const saved = await stores.pets.save(created, 0);
    if (!saved) return null;
    record = saved;
  }

  const now = effectiveNow(systemNow, record.clockOffsetMs);
  const tasks = await stores.tasks.getTasks(stores.userId);
  for (const task of tasks) {
    if (task.status !== "todo" || !isOverdue(task, now)) continue;
    const marked = await stores.tasks.markOverdue(task.id, stores.userId);
    if (!marked) continue;
    await stores.events.appendEvent(stores.userId, "TASK_OVERDUE", { taskId: task.id, at: now });
  }
  const latestTasks = await stores.tasks.getTasks(stores.userId);
  const caught = catchUp(record.state, latestTasks, now);

  let pet = caught.state;
  let version = record.version;
  if (pet !== record.state) {
    const saved = await stores.pets.save(pet, version);
    if (!saved) {
      const fresh = await stores.pets.get(stores.userId);
      if (fresh && (fresh.state.lastTickAt ?? 0) >= now) {
        const freshTasks = await stores.tasks.getTasks(stores.userId);
        return view(fresh.state, freshTasks, fresh.clockOffsetMs, fresh.version, now);
      }
      return null;
    }
    pet = saved.state;
    version = saved.version;
  }

  for (const event of caught.emitted) {
    await stores.events.appendEvent(stores.userId, event.type, { ...event, at: now });
  }

  return view(pet, latestTasks, record.clockOffsetMs, version, now);
}

function view(
  pet: PetState,
  tasks: readonly Task[],
  clockOffsetMs: number,
  version: number,
  now: number,
): World {
  return {
    pet: deriveHoursAsAdult(pet, now),
    tasks,
    clockOffsetMs,
    now,
    version,
  };
}
