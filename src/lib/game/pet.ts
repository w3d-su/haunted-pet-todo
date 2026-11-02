import {
  ADULT_STREAK_THRESHOLD,
  ADULT_TASKS_THRESHOLD,
  INITIAL_HUNGER,
  INITIAL_MOOD,
  MAX_HP,
} from "./constants";
import { decayStats } from "./decay";
import type { GameEvent } from "./events";
import { calendarDay, canEvolve, resolveEvolvedForm } from "./evolution";
import { markNewlyOverdue, taskCompletionDeltas, type Task } from "./tasks";
import { zombieDamage } from "./zombies";

export const PET_STAGES = [
  "egg",
  "hatchling",
  "adult",
  "adult_night_owl",
  "adult_early_bird",
  "adult_scholar",
  "adult_haunter",
] as const;

export const PET_STATUSES = ["alive", "dead", "tombstone"] as const;

export const EVOLVED_ADULT_STAGES = [
  "adult_night_owl",
  "adult_early_bird",
  "adult_scholar",
  "adult_haunter",
] as const;

export type PetStage = (typeof PET_STAGES)[number];
export type PetStatus = (typeof PET_STATUSES)[number];
export type EvolvedAdultStage = (typeof EVOLVED_ADULT_STAGES)[number];

export interface TombstoneRecord {
  readonly id: string;
  /** Unix ms. */
  readonly diedAt: number;
  readonly stage: PetStage;
  readonly finalHp: number;
  readonly finalHunger: number;
  readonly finalMood: number;
  readonly tasksCompletedTotal: number;
  readonly epitaph: string;
  /** IDs of overdue tasks that contributed to the death. */
  readonly overdueTaskIds: readonly string[];
}

export interface PetState {
  /** Stable across rebirths of the same user. Caller-supplied; never random inside the reducer. */
  readonly id: string;
  readonly userId: string;
  /** IANA zone used for evolution hours and streak calendar days. */
  readonly timeZone: string;
  readonly stage: PetStage;
  readonly status: PetStatus;
  /** Inclusive range [0, MAX_HP]. */
  readonly hp: number;
  /** Inclusive range [0, 100]. */
  readonly hunger: number;
  /** Inclusive range [0, 100]. */
  readonly mood: number;
  readonly currentStreak: number;
  readonly tasksCompletedTotal: number;
  /** Unix ms of the last task completion. */
  readonly lastCompletionAt: number | null;
  /** Calendar day `YYYY-MM-DD` in `timeZone`. */
  readonly lastCompletionDay: string | null;
  /** Unix ms when the pet reached `adult`. */
  readonly becameAdultAt: number | null;
  readonly hoursAsAdult: number;
  /** Newest first, capped at 10. */
  readonly recentCompletionTimestamps: readonly number[];
  /** Parallel to `recentCompletionTimestamps`. */
  readonly recentCompletionCategories: readonly string[];
  readonly currentEpitaph: string | null;
  readonly graveyard: readonly TombstoneRecord[];
  /** Unix ms of the last processed tick. */
  readonly lastTickAt: number | null;
}

export interface PetReduction {
  readonly state: PetState;
  readonly emitted: readonly GameEvent[];
}

const FALLBACK_EPITAPH = "Here lies a to-do list. It never stood a chance.";

export function clampHp(value: number): number {
  return Math.min(MAX_HP, Math.max(0, value));
}

