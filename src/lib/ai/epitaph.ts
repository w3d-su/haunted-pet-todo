import { EpitaphResponseSchema } from "@/lib/ai/schemas";
import { plainEpitaph, quoteForPrompt } from "@/lib/ai/text";
import { FALLBACK_EPITAPH, type PetState } from "@/lib/game/pet";
import type { Task } from "@/lib/game/tasks";

/**
 * Prompt for a 2–4 line epitaph. Task names are quoted and stripped of
 * quotes and line breaks so they stay inside the list.
 */
export function buildEpitaphPrompt(pet: PetState, tasks: readonly Task[]): string {
  const names = tasks
    .filter((task) => task.deletedAt === null && task.status !== "done")
    .map((task) => quoteForPrompt(task.title, 80))
    .filter((name) => name.length > 0)
    .slice(0, 8);
  const list = names.length > 0 ? names.map((name) => `"${name}"`).join(", ") : "an unnamed to-do";
  return [
    "Write a 2–4 line darkly funny epitaph for a ghost pet that died because its owner never completed these tasks:",
    `${list}.`,
    "Reference the tasks by name. Keep each line under 40 characters. End with a wry pun. No profanity.",
    `The pet's last stage was ${pet.stage}.`,
    'Return JSON: { "epitaph": "line one\\nline two" }',
  ].join("\n");
}

/** Accept 2–4 non-empty lines, each at most 40 characters. */
export function normalizeEpitaph(value: string): string | null {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2 || lines.length > 4) return null;
  if (lines.some((line) => line.length > 40)) return null;
  return lines.join("\n");
}

/**
 * Model text when it validates, otherwise the fixed tombstone line.
 * `completeJson` returns null when the server has no key.
 */
export async function resolveEpitaph(
  pet: PetState,
  tasks: readonly Task[],
  completeJson: (prompt: string) => Promise<unknown | null>,
): Promise<{ epitaph: string; source: "llm" | "fallback" }> {
  const raw = await completeJson(buildEpitaphPrompt(pet, tasks));
  const epitaph =
    raw !== null && typeof raw === "object" && "epitaph" in raw && typeof raw.epitaph === "string"
      ? plainEpitaph(raw.epitaph)
      : raw;
  const parsed = EpitaphResponseSchema.safeParse(
    epitaph === raw ? raw : { epitaph },
  );
  const text = parsed.success ? normalizeEpitaph(parsed.data.epitaph) : null;
  if (!text) return { epitaph: FALLBACK_EPITAPH, source: "fallback" };
  return { epitaph: text, source: "llm" };
}
