import { takeAiBudget } from "@/lib/db/ai-budget";
import { commitCompletion } from "@/lib/db/completion";
import { appendEvent, listEvents } from "@/lib/db/events";
import { claimNagDay } from "@/lib/db/nag";
import { getPetRecord, savePetState, setClockOffset } from "@/lib/db/pet";
import {
  deletePushSubscription,
  listPushSubscriptions,
  upsertPushSubscription,
} from "@/lib/db/push";
import {
  claimBreakdown,
  getTasks,
  markOverdue,
  softDeleteTask,
  updateOpen,
  upsertTask,
} from "@/lib/db/tasks";
import { bearerToken, createServiceClient, createUserClient } from "@/lib/db/client";
import { userIdFromAccessToken } from "@/lib/db/auth";
import { authorizeDemo, memoryDemoAllowed } from "@/lib/server/demo-store";
import { demoModeEnabled } from "@/lib/server/env";
import { SystemClock } from "@/lib/server/clock";
import type { AppDeps, AuthedStores } from "@/lib/server/stores";

const clock = new SystemClock();

function serviceStores(userId: string): AuthedStores {
  const writer = createServiceClient();
  return {
    userId,
    pets: {
      get: (id) => getPetRecord(writer, id),
      save: (state, expectedVersion) => savePetState(writer, state, expectedVersion),
    },
    tasks: {
      getTasks: (id) => getTasks(writer, id),
      upsertTask: (task) => upsertTask(writer, task),
      markOverdue: (taskId, id) => markOverdue(writer, taskId, id),
      updateOpen: (task) => updateOpen(writer, task),
      softDeleteTask: (taskId, id, now) => softDeleteTask(writer, taskId, id, now),
      claimBreakdown: (taskId, id) => claimBreakdown(writer, taskId, id),
    },
    events: {
      appendEvent: (id, eventType, payload) => appendEvent(writer, id, eventType, payload),
      listEvents: (id) => listEvents(writer, id),
    },
    push: {
      list: (id) => listPushSubscriptions(writer, id),
      upsert: (id, subscription) => upsertPushSubscription(writer, id, subscription),
      remove: (id, endpoint) => deletePushSubscription(writer, id, endpoint),
    },
    nags: {
      claimDay: (id, day) => claimNagDay(writer, id, day),
    },
    budget: {
      take: (id, now) => takeAiBudget(writer, id, now),
    },
    commitCompletion: (input) => commitCompletion(writer, input),
    setClockOffset: (id, shift) =>
      setClockOffset(writer, id, shift.clockOffsetMs, shift.clampTo),
  };
}

/** Production wiring. Built per request so missing env fails the request, not the build. */
export function productionDeps(): AppDeps {
  return {
    now: () => clock.now(),
    newId: () => crypto.randomUUID(),
    demoMode: demoModeEnabled(),
    async authorize(request) {
      const token = bearerToken(request);
      if (token) {
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
            claimBreakdown: (taskId, id) => claimBreakdown(writer, taskId, id),
          },
          events: {
            appendEvent: (id, eventType, payload) => appendEvent(writer, id, eventType, payload),
            listEvents: (id) => listEvents(reader, id),
          },
          push: {
            list: (id) => listPushSubscriptions(reader, id),
            upsert: (id, subscription) => upsertPushSubscription(writer, id, subscription),
            remove: (id, endpoint) => deletePushSubscription(writer, id, endpoint),
          },
          nags: {
            claimDay: (id, day) => claimNagDay(writer, id, day),
          },
          budget: {
            take: (id, now) => takeAiBudget(writer, id, now),
          },
          commitCompletion: (input) => commitCompletion(writer, input),
          setClockOffset: (id, shift) =>
            setClockOffset(writer, id, shift.clockOffsetMs, shift.clampTo),
        };
      }
      if (!memoryDemoAllowed()) return null;
      return authorizeDemo(request);
    },
  };
}

/** Service-role stores for one user. Cron has no user JWT. */
export function productionServiceStores(userId: string): AuthedStores {
  return serviceStores(userId);
}
