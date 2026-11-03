import { expect, it } from "vitest";
import { buildNagPrompt, nagLevelFor } from "@/lib/ai/nag";
import type { Task } from "@/lib/game/tasks";

const NOW = Date.UTC(2026, 6, 4, 12);
const HOUR = 3_600_000;

function overdue(hours: number): Pick<Task, "status" | "dueAt" | "deletedAt" | "title"> {
  return {
    title: "Finish the report",
    status: "overdue",
    dueAt: NOW - hours * HOUR,
    deletedAt: null,
  };
}

it("picks a nag level from how long the oldest task has been overdue", () => {
  expect(nagLevelFor([overdue(0.5)], NOW)).toBe("gentle");
  expect(nagLevelFor([overdue(3)], NOW)).toBe("dramatic");
  expect(nagLevelFor([overdue(8)], NOW)).toBe("haunting");
  expect(nagLevelFor([], NOW)).toBe("gentle");
});

it("keeps every nag under 140 characters and names the task when haunting", () => {
  const tasks = [overdue(8)];
  for (const level of ["gentle", "dramatic", "haunting"] as const) {
    const line = buildNagPrompt({ stage: "adult" }, tasks, level);
    expect(line.length).toBeLessThanOrEqual(140);
    expect(line.length).toBeGreaterThan(0);
  }
  expect(buildNagPrompt({ stage: "adult" }, tasks, "haunting")).toContain("Finish the report");
  expect(buildNagPrompt({ stage: "adult" }, tasks, "haunting", "zh-TW")).toContain("Finish the report");
  expect(buildNagPrompt({ stage: "hatchling" }, tasks, "gentle", "zh-TW")).not.toBe(
    buildNagPrompt({ stage: "hatchling" }, tasks, "gentle"),
  );
  const noisy = buildNagPrompt(
    { stage: "adult" },
    [{ ...overdue(8), title: 'Say "boo"\nand leave' }],
    "haunting",
  );
  expect(noisy).not.toContain("\n");
});
