import { appendEvent } from "@/lib/db/events";
import { getPetRecord, savePetState } from "@/lib/db/pet";
import { getTasks, softDeleteTask, upsertTask } from "@/lib/db/tasks";
import { bearerToken, createUserClient } from "@/lib/db/client";
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
      const supabase = createUserClient(token);
      return {
        userId,
        pets: {
          get: (id) => getPetRecord(supabase, id),
          save: (state) => savePetState(supabase, state),
        },
        tasks: {
          getTasks: (id) => getTasks(supabase, id),
          upsertTask: (task) => upsertTask(supabase, task),
          softDeleteTask: (taskId, id, now) => softDeleteTask(supabase, taskId, id, now),
        },
        events: {
          appendEvent: (id, eventType, payload) => appendEvent(supabase, id, eventType, payload),
        },
      };
    },
  };
}
