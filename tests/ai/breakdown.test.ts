import { expect, it } from "vitest";
import { buildBreakdownPrompt, fallbackBreakdown } from "@/lib/ai/breakdown";
import { BreakdownResponseSchema } from "@/lib/ai/schemas";
import type { Task } from "@/lib/game/tasks";

function task(notes: string | null): Task {
  return {
    id: crypto.randomUUID(),
    userId: "11111111-1111-4111-8111-111111111111",
    title: "Write research paper",
    notes,
    category: "study",
    size: "large",
    status: "todo",
    dueAt: null,
    completedAt: null,
    deletedAt: null,
    parentId: null,
    breakdownSuggested: false,
    allSubtasksDone: false,
    sortOrder: 1,
    createdAt: Date.UTC(2026, 6, 4),
  };
}

it("includes the title and omits null notes", () => {
  const withNotes = buildBreakdownPrompt(task("Use the library"));
  expect(withNotes).toContain("Write research paper");
  expect(withNotes).toContain("Use the library");
  const without = buildBreakdownPrompt(task(null));
  expect(without).toContain("Write research paper");
  expect(without).not.toContain("Additional notes");
});

it("rejects fewer than 3 or more than 7 subtasks", () => {
  const intro = "Oooh a big one";
  expect(BreakdownResponseSchema.safeParse({ intro, subtasks: ["Open it", "Do it"] }).success).toBe(
    false,
  );
  expect(
    BreakdownResponseSchema.safeParse({
      intro,
      subtasks: ["1", "2", "3", "4", "5", "6", "7", "8"],
    }).success,
  ).toBe(false);
  expect(
    BreakdownResponseSchema.safeParse({
      intro,
      subtasks: ["a".repeat(81), "Do the middle", "Check it"],
    }).success,
  ).toBe(false);
  expect(
    BreakdownResponseSchema.safeParse({
      intro: "x".repeat(141),
      subtasks: ["Open it", "Do the middle", "Check it"],
    }).success,
  ).toBe(false);
});

it("builds a fallback the schema accepts", () => {
  const body = fallbackBreakdown(task(null));
  expect(body.subtasks.length).toBeGreaterThanOrEqual(3);
  expect(body.subtasks.length).toBeLessThanOrEqual(7);
  expect(body.intro.length).toBeLessThanOrEqual(140);
  expect(body.subtasks.every((line) => line.length <= 80)).toBe(true);
});
