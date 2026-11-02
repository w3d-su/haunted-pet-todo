import { commitCompletion } from "@/lib/db/completion";
import { appendEvent } from "@/lib/db/events";
import { getPetRecord, savePetState } from "@/lib/db/pet";
import { getTasks, markOverdue, softDeleteTask, updateOpen, upsertTask } from "@/lib/db/tasks";
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
          markOverdue: (taskId, id) => markOverdue(writer, taskId, id),
          updateOpen: (task) => updateOpen(writer, task),
          softDeleteTask: (taskId, id, now) => softDeleteTask(writer, taskId, id, now),
        },
        events: {
          appendEvent: (id, eventType, payload) => appendEvent(writer, id, eventType, payload),
        },
        commitCompletion: (input) => commitCompletion(writer, input),
      };
    },
  };
}
