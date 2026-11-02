import fc from "fast-check";
import { expect, it } from "vitest";
import { OffsetClock } from "@/lib/game/clock";
import { MAX_HP, ZOMBIE_DRAIN_PER_HOUR } from "@/lib/game/constants";
import { decayStats } from "@/lib/game/decay";
import { resolveEvolvedForm } from "@/lib/game/evolution";
import { petRecordFromRow, petStateToRow } from "@/lib/db/pet";
import { taskFromRow, taskToRow } from "@/lib/db/tasks";
import {
  applyPetEvent,
  catchUp,
  clampStats,
  rebirthPet,
  type PetState,
  type PetStage,
  type PetStatus,
} from "@/lib/game/pet";
import { isOverdue, type Task, type TaskCategory, type TaskSize, type TaskStatus } from "@/lib/game/tasks";
import { activeZombies, zombieDamage } from "@/lib/game/zombies";
import type { GameEvent } from "@/lib/game/events";

/** Every property below runs this many fast-check cases. */
const RUNS = 100;
const HOUR = 3_600_000;
const MIN = Date.UTC(2020, 0, 1);
const MAX = Date.UTC(2030, 0, 1);

const arbCategory = fc.constantFrom<TaskCategory>(
  "study",
  "work",
  "chores",
  "health",
  "creative",
  "other",
);
const arbStage = fc.constantFrom<PetStage>(
  "egg",
  "hatchling",
  "adult",
  "adult_night_owl",
  "adult_early_bird",
  "adult_scholar",
  "adult_haunter",
);
const arbStatus = fc.constantFrom<PetStatus>("alive", "dead", "tombstone");
const arbSize = fc.constantFrom<TaskSize>("small", "medium", "large");
const arbTaskStatus = fc.constantFrom<TaskStatus>("todo", "done", "overdue");
const arbTs = fc.integer({ min: MIN, max: MAX });

const arbTombstone = fc.record({
  id: fc.uuid(),
  diedAt: arbTs,
  stage: arbStage,
  finalHp: fc.integer({ min: 0, max: MAX_HP }),
  finalHunger: fc.integer({ min: 0, max: 100 }),
  finalMood: fc.integer({ min: 0, max: 100 }),
  tasksCompletedTotal: fc.nat({ max: 40 }),
  epitaph: fc.string({ maxLength: 24 }),
  overdueTaskIds: fc.array(fc.uuid(), { maxLength: 2 }),
});

const arbHistory = fc.array(
  fc.record({ ts: arbTs, category: arbCategory, taskId: fc.uuid() }),
  { maxLength: 10 },
);

const arbPetState: fc.Arbitrary<PetState> = fc
  .record({
    id: fc.uuid(),
    userId: fc.uuid(),
    timeZone: fc.constant("UTC"),
    stage: arbStage,
    status: arbStatus,
    hp: fc.integer({ min: 0, max: MAX_HP }),
    hunger: fc.integer({ min: 0, max: 100 }),
    mood: fc.integer({ min: 0, max: 100 }),
    currentStreak: fc.nat({ max: 30 }),
    tasksCompletedTotal: fc.nat({ max: 40 }),
    lastCompletionAt: fc.option(arbTs, { nil: null }),
    lastCompletionDay: fc.option(fc.constantFrom("2024-01-01", "2026-06-01"), { nil: null }),
    becameAdultAt: fc.option(arbTs, { nil: null }),
    hoursAsAdult: fc.integer({ min: 0, max: 400 }),
    history: arbHistory,
    currentEpitaph: fc.option(fc.string({ maxLength: 24 }), { nil: null }),
    graveyard: fc.array(arbTombstone, { maxLength: 2 }),
    lastTickAt: arbTs,
    diedAt: fc.constant(null),
  })
  .map(({ history, ...rest }) => ({
    ...rest,
    recentCompletionTimestamps: history.map((entry) => entry.ts),
    recentCompletionCategories: history.map((entry) => entry.category),
    recentCompletionTaskIds: history.map((entry) => entry.taskId),
  }));

