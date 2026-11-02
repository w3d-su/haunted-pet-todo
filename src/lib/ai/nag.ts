import { quoteForPrompt } from "@/lib/ai/text";
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
): string {
  if (pet.stage === "hatchling") {
    if (level === "gentle") return "boo… 👻 one tiny task?";
    if (level === "dramatic") return "nooo… overdue bad. do thing pls 😢";
    return "nooo… finish one task so I can rest 😢";
  }
  const open = tasks.find((task) => task.deletedAt === null && task.status !== "done");
  const name = quoteForPrompt(open?.title ?? "that task", 40);
  if (level === "haunting") {
    return `The ghost of "${name}" will not rest. Do it, then I can. 💀`;
  }
  if (level === "dramatic") {
    return "WOOOO it has been HOURS and your task is still undone. Finish one 😱👻";
  }
  return "One tiny task. Just one. I believe in you 👻";
}
