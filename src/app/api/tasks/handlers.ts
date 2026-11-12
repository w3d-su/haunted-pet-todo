import { z } from "zod";
import { applyPetEvent, catchUp, deriveHoursAsAdult } from "@/lib/game/pet";
import {
  TASK_CATEGORIES,
  TASK_SIZES,
  isOverdue,
  makeTaskCompletedEvent,
  type Task,
  type TaskStatus,
} from "@/lib/game/tasks";
import { effectiveNow } from "@/lib/server/clock";
import {
  badRequest,
  conflict,
  json,
  notFound,
  readJson,
  retryLater,
  storageFailure,
  unauthorized,
} from "@/lib/server/http";
import type { AppDeps, AuthedStores } from "@/lib/server/stores";
import { syncWorld, type World } from "@/lib/server/sync";
import {
  MAX_NOTES_LENGTH,
  MAX_TIMESTAMP_MS,
  MAX_TITLE_LENGTH,
  openTasksFit,
  tooManyTasks,
  trimDoneTasks,
} from "@/lib/server/task-limits";

const title = z.string().trim().min(1).max(MAX_TITLE_LENGTH);
const notes = z.string().max(MAX_NOTES_LENGTH).nullable();
const dueAt = z.number().int().min(0).max(MAX_TIMESTAMP_MS).nullable();

const CreateTaskBodySchema = z
  .object({
    title,
    notes: notes.optional(),
    category: z.enum(TASK_CATEGORIES).optional(),
    size: z.enum(TASK_SIZES).optional(),
    dueAt: dueAt.optional(),
    parentId: z.uuid().nullable().optional(),
  })
  .strict();

