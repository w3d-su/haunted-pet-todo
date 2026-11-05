import { quoteForPrompt } from "@/lib/ai/text";
import { dictionaryFor } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locale";
import type { PetStage } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";

export const NAG_LEVELS = ["gentle", "dramatic", "haunting"] as const;
export type NagLevel = (typeof NAG_LEVELS)[number];

const HOUR_MS = 3_600_000;

/**
 * gentle under 1h overdue, dramatic from 1h to 6h, haunting after that.
 * No overdue task stays gentle.
 */
export function nagLevelFor(
  tasks: readonly Pick<Task, "status" | "dueAt" | "deletedAt">[],
  now: number,
): NagLevel {
  let oldest: number | null = null;
  for (const task of tasks) {
    if (task.status !== "overdue" || task.deletedAt !== null || task.dueAt === null) continue;
    if (oldest === null || task.dueAt < oldest) oldest = task.dueAt;
  }
  if (oldest === null) return "gentle";
  const hours = (now - oldest) / HOUR_MS;
  if (hours > 6) return "haunting";
  if (hours >= 1) return "dramatic";
  return "gentle";
}

/**
 * The nag line the cron sends. It is deterministic so a missing model key
 * cannot skip the reminder. One line, under 140 characters, with a next step.
 */
export function buildNagPrompt(
  pet: { stage: PetStage },
  tasks: readonly Pick<Task, "title" | "status" | "deletedAt">[],
  level: NagLevel,
  locale: Locale = "en",
): string {
  const nag = dictionaryFor(locale).nag;
  if (pet.stage === "hatchling") return nag.hatchling[level];
  const open = tasks.find((task) => task.deletedAt === null && task.status !== "done");
  const name = quoteForPrompt(open?.title ?? "that task", 40);
  if (level === "haunting") return nag.adult.haunting(name);
  return nag.adult[level];
}
