import { z } from "zod";
import { resolveBreakdown } from "@/lib/ai/breakdown";
import { BREAKDOWN_CLAIM_LOST } from "@/lib/ai/messages";
import { completeJson } from "@/lib/ai/llm";
import { dictionaryFor } from "@/lib/i18n/dictionaries";
import { localeFromHeader } from "@/lib/i18n/locale";
import type { Task } from "@/lib/game/tasks";
import { productionDeps } from "@/lib/server/production";
import {
  badRequest,
  conflict,
  json,
  notFound,
  readJson,
  storageFailure,
  unauthorized,
} from "@/lib/server/http";
import type { AppDeps } from "@/lib/server/stores";
import { syncWorld } from "@/lib/server/sync";

const BreakdownBodySchema = z.object({ taskId: z.uuid() }).strict();

export interface BreakdownDeps extends AppDeps {
  completeJson(prompt: string): Promise<unknown | null>;
}

export async function postBreakdown(request: Request, deps: BreakdownDeps): Promise<Response> {
  try {
    const stores = await deps.authorize(request);
    if (!stores) return unauthorized();
    const parsed = BreakdownBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(parsed.error);
    const locale = localeFromHeader(request.headers.get("x-locale"));

    const world = await syncWorld(
      stores,
      deps.now(),
      request.headers.get("x-time-zone"),
      deps.newId,
    );
    const task = world.tasks.find((item) => item.id === parsed.data.taskId);
    if (!task || task.userId !== stores.userId) return notFound("Task not found");
    if (task.size !== "large") return conflict("Only a large task can be broken down");
    if (task.status === "done") return conflict("A done task cannot be broken down");

    const children = world.tasks.filter((item) => item.parentId === task.id);
    if (children.length > 0) {
      return json({
        intro: dictionaryFor(locale).breakdown.already,
        subtasks: children.map((item) => item.title),
        source: "stored",
      });
    }

    const claimed = await stores.tasks.claimBreakdown(task.id, stores.userId);
    if (!claimed) return conflict(BREAKDOWN_CLAIM_LOST);

    const created: Task[] = [];
    try {
      const resolved = await resolveBreakdown(
        claimed,
        // Every attempt is a model call, so a retry spends budget too.
        async (prompt) =>
          (await stores.budget.take(stores.userId, deps.now())) ? deps.completeJson(prompt) : null,
        locale,
      );
      for (let index = 0; index < resolved.body.subtasks.length; index += 1) {
        const title = resolved.body.subtasks[index];
        if (!title) continue;
        const saved = await stores.tasks.upsertTask({
          id: deps.newId(),
          userId: stores.userId,
          title,
          notes: null,
          category: task.category,
          size: "small",
          status: "todo",
          dueAt: null,
          completedAt: null,
          deletedAt: null,
          parentId: task.id,
          breakdownSuggested: false,
          allSubtasksDone: false,
          sortOrder: index + 1,
          createdAt: world.now,
        });
        created.push(saved);
        await stores.events.appendEvent(stores.userId, "TASK_CREATED", {
          taskId: saved.id,
          title: saved.title,
          parentId: task.id,
          at: world.now,
        });
      }
      return json({
        intro: resolved.body.intro,
        subtasks: created.map((item) => item.title),
        source: resolved.source,
        task: claimed,
      });
    } catch (error) {
      // A failure before any subtask row exists releases the claim so the
      // player can ask again. Once a subtask is written the claim stays:
      // the next request returns those rows instead of starting a second set.
      if (created.length === 0) {
        try {
          await stores.tasks.releaseBreakdown(task.id, stores.userId);
        } catch (releaseError) {
          console.error(releaseError);
        }
      }
      return storageFailure(error);
    }
  } catch (error) {
    return storageFailure(error);
  }
}

export function productionBreakdownDeps(): BreakdownDeps {
  const base = productionDeps();
  return { ...base, completeJson };
}
