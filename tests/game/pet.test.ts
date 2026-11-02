import { expect, it } from "vitest";
import {
  MAX_HP,
  TASK_HP_RESTORE,
  TASK_HUNGER_RESTORE,
  TASK_MOOD_BOOST,
  ZOMBIE_DRAIN_PER_HOUR,
} from "@/lib/game/constants";
import { calendarDay } from "@/lib/game/evolution";
import {
  FALLBACK_EPITAPH,
  applyPetEvent,
  catchUp,
  initialPetState,
  rebirthPet,
  type PetState,
} from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";

const HOUR = 3_600_000;
const START = Date.UTC(2026, 0, 10, 12);

function pet(overrides: Partial<PetState> = {}): PetState {
  return { ...initialPetState("user", START, "pet-1", "UTC"), ...overrides };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    userId: "user",
    title: "Task",
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
    createdAt: START,
    ...overrides,
  };
}

it("starts as an egg at full HP", () => {
  const state = initialPetState("user", START, "pet-1", "UTC");
  expect(state.stage).toBe("egg");
  expect(state.status).toBe("alive");
  expect(state.hp).toBe(MAX_HP);
  expect(state.id).toBe("pet-1");
});

it("hatches on the first completion and emits PET_HATCHED", () => {
  const result = applyPetEvent(
    pet(),
    { type: "TASK_COMPLETED", taskId: "t", wasOverdue: false, category: "chores", completedAt: START },
    START,
  );
  expect(result.state.stage).toBe("hatchling");
  expect(result.state.hp).toBe(MAX_HP);
  expect(result.state.hunger).toBe(100);
  expect(result.emitted).toEqual([{ type: "PET_HATCHED" }]);
});

it("grows a hatchling into an adult at the streak and task thresholds", () => {
  const yesterday = calendarDay(START - 24 * HOUR, "UTC");
  const state = pet({
    stage: "hatchling",
    tasksCompletedTotal: 6,
    currentStreak: 2,
    lastCompletionDay: yesterday,
    lastCompletionAt: START - 24 * HOUR,
    hp: 40,
    hunger: 40,
    mood: 40,
  });
  const result = applyPetEvent(
    state,
    {
      type: "TASK_COMPLETED",
      taskId: "t",
      wasOverdue: false,
      category: "work",
      completedAt: START,
    },
    START,
  );
  expect(result.state.stage).toBe("adult");
  expect(result.state.becameAdultAt).toBe(START);
  expect(result.state.tasksCompletedTotal).toBe(7);
  expect(result.state.currentStreak).toBe(3);
  expect(result.state.hp).toBe(40 + TASK_HP_RESTORE);
  expect(result.state.hunger).toBe(40 + TASK_HUNGER_RESTORE);
  expect(result.state.mood).toBe(40 + TASK_MOOD_BOOST);
  expect(result.emitted.map((event) => event.type)).toEqual(["PET_GREW_UP"]);
});

it("does not bump the streak twice on the same calendar day", () => {
  const state = pet({
    stage: "hatchling",
    currentStreak: 2,
    lastCompletionDay: calendarDay(START, "UTC"),
    lastCompletionAt: START - HOUR,
  });
  const result = applyPetEvent(
    state,
    { type: "TASK_COMPLETED", taskId: "t", wasOverdue: false, category: "other", completedAt: START },
    START,
  );
  expect(result.state.currentStreak).toBe(2);
});

it("kills the pet when a decay tick reaches 0 HP and keeps the stage", () => {
  const state = pet({ stage: "adult_scholar", hp: 5, lastTickAt: START });
  const result = applyPetEvent(
    state,
    { type: "DECAY_TICK", fromTime: START, toTime: START + HOUR },
    START + HOUR,
  );
  expect(result.state.hp).toBe(0);
  expect(result.state.status).toBe("dead");
  expect(result.state.stage).toBe("adult_scholar");
  expect(result.state.diedAt).toBe(START + HOUR);
  expect(result.state.currentEpitaph).toBe(FALLBACK_EPITAPH);
  expect(result.emitted[0]?.type).toBe("PET_DIED");
});

it("turns a dead pet into a tombstone when the epitaph arrives", () => {
  const state = pet({ status: "dead", hp: 0 });
  const result = applyPetEvent(state, { type: "EPITAPH_READY", epitaph: "So long." }, START);
  expect(result.state.status).toBe("tombstone");
  expect(result.state.currentEpitaph).toBe("So long.");
});

