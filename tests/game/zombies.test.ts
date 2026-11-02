import { expect, it } from "vitest";
import { ZOMBIE_DRAIN_PER_HOUR } from "@/lib/game/constants";
import type { Task } from "@/lib/game/tasks";
import { activeZombies, zombieDamage } from "@/lib/game/zombies";

const NOW = Date.UTC(2026, 5, 1);

function task(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    userId: "user",
    title: "Task",
    notes: null,
    category: "other",
    size: "medium",
    status: "todo",
    dueAt: null,
    completedAt: null,
    deletedAt: null,
    parentId: null,
    breakdownSuggested: false,
    allSubtasksDone: false,
    sortOrder: 0,
    createdAt: NOW,
    ...overrides,
  };
}

it("spawns one zombie per overdue task and none for done or future todos", () => {
  const tasks = [
    task({ id: "a", status: "overdue", dueAt: NOW - 10 }),
    task({ id: "b", status: "overdue", dueAt: NOW - 20 }),
    task({ id: "c", status: "done", dueAt: NOW - 10 }),
    task({ id: "d", status: "todo", dueAt: NOW + 10 }),
    task({ id: "e", status: "overdue", dueAt: NOW - 10, deletedAt: NOW }),
  ];
  const zombies = activeZombies(tasks, NOW);
  expect(zombies.map((zombie) => zombie.taskId)).toEqual(["a", "b"]);
  expect(zombies.every((zombie) => zombie.slain === false)).toBe(true);
});

it("returns no zombies for an all-done list", () => {
  expect(activeZombies([task({ status: "done", dueAt: NOW - 1 })], NOW)).toEqual([]);
});

it("scales zombie damage linearly", () => {
  expect(zombieDamage(0, 5)).toBe(0);
  expect(zombieDamage(2, 1)).toBe(2 * ZOMBIE_DRAIN_PER_HOUR);
  expect(zombieDamage(2, 3)).toBe(2 * ZOMBIE_DRAIN_PER_HOUR * 3);
});
