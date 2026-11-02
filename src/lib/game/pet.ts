import {
  ADULT_STREAK_THRESHOLD,
  ADULT_TASKS_THRESHOLD,
  DECAY_RATE_HP,
  INITIAL_HUNGER,
  INITIAL_MOOD,
  MAX_HP,
  ZOMBIE_DRAIN_PER_HOUR,
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
  /** Unix ms when HP reached 0. Null while the pet is alive. */
  readonly diedAt: number | null;
}

export interface PetReduction {
  readonly state: PetState;
  readonly emitted: readonly GameEvent[];
}

export const FALLBACK_EPITAPH = "Here lies a to-do list. It never stood a chance.";
const HOUR_MS = 3_600_000;

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
    diedAt: null,
  };
}

/**
 * Rebirth is legal from `dead` or `tombstone`. The graveyard id is
 * `tombstoneId` so two calls with the same inputs match (property P9).
 * `diedAt` is when HP reached 0, not when a later read noticed it.
 */
export function rebirthPet(state: PetState, now: number, tombstoneId: string): PetState {
  if (state.status !== "tombstone" && state.status !== "dead") return state;
  const record: TombstoneRecord = {
    id: tombstoneId,
    diedAt: state.diedAt ?? state.lastTickAt ?? now,
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

  if (state.status === "dead" && event.type !== "EPITAPH_READY" && event.type !== "REBIRTH") {
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

/** When HP hits 0 during [from, to] at a constant hourly rate. Rounded to a millisecond. */
export function hpReachedZeroAt(
  from: number,
  to: number,
  startHp: number,
  ratePerHour: number,
): number {
  if (startHp <= 0 || ratePerHour <= 0) return from;
  const at = from + (startHp / ratePerHour) * HOUR_MS;
  return Math.round(Math.min(to, Math.max(from, at)));
}

function markDead(state: PetState, diedAt: number): PetState {
  return {
    ...state,
    hp: 0,
    status: "dead",
    diedAt: state.diedAt ?? diedAt,
    currentEpitaph: state.currentEpitaph ?? FALLBACK_EPITAPH,
  };
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
    const from = state.lastTickAt ?? event.toTime;
    const rate = state.stage === "egg" ? 0 : DECAY_RATE_HP;
    const next = markDead(decayed, hpReachedZeroAt(from, event.toTime, state.hp, rate));
    emitted.push({ type: "PET_DIED", finalState: withoutGraveyard(next) });
    return { state: next, emitted };
  }
  return { state: decayed, emitted };
}

export function applyZombieDrain(
  state: PetState,
  event: Extract<GameEvent, { type: "ZOMBIE_DRAIN" }>,
): PetReduction {
  if (state.status !== "alive" || state.stage === "egg") return unchanged(state);
  const hours = Math.max(0, (event.toTime - event.fromTime) / HOUR_MS);
  const damage = zombieDamage(event.zombieCount, hours);
  if (damage === 0) return unchanged(state);

  const hp = clampHp(state.hp - damage);
  if (hp > 0) return { state: { ...state, hp }, emitted: [] };
  const rate = event.zombieCount * ZOMBIE_DRAIN_PER_HOUR;
  const next = markDead(
    { ...state, hp: 0 },
    hpReachedZeroAt(event.fromTime, event.toTime, state.hp, rate),
  );
  return { state: next, emitted: [{ type: "PET_DIED", finalState: withoutGraveyard(next) }] };
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
function zombiesAt(tasks: readonly Task[], at: number): number {
  let count = 0;
  for (const task of tasks) {
    if (task.status !== "overdue" || task.deletedAt !== null || task.dueAt === null) continue;
    if (task.dueAt <= at) count += 1;
  }
  return count;
}

/**
 * One segment where decay and zombie pressure are constant.
 * Stats stop at the instant HP hits 0 so a later split of the same
 * interval matches one pass (property P19b).
 */
function applySegment(state: PetState, from: number, to: number, zombies: number): PetReduction {
  if (state.status !== "alive" || to <= from) return unchanged(state);
  const hours = (to - from) / HOUR_MS;
  const hpRate = state.stage === "egg" ? 0 : DECAY_RATE_HP + zombies * ZOMBIE_DRAIN_PER_HOUR;
  const dies = hpRate > 0 && state.hp <= hpRate * hours;
  const effectUntil = dies ? hpReachedZeroAt(from, to, state.hp, hpRate) : to;
  const decayed = decayStats({ ...state, lastTickAt: from }, effectUntil);
  const emitted: GameEvent[] = [];
  if (state.currentStreak > 0 && decayed.currentStreak === 0) {
    emitted.push({ type: "STREAK_BROKEN" });
  }
  const hp = dies ? 0 : clampHp(state.hp - hpRate * hours);
  let next: PetState = { ...decayed, hp, lastTickAt: to };
  if (dies) {
    next = markDead(next, effectUntil);
    emitted.push({ type: "PET_DIED", finalState: withoutGraveyard(next) });
  }
  return { state: next, emitted };
}

export function catchUp(pet: PetState, tasks: readonly Task[], now: number): CatchUp {
  const from = pet.lastTickAt ?? now;
  const marked = markNewlyOverdue(tasks, now);
  const taskList = marked.overdueTaskIds.length === 0 ? tasks : marked.tasks;

  if (now <= from) {
    return { state: pet, tasks: taskList, emitted: [], overdueTaskIds: marked.overdueTaskIds };
  }

  if (pet.status !== "alive") {
    const state = (pet.lastTickAt ?? from) < now ? { ...pet, lastTickAt: now } : pet;
    return { state, tasks: taskList, emitted: [], overdueTaskIds: marked.overdueTaskIds };
  }

  const points = new Set<number>([from, now]);
  if (pet.stage !== "egg") {
    for (const task of taskList) {
      if (task.status !== "overdue" || task.deletedAt !== null || task.dueAt === null) continue;
      if (task.dueAt > from && task.dueAt < now) points.add(task.dueAt);
    }
  }
  const ordered = [...points].sort((left, right) => left - right);

  let state = pet;
  const emitted: GameEvent[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const segFrom = ordered[index] ?? from;
    const segTo = ordered[index + 1] ?? now;
    if (state.status !== "alive") break;
    const zombies = state.stage === "egg" ? 0 : zombiesAt(taskList, segFrom);
    const step = applySegment(state, segFrom, segTo, zombies);
    state = step.state;
    emitted.push(...step.emitted);
  }

  if (state.status !== "alive" && (state.lastTickAt ?? from) < now) {
    state = { ...state, lastTickAt: now };
  }

  if (state.becameAdultAt !== null) {
    const hoursAsAdult = Math.max(0, (now - state.becameAdultAt) / HOUR_MS);
    if (hoursAsAdult !== state.hoursAsAdult) state = { ...state, hoursAsAdult };
  }

  return { state, tasks: taskList, emitted, overdueTaskIds: marked.overdueTaskIds };
}
