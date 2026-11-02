import { appendEvent } from "@/lib/db/events";
import { getPetRecord, savePetState } from "@/lib/db/pet";
import { claimDone, getTasks, softDeleteTask, upsertTask } from "@/lib/db/tasks";
import { bearerToken, createServiceClient, createUserClient } from "@/lib/db/client";
import { userIdFromAccessToken } from "@/lib/db/auth";
import { SystemClock } from "@/lib/server/clock";
import type { AppDeps } from "@/lib/server/stores";

const clock = new SystemClock();

/** Production wiring. Built per request so missing env fails the request, not the build. */
export function productionDeps(): AppDeps {
  return {
    now: () => clock.now(),
    newId: () => crypto.randomUUID(),
    async authorize(request) {
      const token = bearerToken(request);
      if (!token) return null;
      const userId = await userIdFromAccessToken(token);
      if (!userId) return null;
      const reader = createUserClient(token);
      const writer = createServiceClient();
      return {
        userId,
        pets: {
          get: (id) => getPetRecord(reader, id),
          save: (state, expectedVersion) => savePetState(writer, state, expectedVersion),
        },
        tasks: {
          getTasks: (id) => getTasks(reader, id),
          upsertTask: (task) => upsertTask(writer, task),
          claimDone: (task, now) => claimDone(writer, task, now),
          softDeleteTask: (taskId, id, now) => softDeleteTask(writer, taskId, id, now),
        },
        events: {
          appendEvent: (id, eventType, payload) => appendEvent(writer, id, eventType, payload),
        },
      };
    },
  };
}
