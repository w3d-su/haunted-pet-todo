import { BreakdownResponseSchema, type BreakdownResponse } from "@/lib/ai/schemas";
import { quoteForPrompt } from "@/lib/ai/text";
import type { Task } from "@/lib/game/tasks";

const FALLBACK_INTRO = "Oooh a big one 👻 Let me break this haunting task down for you…";

/**
 * Prompt for 3–7 subtasks. Null notes are omitted.
 * Task text is quoted so it cannot break out of the line.
 */
export function buildBreakdownPrompt(task: Pick<Task, "title" | "notes" | "category">): string {
  return [
    "You are a helpful ghost assistant. Break this task into 3–7 concrete subtasks.",
    "Each subtask must be a single short sentence (< 80 chars) starting with a verb.",
    `Task title: "${quoteForPrompt(task.title, 120)}"`,
    task.notes ? `Additional notes: "${quoteForPrompt(task.notes, 200)}"` : "",
    `Category: ${task.category}`,
    'Return JSON: { "intro": "<ghost-voice opener, ≤ 140 chars>", "subtasks": ["...", ...] }',
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function clip(text: string): string {
  return text.length <= 80 ? text : `${text.slice(0, 77)}...`;
}

/** Three verb-led steps in the ghost's voice. Always passes the schema. */
export function fallbackBreakdown(task: Pick<Task, "title">): BreakdownResponse {
  const name = quoteForPrompt(task.title, 40);
  return BreakdownResponseSchema.parse({
    intro: FALLBACK_INTRO,
    subtasks: [
      clip(`Open ${name} and write the first step`),
      clip(`Do the middle piece of ${name}`),
      clip(`Check ${name} and mark it done`),
    ],
  });
}

export async function resolveBreakdown(
  task: Pick<Task, "title" | "notes" | "category">,
  completeJson: (prompt: string) => Promise<unknown | null>,
): Promise<{ body: BreakdownResponse; source: "llm" | "fallback" }> {
  const raw = await completeJson(buildBreakdownPrompt(task));
  const parsed = BreakdownResponseSchema.safeParse(raw);
  if (!parsed.success) return { body: fallbackBreakdown(task), source: "fallback" };
  return { body: parsed.data, source: "llm" };
}