const PatchTaskBodySchema = z
  .object({
    id: z.uuid(),
    title: title.optional(),
    notes: notes.optional(),
    category: z.enum(TASK_CATEGORIES).optional(),
    size: z.enum(TASK_SIZES).optional(),
    dueAt: dueAt.optional(),
    status: z.literal("done").optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

const ReorderTasksSchema = z.object({
  orderedIds: z.array(z.uuid()).min(1).refine((ids) => new Set(ids).size === ids.length),
}).strict();

const DeleteTaskBodySchema = z.object({ id: z.uuid() }).strict();

export interface TaskNode extends Task {
  readonly subtasks: readonly TaskNode[];
}

export function nestTasks(tasks: readonly Task[], now: number): TaskNode[] {
  const byParent = new Map<string, Task[]>();
  const roots: Task[] = [];
  const ids = new Set(tasks.map((task) => task.id));
  for (const task of tasks) {
    if (task.parentId && ids.has(task.parentId)) {
      const list = byParent.get(task.parentId) ?? [];
      list.push(task);
      byParent.set(task.parentId, list);
    } else {
      roots.push(task);
    }
  }
  const node = (task: Task): TaskNode => ({
    ...task,
    status: isOverdue(task, now) ? "overdue" : task.status,
    subtasks: (byParent.get(task.id) ?? []).map(node),
  });
  return roots.map(node);
}

async function authed(request: Request, deps: AppDeps): Promise<AuthedStores | Response> {
  const stores = await deps.authorize(request);
  if (!stores) return unauthorized();
  return stores;
}

export async function getTasksRoute(request: Request, deps: AppDeps): Promise<Response> {
  try {
    const stores = await authed(request, deps);
    if (stores instanceof Response) return stores;
    const world = await syncWorld(
      stores,
      deps.now(),
      request.headers.get("x-time-zone"),
      deps.newId,
    );
    return json({ tasks: nestTasks(world.tasks, world.now), now: world.now });
  } catch (error) {
    return storageFailure(error);
  }
}

export async function postTask(request: Request, deps: AppDeps): Promise<Response> {
  try {
    const stores = await authed(request, deps);
    if (stores instanceof Response) return stores;
    const parsed = CreateTaskBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(parsed.error);

    const world = await syncWorld(
      stores,
      deps.now(),
      request.headers.get("x-time-zone"),
      deps.newId,
    );
    if (parsed.data.parentId) {
      const parent = world.tasks.find((task) => task.id === parsed.data.parentId);
      if (!parent || parent.userId !== stores.userId) return notFound("Parent task not found");
    }
    if (!openTasksFit(world.tasks, 1)) return tooManyTasks();

    const sortOrder = world.tasks.reduce((max, task) => Math.max(max, task.sortOrder), 0) + 1;
    const task: Task = {
      id: deps.newId(),
      userId: stores.userId,
      title: parsed.data.title,
      notes: parsed.data.notes ?? null,
      category: parsed.data.category ?? "other",
      size: parsed.data.size ?? "medium",
      status: "todo",
      dueAt: parsed.data.dueAt ?? null,
      completedAt: null,
      deletedAt: null,
      parentId: parsed.data.parentId ?? null,
      breakdownSuggested: false,
      allSubtasksDone: false,
      sortOrder,
      createdAt: world.now,
    };
    const saved = await stores.tasks.upsertTask(task);
    await stores.events.appendEvent(stores.userId, "TASK_CREATED", {
      taskId: saved.id,
      title: saved.title,
      at: world.now,
    });
    await trimDoneTasks(stores, world.tasks, 1, world.now);
    return json({ task: saved }, 201);
  } catch (error) {
    return storageFailure(error);
  }
}

export async function patchTask(request: Request, deps: AppDeps): Promise<Response> {
  try {
    const stores = await authed(request, deps);
    if (stores instanceof Response) return stores;
    const body = await readJson(request);
    if (body && typeof body === "object" && "orderedIds" in body) {
      const order = ReorderTasksSchema.safeParse(body);
      if (!order.success) return badRequest(order.error);
      const saved = await stores.tasks.reorder(stores.userId, order.data.orderedIds);
      return saved ? json({ ok: true }) : conflict("The task list changed. Refresh and try again.");
    }
    const parsed = PatchTaskBodySchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error);

    const world = await syncWorld(
      stores,
      deps.now(),
      request.headers.get("x-time-zone"),
      deps.newId,
    );
    const current = world.tasks.find((task) => task.id === parsed.data.id);
    if (!current) return notFound("Task not found");

    if (parsed.data.status === "done" && current.status === "done") {
      return conflict("Task is already done");
    }

    if (parsed.data.status === "done") {
      return await completeTask(stores, current, world, parsed.data, deps);
    }

    let next: Task = current;
    if (parsed.data.title !== undefined) next = { ...next, title: parsed.data.title };
    if (parsed.data.notes !== undefined) next = { ...next, notes: parsed.data.notes };
    if (parsed.data.category !== undefined) next = { ...next, category: parsed.data.category };
    if (parsed.data.size !== undefined) next = { ...next, size: parsed.data.size };
    if (parsed.data.sortOrder !== undefined) next = { ...next, sortOrder: parsed.data.sortOrder };
    if (parsed.data.dueAt !== undefined) {
      next = { ...next, dueAt: parsed.data.dueAt };
      // No due time, or one still ahead, is not overdue any more.
      if (
        current.status === "overdue" &&
        (parsed.data.dueAt === null || parsed.data.dueAt > world.now)
      ) {
        next = { ...next, status: "todo" };
      }
    }

    const saved = await stores.tasks.updateOpen(next, parsed.data.sortOrder);
    if (!saved) return conflict("Done tasks cannot be edited");
    return json({ task: saved });
  } catch (error) {
    return storageFailure(error);
  }
}

const COMPLETION_ATTEMPTS = 5;

async function completeTask(
  stores: AuthedStores,
  current: Task,
  world: World,
  patch: {
    title?: string;
    notes?: string | null;
    category?: Task["category"];
    size?: Task["size"];
    dueAt?: number | null;
    sortOrder?: number;
  },
  deps: AppDeps,
): Promise<Response> {
  let task = current;
  if (patch.title !== undefined) task = { ...task, title: patch.title };
  if (patch.notes !== undefined) task = { ...task, notes: patch.notes };
  if (patch.category !== undefined) task = { ...task, category: patch.category };
  if (patch.size !== undefined) task = { ...task, size: patch.size };
  if (patch.sortOrder !== undefined) task = { ...task, sortOrder: patch.sortOrder };
  if (patch.dueAt !== undefined) task = { ...task, dueAt: patch.dueAt };

  let pet = world.pet;
  let version = world.version;
  let now = world.now;
  const tasks = world.tasks;

  for (let attempt = 0; attempt < COMPLETION_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      const fresh = await stores.pets.get(stores.userId);
      if (!fresh) return retryLater();
      now = effectiveNow(deps.now(), fresh.clockOffsetMs);
      pet = fresh.state;
      version = fresh.version;
    }
    const caught = catchUp(pet, tasks, now);
    pet = caught.state;
    const known = tasks.find((item) => item.id === task.id);
    if (attempt === 0 && (!known || known.status === "done")) {
      return conflict("Task is already done");
    }

    const event = makeTaskCompletedEvent({ ...task, status: known?.status ?? task.status }, now);
    const reduction = applyPetEvent(pet, event, now);
    const seen = new Set(caught.emitted.map((item) => JSON.stringify(item)));
    const events = [
      ...caught.emitted.map((emitted) => ({
        eventType: emitted.type,
        payload: { ...emitted, at: now },
      })),
      { eventType: "TASK_COMPLETED", payload: { ...event, at: now } },
      ...(event.wasOverdue
        ? [{ eventType: "ZOMBIE_SLAIN", payload: { taskId: task.id, at: now } }]
        : []),
      ...reduction.emitted
        .filter((emitted) => !seen.has(JSON.stringify(emitted)))
        .map((emitted) => ({
          eventType: emitted.type,
          payload: { ...emitted, at: now },
        })),
    ];
    const result = await stores.commitCompletion({
      task: { ...task, status: known?.status ?? task.status, completedAt: now },
      sortOrder: patch.sortOrder,
      expectedVersion: version,
      pet: reduction.state,
      events,
    });
    if (result.status === "conflict") return conflict("Task is already done");
    if (result.status === "ok") {
      return json({
        task: result.task,
        pet: deriveHoursAsAdult(result.snapshot.state, now),
        emitted: [...caught.emitted, ...reduction.emitted],
      });
    }
  }
  return retryLater();
}

