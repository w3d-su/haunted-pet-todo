import { expect, it } from "vitest";
import { petRecordFromRow, petStateToRow, PetStateRowSchema } from "@/lib/db/pet";
import { taskFromRow, taskToRow, TaskRowSchema } from "@/lib/db/tasks";
import { initialPetState } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";

const USER = "11111111-1111-4111-8111-111111111111";
const PET = "22222222-2222-4222-8222-222222222222";
const TASK = "33333333-3333-4333-8333-333333333333";
const NOW = Date.UTC(2026, 2, 3, 4, 5, 6);

it("maps a pet row and floors stats for storage", () => {
  const state = {
    ...initialPetState(USER, NOW, PET, "America/New_York"),
    stage: "adult" as const,
    hp: 10.9,
    hunger: 20.2,
    mood: 30.8,
    currentStreak: 2,
    clockOffsetIgnored: true,
  };
  const row = petStateToRow(state);
  expect(row.hp).toBe(10.9);
  expect(row.hunger).toBe(20.2);
  expect(row.mood).toBe(30.8);
  expect(row.time_zone).toBe("America/New_York");
  expect(row).not.toHaveProperty("clock_offset_ms");

  const stored = {
    ...row,
    clock_offset_ms: 90,
    hp: 10.9,
    hunger: 20.2,
    mood: 30.8,
    died_at: null,
    version: 1,
    current_streak: 2,
    tasks_completed_total: 0,
    hours_as_adult: 0,
    recent_completion_timestamps: [],
    recent_completion_categories: [],
    graveyard: [],
    last_completion_at: null,
    last_completion_day: null,
    became_adult_at: null,
    current_epitaph: null,
    last_tick_at: new Date(NOW).toISOString(),
    created_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
  };
  const parsed = petRecordFromRow(PetStateRowSchema.parse(stored));
  expect(parsed.clockOffsetMs).toBe(90);
  expect(parsed.state.userId).toBe(USER);
  expect(parsed.state.lastTickAt).toBe(NOW);
  expect(parsed.state.timeZone).toBe("America/New_York");
});

it("maps a task row both ways", () => {
  const task: Task = {
    id: TASK,
    userId: USER,
    title: "Sweep",
    notes: null,
    category: "chores",
    size: "small",
    status: "todo",
    dueAt: NOW,
    completedAt: null,
    deletedAt: null,
    parentId: null,
    breakdownSuggested: false,
    allSubtasksDone: false,
    sortOrder: 3,
    createdAt: NOW,
  };
  const row = {
    ...taskToRow(task),
    due_at: new Date(NOW).toISOString(),
    completed_at: null,
    deleted_at: null,
    created_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
  };
  expect(taskFromRow(TaskRowSchema.parse(row))).toMatchObject({
    id: TASK,
    userId: USER,
    dueAt: NOW,
    sortOrder: 3,
    status: "todo",
  });
});