it("rebirths only a tombstone into a full-HP egg and appends the graveyard", () => {
  const dead = pet({ status: "tombstone", stage: "adult", hp: 0, tasksCompletedTotal: 4, currentEpitaph: "Bye" });
  const next = rebirthPet(dead, START + HOUR, "stone-1");
  expect(next.stage).toBe("egg");
  expect(next.status).toBe("alive");
  expect(next.hp).toBe(MAX_HP);
  expect(next.currentStreak).toBe(0);
  expect(next.id).toBe(dead.id);
  expect(next.graveyard).toHaveLength(1);
  expect(next.graveyard[0]).toMatchObject({ id: "stone-1", epitaph: "Bye", tasksCompletedTotal: 4 });
  const alive = pet();
  expect(rebirthPet(alive, START, "stone-2")).toBe(alive);
  const unmarked = pet({
    status: "dead",
    hp: 0,
    stage: "adult",
    diedAt: START - HOUR,
    currentEpitaph: null,
  });
  const reborn = rebirthPet(unmarked, START, "stone-3");
  expect(reborn.stage).toBe("egg");
  expect(reborn.status).toBe("alive");
  expect(reborn.graveyard[0]).toMatchObject({
    diedAt: START - HOUR,
    epitaph: FALLBACK_EPITAPH,
  });
});

it("ignores decay on dead and tombstone pets", () => {
  for (const status of ["dead", "tombstone"] as const) {
    const state = pet({ status, hp: 0, stage: "adult" });
    const result = applyPetEvent(
      state,
      { type: "DECAY_TICK", fromTime: START, toTime: START + 5 * HOUR },
      START,
    );
    expect(result.state).toBe(state);
    expect(result.emitted).toEqual([]);
  }
});

it("rewards two tasks completed in the same millisecond with the same category", () => {
  const base = pet({ stage: "hatchling", hp: 10, hunger: 10, mood: 10 });
  const first = applyPetEvent(
    base,
    { type: "TASK_COMPLETED", taskId: "task-a", wasOverdue: false, category: "chores", completedAt: START },
    START,
  );
  const second = applyPetEvent(
    first.state,
    { type: "TASK_COMPLETED", taskId: "task-b", wasOverdue: false, category: "chores", completedAt: START },
    START,
  );
  expect(second.state.tasksCompletedTotal).toBe(2);
  expect(second.state.hp).toBe(10 + TASK_HP_RESTORE * 2);
});

it("does not stack rewards when the same completion is applied twice", () => {
  const event = {
    type: "TASK_COMPLETED" as const,
    taskId: "t",
    wasOverdue: false,
    category: "chores",
    completedAt: START,
  };
  const once = applyPetEvent(pet({ stage: "hatchling", hp: 10, hunger: 10, mood: 10 }), event, START);
  const twice = applyPetEvent(once.state, event, START);
  expect(twice.state.hp).toBe(once.state.hp);
  expect(twice.state.hunger).toBe(once.state.hunger);
  expect(twice.state.mood).toBe(once.state.mood);
  expect(twice.emitted).toEqual([]);
});

it("emits STREAK_BROKEN when decay resets the streak", () => {
  const state = pet({
    stage: "adult",
    currentStreak: 3,
    lastCompletionAt: START,
    lastTickAt: START + 48 * HOUR,
    mood: 80,
  });
  const result = applyPetEvent(
    state,
    { type: "DECAY_TICK", fromTime: state.lastTickAt ?? START, toTime: START + 49 * HOUR },
    START + 49 * HOUR,
  );
  expect(result.state.currentStreak).toBe(0);
  expect(result.emitted.map((event) => event.type)).toContain("STREAK_BROKEN");
});

it("does not let zombies damage an egg", () => {
  const state = pet({ stage: "egg", hp: MAX_HP, lastTickAt: START });
  const drained = applyPetEvent(
    state,
    { type: "ZOMBIE_DRAIN", zombieCount: 3, fromTime: START, toTime: START + 5 * HOUR },
    START,
  );
  expect(drained.state).toBe(state);
  const caught = catchUp(state, [task({ status: "overdue", dueAt: START - HOUR })], START + 2 * HOUR);
  expect(caught.state.hp).toBe(MAX_HP);
  expect(caught.state.status).toBe("alive");
});

it("charges zombie drain only for the hours a task was actually overdue", () => {
  const state = pet({ stage: "adult", hp: 100, lastTickAt: START });
  const dueAt = START + 9 * HOUR;
  const result = catchUp(
    state,
    [task({ status: "todo", dueAt })],
    START + 10 * HOUR,
  );
  expect(result.overdueTaskIds).toEqual(["task-1"]);
  expect(result.tasks[0]?.status).toBe("overdue");
  // 10h of HP decay (50) plus 1h of one zombie (3).
  expect(result.state.hp).toBe(47);
  expect(result.state.status).toBe("alive");
});

it("leaves an unknown event alone", () => {
  const state = pet();
  const result = applyPetEvent(state, { type: "PET_HATCHED" }, START);
  expect(result.state).toBe(state);
});

it("treats a speck of HP left by zombie drain as death", () => {
  const damage = ZOMBIE_DRAIN_PER_HOUR * (1 / HOUR);
  const state = pet({ stage: "adult", hp: damage + 1e-12 });
  const result = applyPetEvent(
    state,
    { type: "ZOMBIE_DRAIN", zombieCount: 1, fromTime: START, toTime: START + 1 },
    START + 1,
  );
  expect(result.state.status).toBe("dead");
  expect(result.state.hp).toBe(0);
});