export function clampHunger(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function clampMood(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function clampStats(state: PetState): PetState {
  const hp = clampHp(state.hp);
  const hunger = clampHunger(state.hunger);
  const mood = clampMood(state.mood);
  if (hp === state.hp && hunger === state.hunger && mood === state.mood) return state;
  return { ...state, hp, hunger, mood };
}

/** Fresh pet. `id` is supplied by the caller so this function stays deterministic. */
export function initialPetState(
  userId: string,
  now: number,
  id: string,
  timeZone: string,
): PetState {
  return {
    id,
    userId,
    timeZone,
    stage: "egg",
    status: "alive",
    hp: MAX_HP,
    hunger: INITIAL_HUNGER,
    mood: INITIAL_MOOD,
    currentStreak: 0,
    tasksCompletedTotal: 0,
    lastCompletionAt: null,
    lastCompletionDay: null,
    becameAdultAt: null,
    hoursAsAdult: 0,
    recentCompletionTimestamps: [],
    recentCompletionCategories: [],
    currentEpitaph: null,
    graveyard: [],
    lastTickAt: now,
  };
}

/**
 * Rebirth is legal only from `tombstone`. The new graveyard row uses
 * `tombstoneId` so two calls with the same inputs match (property P9).
 */
export function rebirthPet(state: PetState, now: number, tombstoneId: string): PetState {
  if (state.status !== "tombstone") return state;
  const record: TombstoneRecord = {
    id: tombstoneId,
    diedAt: state.lastTickAt ?? now,
    stage: state.stage,
    finalHp: state.hp,
    finalHunger: state.hunger,
    finalMood: state.mood,
    tasksCompletedTotal: state.tasksCompletedTotal,
    epitaph: state.currentEpitaph ?? FALLBACK_EPITAPH,
    overdueTaskIds: [],
  };
  return {
    ...initialPetState(state.userId, now, state.id, state.timeZone),
    graveyard: [...state.graveyard, record],
  };
}

function unchanged(state: PetState): PetReduction {
  return { state, emitted: [] };
}

function withoutGraveyard(state: PetState): Omit<PetState, "graveyard"> {
  const { graveyard, ...rest } = state;
  void graveyard;
  return rest;
}

/**
 * Pure reducer. Does not mutate `state` and does not read the wall clock.
 * Consequence events (`PET_HATCHED`, `PET_EVOLVED`, `PET_DIED`, `STREAK_BROKEN`, …)
 * are returned in `emitted`. Evolution is decided here, not by the client.
 */
export function applyPetEvent(state: PetState, event: GameEvent, now: number): PetReduction {
  if (
    state.status === "tombstone" &&
    event.type !== "REBIRTH" &&
    event.type !== "EPITAPH_READY"
  ) {
    return unchanged(state);
  }

  if (state.status === "dead" && event.type !== "EPITAPH_READY") {
    return unchanged(state);
  }

  switch (event.type) {
    case "TASK_COMPLETED":
      return applyTaskCompleted(state, event, now);
    case "DECAY_TICK":
      return applyDecayTick(state, event);
    case "ZOMBIE_DRAIN":
      return applyZombieDrain(state, event);
    case "EPITAPH_READY":
      return applyEpitaphReady(state, event);
    case "REBIRTH":
      return unchanged(rebirthPet(state, now, event.tombstoneId));
    default:
      return unchanged(state);
  }
}

export function applyTaskCompleted(
  state: PetState,
  event: Extract<GameEvent, { type: "TASK_COMPLETED" }>,
  now: number,
): PetReduction {
  if (
    state.lastCompletionAt === event.completedAt &&
    state.recentCompletionTimestamps[0] === event.completedAt &&
    state.recentCompletionCategories[0] === event.category
  ) {
    return unchanged(state);
  }

  const deltas = taskCompletionDeltas({
    status: event.wasOverdue ? "overdue" : "todo",
  });
  const day = calendarDay(event.completedAt, state.timeZone);
  const currentStreak =
    state.lastCompletionDay === day ? state.currentStreak : state.currentStreak + 1;

  let next: PetState = {
    ...state,
    hp: clampHp(state.hp + deltas.hpRestore),
    hunger: clampHunger(state.hunger + deltas.hungerRestore),
    mood: clampMood(state.mood + deltas.moodBoost),
    tasksCompletedTotal: state.tasksCompletedTotal + 1,
    currentStreak,
    lastCompletionAt: event.completedAt,
    lastCompletionDay: day,
    recentCompletionTimestamps: [event.completedAt, ...state.recentCompletionTimestamps].slice(
      0,
      10,
    ),
    recentCompletionCategories: [event.category, ...state.recentCompletionCategories].slice(0, 10),
  };

  const emitted: GameEvent[] = [];

  if (next.stage === "egg") {
    next = { ...next, stage: "hatchling" };
    emitted.push({ type: "PET_HATCHED" });
  }

  if (
    next.stage === "hatchling" &&
    next.tasksCompletedTotal >= ADULT_TASKS_THRESHOLD &&
    next.currentStreak >= ADULT_STREAK_THRESHOLD
  ) {
    next = { ...next, stage: "adult", becameAdultAt: now, hoursAsAdult: 0 };
    emitted.push({ type: "PET_GREW_UP" });
  }

  if (canEvolve(next, now)) {
    const newStage = resolveEvolvedForm(next);
    const hoursAsAdult =
      next.becameAdultAt !== null ? (now - next.becameAdultAt) / 3_600_000 : next.hoursAsAdult;
    next = { ...next, stage: newStage, hoursAsAdult };
    emitted.push({ type: "PET_EVOLVED", newStage });
  }

  return { state: next, emitted };
}

export function applyDecayTick(
  state: PetState,
  event: Extract<GameEvent, { type: "DECAY_TICK" }>,
): PetReduction {
  const decayed = decayStats(state, event.toTime);
  if (decayed === state) return unchanged(state);

  const emitted: GameEvent[] = [];
  if (state.currentStreak > 0 && decayed.currentStreak === 0) {
    emitted.push({ type: "STREAK_BROKEN" });
  }
  if (state.status === "alive" && decayed.hp === 0) {
    const next = { ...decayed, status: "dead" as const };
    emitted.push({ type: "PET_DIED", finalState: withoutGraveyard(next) });
    return { state: next, emitted };
  }
  return { state: decayed, emitted };
}

export function applyZombieDrain(
  state: PetState,
  event: Extract<GameEvent, { type: "ZOMBIE_DRAIN" }>,
): PetReduction {
  if (state.status !== "alive") return unchanged(state);
  const hours = Math.max(0, (event.toTime - event.fromTime) / 3_600_000);
  const damage = zombieDamage(event.zombieCount, hours);
  if (damage === 0) return unchanged(state);

  const hp = clampHp(state.hp - damage);
  const next: PetState = {
    ...state,
    hp,
    status: hp === 0 ? "dead" : state.status,
  };
  const emitted: GameEvent[] = [];
  if (state.status === "alive" && next.status === "dead") {
    emitted.push({ type: "PET_DIED", finalState: withoutGraveyard(next) });
  }
  return { state: next, emitted };
}

function applyEpitaphReady(
  state: PetState,
  event: Extract<GameEvent, { type: "EPITAPH_READY" }>,
): PetReduction {
  if (state.status !== "dead") return unchanged(state);
  return {
    state: { ...state, status: "tombstone", currentEpitaph: event.epitaph },
    emitted: [],
  };
}

export interface CatchUp {
  readonly state: PetState;
  readonly tasks: readonly Task[];
  readonly emitted: readonly GameEvent[];
  readonly overdueTaskIds: readonly string[];
}

/**
 * One catch-up step from `lastTickAt` to `now`: mark newly overdue tasks,
 * decay once for the whole gap, then drain each zombie only for the hours
 * it was actually overdue. Read/write paths call this so a daily cron is
 * only a backstop.
 */
export function catchUp(pet: PetState, tasks: readonly Task[], now: number): CatchUp {
  const from = pet.lastTickAt ?? now;
  const marked = markNewlyOverdue(tasks, now);
  const decayed = applyPetEvent(pet, { type: "DECAY_TICK", fromTime: from, toTime: now }, now);

  let state = decayed.state;
  const emitted: GameEvent[] = [...decayed.emitted];

  if (state.status === "alive" && now > from) {
    for (const task of marked.tasks) {
      if (task.status !== "overdue" || task.deletedAt !== null || task.dueAt === null) continue;
      const drainFrom = Math.max(from, task.dueAt);
      if (drainFrom >= now) continue;
      const drained = applyPetEvent(
        state,
        { type: "ZOMBIE_DRAIN", zombieCount: 1, fromTime: drainFrom, toTime: now },
        now,
      );
      state = drained.state;
      emitted.push(...drained.emitted);
      if (state.status !== "alive") break;
    }
  }

  if (state !== pet && state.becameAdultAt !== null) {
    const hoursAsAdult = Math.max(0, (now - state.becameAdultAt) / 3_600_000);
    if (hoursAsAdult !== state.hoursAsAdult) {
      state = { ...state, hoursAsAdult };
    }
  }

  return {
    state,
    tasks: marked.overdueTaskIds.length === 0 ? tasks : marked.tasks,
    emitted,
    overdueTaskIds: marked.overdueTaskIds,
  };
}
