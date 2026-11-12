export const MAX_HP = 100;
export const INITIAL_HUNGER = 100;
export const INITIAL_MOOD = 100;

/** HP lost per hour with no tasks done. A full pet lasts about four idle days. */
export const DECAY_RATE_HP = 1;
/** Hunger lost per hour. */
export const DECAY_RATE_HUNGER = 2;
/** Mood lost per hour. */
export const DECAY_RATE_MOOD = 1.5;

/** HP drained per zombie per hour. */
export const ZOMBIE_DRAIN_PER_HOUR = 1;

export const EVOLVE_STREAK_THRESHOLD = 10;
export const EVOLVE_HOURS_AS_ADULT = 24;
export const ADULT_STREAK_THRESHOLD = 3;
export const ADULT_TASKS_THRESHOLD = 7;

/** Hours without a completion before the streak resets. */
export const STREAK_BREAK_HOURS = 48;

export const TASK_HUNGER_RESTORE = 20;
export const TASK_HP_RESTORE = 10;
export const TASK_MOOD_BOOST = 15;
export const OVERDUE_TASK_HUNGER_RESTORE = 10;
export const OVERDUE_TASK_HP_RESTORE = 5;

export const STREAK_BREAK_MOOD_PENALTY = 20;
