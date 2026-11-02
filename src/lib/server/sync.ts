import { isIanaTimeZone } from "@/lib/game/evolution";
import { catchUp, initialPetState, type PetState } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";
import { effectiveNow } from "@/lib/server/clock";
import type { AuthedStores } from "@/lib/server/stores";

export interface World {
  readonly pet: PetState;
  readonly tasks: readonly Task[];
  readonly clockOffsetMs: number;
  readonly now: number;
}

function zoneFromHeader(header: string | null): string | null {
  if (!header || !isIanaTimeZone(header)) return null;
  return header;
}

/**
 * Load the user's pet and tasks, then apply catch-up decay for the gap
 * since `lastTickAt`. Creates an egg on first contact. A valid
 * `X-Time-Zone` header sets the IANA zone used for streaks and evolution.
 */
export async function syncWorld(
  stores: AuthedStores,
  systemNow: number,
  timeZoneHeader: string | null,
  newId: () => string,
): Promise<World> {
  let record = await stores.pets.get(stores.userId);
  const requestedZone = zoneFromHeader(timeZoneHeader);

  if (!record) {
    const state = initialPetState(
      stores.userId,
      systemNow,
      newId(),
      requestedZone ?? "UTC",
    );
    const saved = await stores.pets.save(state);
    record = { state: saved, clockOffsetMs: 0 };
  }

  let state = record.state;
  if (requestedZone && requestedZone !== state.timeZone) {
    state = { ...state, timeZone: requestedZone };
  }

  const now = effectiveNow(systemNow, record.clockOffsetMs);
  const tasks = await stores.tasks.getTasks(stores.userId);
  const caught = catchUp(state, tasks, now);

  if (caught.state !== record.state) {
    await stores.pets.save(caught.state);
  }

  for (const taskId of caught.overdueTaskIds) {
    const task = caught.tasks.find((item) => item.id === taskId);
    if (!task) continue;
    await stores.tasks.upsertTask(task);
    await stores.events.appendEvent(stores.userId, "TASK_OVERDUE", { taskId, at: now });
  }

  for (const event of caught.emitted) {
    await stores.events.appendEvent(stores.userId, event.type, { ...event, at: now });
  }

  return {
    pet: caught.state,
    tasks: caught.tasks,
    clockOffsetMs: record.clockOffsetMs,
    now,
  };
}
