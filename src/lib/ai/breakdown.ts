import { BreakdownResponseSchema, type BreakdownResponse } from "@/lib/ai/schemas";
import { plainLine, quoteForPrompt } from "@/lib/ai/text";
import { dictionaryFor } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locale";
import { isTraditionalChinese } from "@/lib/i18n/traditional";
import type { Task } from "@/lib/game/tasks";

/**
 * Prompt for 3–7 subtasks. Null notes are omitted.
 * Task text is quoted so it cannot break out of the line.
 */
export function buildBreakdownPrompt(
  task: Pick<Task, "title" | "notes" | "category">,
  locale: Locale = "en",
): string {
  return [
    "You are a helpful ghost assistant. Break this task into 3–7 concrete subtasks.",
    "Each subtask must be a single short sentence (< 80 chars) starting with a verb.",
    `Task title: "${quoteForPrompt(task.title, 120)}"`,
    task.notes ? `Additional notes: "${quoteForPrompt(task.notes, 200)}"` : "",
    `Category: ${task.category}`,
    locale === "zh-TW" ? dictionaryFor(locale).ai.language : "",
    'Return JSON: { "intro": "<ghost-voice opener, ≤ 140 chars>", "subtasks": ["...", ...] }',
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function clip(text: string): string {
  return text.length <= 80 ? text : `${text.slice(0, 77)}...`;
}

/** Three verb-led steps in the ghost's voice. Always passes the schema. */
export function fallbackBreakdown(
  task: Pick<Task, "title">,
  locale: Locale = "en",
): BreakdownResponse {
  const copy = dictionaryFor(locale).breakdown;
  const name = quoteForPrompt(task.title, 40);
  return BreakdownResponseSchema.parse({
    intro: copy.intro,
    subtasks: [clip(copy.open(name)), clip(copy.middle(name)), clip(copy.check(name))],
  });
}

function parseBreakdown(raw: unknown): BreakdownResponse | null {
  const record = raw !== null && typeof raw === "object" ? (raw as { intro?: unknown; subtasks?: unknown }) : null;
  const parsed = BreakdownResponseSchema.safeParse(
    record
      ? {
          intro: typeof record.intro === "string" ? plainLine(record.intro) : record.intro,
          subtasks: Array.isArray(record.subtasks)
            ? record.subtasks.map((item) => (typeof item === "string" ? plainLine(item) : item))
            : record.subtasks,
        }
      : raw,
  );
  return parsed.success ? parsed.data : null;
}

function breakdownIsTraditional(
  body: BreakdownResponse,
  task: Pick<Task, "title" | "notes">,
): boolean {
  return isTraditionalChinese([body.intro, ...body.subtasks].join("\n"), [
    quoteForPrompt(task.title, 120),
    quoteForPrompt(task.notes ?? "", 200),
  ]);
}

export async function resolveBreakdown(
  task: Pick<Task, "title" | "notes" | "category">,
  completeJson: (prompt: string) => Promise<unknown | null>,
  locale: Locale = "en",
): Promise<{ body: BreakdownResponse; source: "llm" | "fallback" }> {
  const attempts = locale === "zh-TW" ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const body = parseBreakdown(await completeJson(buildBreakdownPrompt(task, locale)));
    if (!body) continue;
    if (locale === "zh-TW" && !breakdownIsTraditional(body, task)) continue;
    return { body, source: "llm" };
  }
  return { body: fallbackBreakdown(task, locale), source: "fallback" };
}
