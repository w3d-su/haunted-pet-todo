import { expect, it } from "vitest";
import {
  isOverdue,
  makeTaskCompletedEvent,
  markNewlyOverdue,
  taskCompletionDeltas,
  type Task,
} from "@/lib/game/tasks";
import {
  OVERDUE_TASK_HP_RESTORE,
  OVERDUE_TASK_HUNGER_RESTORE,
  TASK_HP_RESTORE,
  TASK_HUNGER_RESTORE,
  TASK_MOOD_BOOST,
} from "@/lib/game/constants";

const NOW = Date.UTC(2026, 5, 1, 12);

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    userId: "user",
    title: "Bury the laundry",
    notes: null,
    category: "chores",
    size: "small",
    status: "todo",
    dueAt: null,
    completedAt: null,
    deletedAt: null,
    parentId: null,
    breakdownSuggested: false,
    allSubtasksDone: false,
    sortOrder: 0,
    createdAt: NOW - 86_400_000,
    ...overrides,
  };
}

it("isOverdue covers status and dueAt combinations", () => {
  expect(isOverdue(task({ status: "done", dueAt: NOW - 1 }), NOW)).toBe(false);
  expect(isOverdue(task({ status: "todo", dueAt: null }), NOW)).toBe(false);
  expect(isOverdue(task({ status: "todo", dueAt: NOW + 1 }), NOW)).toBe(false);
  expect(isOverdue(task({ status: "todo", dueAt: NOW }), NOW)).toBe(true);
  expect(isOverdue(task({ status: "todo", dueAt: NOW - 1 }), NOW)).toBe(true);
  expect(isOverdue(task({ status: "overdue", dueAt: NOW - 1 }), NOW)).toBe(true);
  expect(isOverdue(task({ status: "todo", dueAt: NOW - 1, deletedAt: NOW }), NOW)).toBe(false);
});

it("pays a reduced reward for overdue tasks and the full reward otherwise", () => {
  expect(taskCompletionDeltas(task({ status: "overdue" }))).toEqual({
    hungerRestore: OVERDUE_TASK_HUNGER_RESTORE,
    hpRestore: OVERDUE_TASK_HP_RESTORE,
    moodBoost: TASK_MOOD_BOOST,
  });
  expect(taskCompletionDeltas(task({ status: "todo" }))).toEqual({
    hungerRestore: TASK_HUNGER_RESTORE,
    hpRestore: TASK_HP_RESTORE,
    moodBoost: TASK_MOOD_BOOST,
  });
});

it("marks wasOverdue on the completion event", () => {
  const event = makeTaskCompletedEvent(task({ status: "overdue" }), NOW);
  expect(event).toMatchObject({ type: "TASK_COMPLETED", wasOverdue: true, completedAt: NOW });
  expect(makeTaskCompletedEvent(task(), NOW).wasOverdue).toBe(false);
});

it("marks a past-due todo overdue once", () => {
  const overdue = task({ status: "overdue", dueAt: NOW - 1 });
  const todo = task({ id: "task-2", status: "todo", dueAt: NOW - 1 });
  const first = markNewlyOverdue([overdue, todo], NOW);
  expect(first.overdueTaskIds).toEqual(["task-2"]);
  const second = markNewlyOverdue(first.tasks, NOW);
  expect(second.overdueTaskIds).toEqual([]);
});

it("scales the reward by size and halves it for a subtask", () => {
  const base = taskCompletionDeltas({ status: "todo" });
  expect(taskCompletionDeltas({ status: "todo", size: "small" })).toEqual(base);
  expect(taskCompletionDeltas({ status: "todo", size: "medium" }).hpRestore).toBe(
    TASK_HP_RESTORE * 1.5,
  );
  expect(taskCompletionDeltas({ status: "todo", size: "large" })).toEqual({
    hungerRestore: TASK_HUNGER_RESTORE * 2,
    hpRestore: TASK_HP_RESTORE * 2,
    moodBoost: TASK_MOOD_BOOST * 2,
  });
  expect(taskCompletionDeltas({ status: "overdue", size: "large", subtask: true })).toEqual({
    hungerRestore: OVERDUE_TASK_HUNGER_RESTORE,
    hpRestore: OVERDUE_TASK_HP_RESTORE,
    moodBoost: TASK_MOOD_BOOST,
  });

  const child = makeTaskCompletedEvent(task({ size: "medium", parentId: "parent" }), NOW);
  expect(child).toMatchObject({ size: "medium", subtask: true });
  expect(makeTaskCompletedEvent(task(), NOW)).toMatchObject({ size: "small", subtask: false });
});