const arbAlivePetState = arbPetState.map((state) => ({ ...state, status: "alive" as const }));
const arbDeadOrTombstoneState = arbPetState.chain((state) =>
  fc.constantFrom<PetStatus>("dead", "tombstone").map((status) => ({ ...state, status })),
);
const arbEggState = arbPetState.map((state) => ({
  ...state,
  stage: "egg" as const,
  status: "alive" as const,
}));
const arbTombstoneState = arbPetState.map((state) => ({
  ...state,
  status: "tombstone" as const,
}));
const arbAdultReadyForEvolution = arbPetState.map((state) => ({
  ...state,
  stage: "adult" as const,
  status: "alive" as const,
  currentStreak: 10 + (state.currentStreak % 10),
}));

const arbTaskCompletedEvent = fc.record({
  type: fc.constant("TASK_COMPLETED" as const),
  taskId: fc.uuid(),
  wasOverdue: fc.boolean(),
  category: arbCategory,
  completedAt: arbTs,
});

const arbDecayEvent = fc.record({
  type: fc.constant("DECAY_TICK" as const),
  fromTime: arbTs,
  toTime: arbTs,
});

const arbDrainEvent = fc.record({
  type: fc.constant("ZOMBIE_DRAIN" as const),
  zombieCount: fc.nat({ max: 4 }),
  fromTime: arbTs,
  toTime: arbTs,
});

const arbDamageEvent = fc.oneof(arbDecayEvent, arbDrainEvent);

const arbGameEvent: fc.Arbitrary<GameEvent> = fc.oneof(
  arbTaskCompletedEvent,
  arbDecayEvent,
  arbDrainEvent,
  fc.record({
    type: fc.constant("EPITAPH_READY" as const),
    epitaph: fc.string({ maxLength: 40 }),
  }),
  fc.record({
    type: fc.constant("REBIRTH" as const),
    tombstoneId: fc.uuid(),
  }),
  fc.constantFrom<GameEvent>(
    { type: "PET_HATCHED" },
    { type: "PET_GREW_UP" },
    { type: "STREAK_BROKEN" },
  ),
  fc.record({
    type: fc.constant("PET_EVOLVED" as const),
    newStage: fc.constantFrom<PetStage>(
      "adult_night_owl",
      "adult_early_bird",
      "adult_scholar",
      "adult_haunter",
    ),
  }),
  arbAlivePetState.map((state) => {
    const { graveyard, ...finalState } = state;
    void graveyard;
    return { type: "PET_DIED" as const, finalState };
  }),
);

const arbTask: fc.Arbitrary<Task> = fc.record({
  id: fc.uuid(),
  userId: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 24 }),
  notes: fc.option(fc.string({ maxLength: 24 }), { nil: null }),
  category: arbCategory,
  size: arbSize,
  status: arbTaskStatus,
  dueAt: fc.option(arbTs, { nil: null }),
  completedAt: fc.option(arbTs, { nil: null }),
  deletedAt: fc.option(arbTs, { nil: null }),
  parentId: fc.constant(null),
  breakdownSuggested: fc.boolean(),
  allSubtasksDone: fc.boolean(),
  sortOrder: fc.nat({ max: 20 }),
  createdAt: arbTs,
});

const arbOverdueTask = arbTask.map((task) => ({
  ...task,
  status: "overdue" as const,
  deletedAt: null,
  dueAt: task.dueAt ?? MIN,
}));

const arbDoneTask = arbTask.map((task) => ({ ...task, status: "done" as const }));

const arbThreeOrderedTimestamps = fc
  .tuple(
    fc.integer({ min: MIN, max: MAX - 30 * 24 * HOUR }),
    fc.integer({ min: 1, max: 10 * 24 * HOUR }),
    fc.integer({ min: 1, max: 10 * 24 * HOUR }),
  )
  .map(([start, first, second]) => [start, start + first, start + first + second] as const);

function check(property: ReturnType<typeof fc.property>): void {
  fc.assert(property, { numRuns: RUNS });
}

function inStatBounds(state: PetState): void {
  expect(state.hp).toBeGreaterThanOrEqual(0);
  expect(state.hp).toBeLessThanOrEqual(MAX_HP);
  expect(state.hunger).toBeGreaterThanOrEqual(0);
  expect(state.hunger).toBeLessThanOrEqual(100);
  expect(state.mood).toBeGreaterThanOrEqual(0);
  expect(state.mood).toBeLessThanOrEqual(100);
}