export async function deleteTask(request: Request, deps: AppDeps): Promise<Response> {
  try {
    const stores = await authed(request, deps);
    if (stores instanceof Response) return stores;
    const url = new URL(request.url);
    const body = await readJson(request);
    const candidate =
      body && typeof body === "object"
        ? body
        : { id: url.searchParams.get("id") };
    const parsed = DeleteTaskBodySchema.safeParse(candidate);
    if (!parsed.success) return badRequest(parsed.error);

    const world = await syncWorld(
      stores,
      deps.now(),
      request.headers.get("x-time-zone"),
      deps.newId,
    );
    const current = world.tasks.find((task) => task.id === parsed.data.id);
    if (!current) return notFound("Task not found");
    // Delete first. A zombie is only logged as slain once its task is really gone.
    const deleted = await stores.tasks.softDeleteTask(current.id, stores.userId, world.now);
    if (!deleted) return notFound("Task not found");
    if (current.status === "overdue") {
      await stores.events.appendEvent(stores.userId, "ZOMBIE_SLAIN", {
        taskId: current.id,
        at: world.now,
      });
    }
    await stores.events.appendEvent(stores.userId, "TASK_DELETED", {
      taskId: current.id,
      at: world.now,
    });
    return json({ task: deleted });
  } catch (error) {
    return storageFailure(error);
  }
}

export type { TaskStatus };