it("P1 HP stays in range after any event sequence", () => {
  check(
    fc.property(arbPetState, fc.array(arbGameEvent, { maxLength: 8 }), arbTs, (state, events, now) => {
      const result = events.reduce((current, event) => applyPetEvent(current, event, now).state, state);
      expect(result.hp).toBeGreaterThanOrEqual(0);
      expect(result.hp).toBeLessThanOrEqual(MAX_HP);
    }),
  );
});

it("P2 hunger stays in range after any event sequence", () => {
  check(
    fc.property(arbPetState, fc.array(arbGameEvent, { maxLength: 8 }), arbTs, (state, events, now) => {
      const result = events.reduce((current, event) => applyPetEvent(current, event, now).state, state);
      expect(result.hunger).toBeGreaterThanOrEqual(0);
      expect(result.hunger).toBeLessThanOrEqual(100);
    }),
  );
});

it("P3 mood stays in range after any event sequence", () => {
  check(
    fc.property(arbPetState, fc.array(arbGameEvent, { maxLength: 8 }), arbTs, (state, events, now) => {
      const result = events.reduce((current, event) => applyPetEvent(current, event, now).state, state);
      expect(result.mood).toBeGreaterThanOrEqual(0);
      expect(result.mood).toBeLessThanOrEqual(100);
    }),
  );
});

it("P4 dead and tombstone pets absorb decay and zombie drain", () => {
  check(
    fc.property(arbDeadOrTombstoneState, arbDamageEvent, arbTs, (state, event, now) => {
      const result = applyPetEvent(state, event, now);
      expect(result.state.hp).toBe(state.hp);
      expect(result.state).toBe(state);
    }),
  );
});

it("P5 task completion never lowers HP", () => {
  check(
    fc.property(arbAlivePetState, arbTaskCompletedEvent, arbTs, (state, event, now) => {
      const result = applyPetEvent(state, event, now).state;
      expect(result.hp).toBeGreaterThanOrEqual(state.hp);
    }),
  );
});

it("P6 evolution is deterministic", () => {
  check(
    fc.property(arbAdultReadyForEvolution, (state) => {
      expect(resolveEvolvedForm(state)).toBe(resolveEvolvedForm(state));
    }),
  );
});

it("P7 rebirth of a tombstone is a full-HP egg", () => {
  check(
    fc.property(arbTombstoneState, arbTs, fc.uuid(), (state, now, id) => {
      const next = rebirthPet(state, now, id);
      expect(next.hp).toBe(MAX_HP);
      expect(next.stage).toBe("egg");
      expect(next.status).toBe("alive");
    }),
  );
});

it("P8 the graveyard only grows on rebirth", () => {
  check(
    fc.property(arbTombstoneState, arbTs, fc.uuid(), (state, now, tombstoneId) => {
      const next = applyPetEvent(state, { type: "REBIRTH", tombstoneId }, now).state;
      expect(next.graveyard).toHaveLength(state.graveyard.length + 1);
      expect(next.graveyard.slice(0, state.graveyard.length)).toEqual([...state.graveyard]);
    }),
  );
});

it("P9 applyPetEvent is deterministic", () => {
  check(
    fc.property(arbPetState, arbGameEvent, arbTs, (state, event, now) => {
      expect(applyPetEvent(state, event, now)).toEqual(applyPetEvent(state, event, now));
    }),
  );
});

it("P10 clampStats is an in-range identity and idempotent", () => {
  check(
    fc.property(
      arbPetState,
      fc.double({ min: -50, max: 150, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: -50, max: 150, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: -50, max: 150, noNaN: true, noDefaultInfinity: true }),
      (state, hp, hunger, mood) => {
        const messy = { ...state, hp, hunger, mood };
        const once = clampStats(messy);
        const twice = clampStats(once);
        expect(twice).toEqual(once);
        inStatBounds(once);
        // `===` treats -0 as 0; clamp canonicalizes negative zero to 0.
        if (hp >= 0 && hp <= MAX_HP) expect(once.hp === hp).toBe(true);
        if (hunger >= 0 && hunger <= 100) expect(once.hunger === hunger).toBe(true);
        if (mood >= 0 && mood <= 100) expect(once.mood === mood).toBe(true);
      },
    ),
  );
});

it("P11 each overdue task has exactly one active zombie", () => {
  check(
    fc.property(
      fc.array(fc.oneof(arbTask, arbOverdueTask), { maxLength: 12 }),
      arbTs,
      (tasks, now) => {
      const zombies = activeZombies(tasks, now);
      const expected = tasks
        .filter((task) => task.status === "overdue" && task.deletedAt === null)
        .map((task) => task.id)
        .sort();
      expect(zombies.map((zombie) => zombie.taskId).sort()).toEqual(expected);
      expect(new Set(zombies.map((zombie) => zombie.taskId)).size).toBe(zombies.length);
    }),
  );
});

it("P12 a done task has no zombie", () => {
  check(
    fc.property(arbDoneTask, arbTs, (task, now) => {
      expect(activeZombies([task], now)).toHaveLength(0);
    }),
  );
});

it("P13 completion never lowers HP", () => {
  check(
    fc.property(arbAlivePetState, arbTaskCompletedEvent, arbTs, (state, event, now) => {
      expect(applyPetEvent(state, event, now).state.hp).toBeGreaterThanOrEqual(state.hp);
    }),
  );
});

it("P14 a second completion of the same event does not change stats", () => {
  check(
    fc.property(arbAlivePetState, arbTaskCompletedEvent, arbTs, (state, event, now) => {
      const once = applyPetEvent(state, event, now);
      const twice = applyPetEvent(once.state, event, now);
      expect(twice.state.hp).toBe(once.state.hp);
      expect(twice.state.hunger).toBe(once.state.hunger);
      expect(twice.state.mood).toBe(once.state.mood);
      expect(twice.emitted).toEqual([]);
    }),
  );
});

it("P15 zombieDamage scales linearly", () => {
  check(
    fc.property(
      fc.nat({ max: 12 }),
      fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      (count, hours) => {
        expect(zombieDamage(count, hours)).toBe(count * ZOMBIE_DRAIN_PER_HOUR * hours);
      },
    ),
  );
});

it("P16 a done task is never overdue", () => {
  check(
    fc.property(arbDoneTask, arbTs, (task, now) => {
      expect(isOverdue(task, now)).toBe(false);
    }),
  );
});

it("P18 HP stays in range across a chain of decay calls", () => {
  check(
    fc.property(
      arbAlivePetState,
      fc.array(fc.integer({ min: 0, max: 6 * HOUR }), { maxLength: 10 }),
      (state, deltas) => {
        let cursor = state.lastTickAt ?? MIN;
        let current: PetState = state;
        for (const delta of deltas) {
          cursor += delta;
          current = decayStats(current, cursor);
        }
        expect(current.hp).toBeGreaterThanOrEqual(0);
        expect(current.hp).toBeLessThanOrEqual(MAX_HP);
      },
    ),
  );
});

it("P19 decay over a split interval matches one interval within 1", () => {
  check(
    fc.property(arbAlivePetState, arbThreeOrderedTimestamps, (state, [t0, t1, t2]) => {
      const base = { ...state, lastTickAt: t0 };
      const split = decayStats(decayStats(base, t1), t2);
      const once = decayStats(base, t2);
      expect(Math.abs(split.hp - once.hp)).toBeLessThanOrEqual(1);
      expect(Math.abs(split.hunger - once.hunger)).toBeLessThanOrEqual(1);
      expect(Math.abs(split.mood - once.mood)).toBeLessThanOrEqual(1);
      expect(split.currentStreak).toBe(once.currentStreak);
    }),
  );
});

it("P21 dead and tombstone pets ignore decay", () => {
  check(
    fc.property(arbDeadOrTombstoneState, arbTs, (state, now) => {
      expect(decayStats(state, now).hp).toBe(state.hp);
      expect(decayStats(state, now)).toBe(state);
    }),
  );
});

it("P22 egg HP is immune to decay", () => {
  check(
    fc.property(arbEggState, fc.integer({ min: 1, max: 20 * 24 * HOUR }), (state, elapsed) => {
      const now = (state.lastTickAt ?? MIN) + elapsed;
      expect(decayStats(state, now).hp).toBe(state.hp);
    }),
  );
});

it("P23 decay never increases HP", () => {
  check(
    fc.property(arbAlivePetState, fc.integer({ min: 1, max: 20 * 24 * HOUR }), (state, elapsed) => {
      const now = (state.lastTickAt ?? MIN) + elapsed;
      expect(decayStats(state, now).hp).toBeLessThanOrEqual(state.hp);
    }),
  );
});

it("P24 OffsetClock is monotone", () => {
  check(
    fc.property(
      fc.integer({ min: 0, max: MAX }),
      fc.array(fc.nat({ max: HOUR }), { maxLength: 12 }),
      (base, advances) => {
        const clock = new OffsetClock(base);
        let previous = clock.now();
        for (const step of advances) {
          clock.advance(step);
          expect(clock.now()).toBeGreaterThanOrEqual(previous);
          previous = clock.now();
        }
      },
    ),
  );
});

it("P25 zero elapsed decay is an identity", () => {
  check(
    fc.property(arbAlivePetState, (state) => {
      const now = state.lastTickAt ?? MIN;
      const next = decayStats({ ...state, lastTickAt: now }, now);
      expect(next.hp).toBe(state.hp);
      expect(next.hunger).toBe(state.hunger);
      expect(next.mood).toBe(state.mood);
    }),
  );
});

it("eggs take no zombie damage", () => {
  check(
    fc.property(arbEggState, arbDrainEvent, (state, event) => {
      const result = applyPetEvent(state, event, event.toTime);
      expect(result.state.hp).toBe(state.hp);
      expect(result.state.status).toBe(state.status);
      expect(result.state.stage).toBe("egg");
    }),
  );
});

function persistPet(state: PetState): PetState {
  return petRecordFromRow({ ...petStateToRow(state), clock_offset_ms: 0, version: 1 }).state;
}

function persistTask(task: Task): Task {
  return taskFromRow(taskToRow(task));
}

it("P19b split catch-up through row serialization matches one catch-up", () => {
  check(
    fc.property(
      arbAlivePetState,
      fc.array(arbTask, { maxLength: 4 }),
      fc.integer({ min: 2, max: 6 }),
      fc.integer({ min: HOUR, max: 8 * HOUR }),
      (state, tasks, steps, span) => {
        const start = state.lastTickAt ?? MIN;
        const end = start + span;
        const once = catchUp(state, tasks, end).state;
        let current: PetState = state;
        let liveTasks = tasks;
        for (let step = 1; step <= steps; step += 1) {
          const at = step === steps ? end : start + Math.floor((span * step) / steps);
          const caught = catchUp(current, liveTasks, at);
          current = persistPet(caught.state);
          liveTasks = caught.tasks.map(persistTask);
        }
        const whole = persistPet(once);
        expect(current.status).toBe(whole.status);
        expect(current.stage).toBe(whole.stage);
        expect(current.currentStreak).toBe(whole.currentStreak);
        expect(current.diedAt).toBe(whole.diedAt);
        // Float noise from splitting the interval is far below 1, which is what
        // integer rounding on each save would throw away.
        expect(Math.abs(current.hp - whole.hp)).toBeLessThan(1e-6);
        expect(Math.abs(current.hunger - whole.hunger)).toBeLessThan(1e-6);
        expect(Math.abs(current.mood - whole.mood)).toBeLessThan(1e-6);
      },
    ),
  );
});

it("P26 hunger and mood stay in range after decay", () => {
  check(
    fc.property(arbAlivePetState, fc.integer({ min: 0, max: 30 * 24 * HOUR }), (state, elapsed) => {
      const start = state.lastTickAt ?? MIN;
      const next = decayStats(state, start + elapsed);
      expect(next.hunger).toBeGreaterThanOrEqual(0);
      expect(next.hunger).toBeLessThanOrEqual(100);
      expect(next.mood).toBeGreaterThanOrEqual(0);
      expect(next.mood).toBeLessThanOrEqual(100);
    }),
  );
});
