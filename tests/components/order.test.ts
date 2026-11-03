import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { nextMoveButtonFocus, reorderTask } from "@/components/tasks/order";

it("moves a task one step up or down", () => {
  expect(reorderTask(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
  expect(reorderTask(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  expect(reorderTask(["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"]);
  expect(reorderTask(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
});

it("refuses to move past the ends or a missing id", () => {
  expect(reorderTask(["a", "b"], "a", -1)).toBeNull();
  expect(reorderTask(["a", "b"], "b", 1)).toBeNull();
  expect(reorderTask(["a", "b"], "missing", 1)).toBeNull();
  expect(reorderTask([], "a", -1)).toBeNull();
});

it("moves the first copy when an id is listed twice", () => {
  expect(reorderTask(["a", "b", "a"], "a", 1)).toEqual(["b", "a", "a"]);
  expect(reorderTask(["a", "a", "b"], "a", 1)).toEqual(["a", "a", "b"]);
});

it("reorders a subtask list on its own, apart from the parent", () => {
  expect(reorderTask(["s1", "s2", "s3"], "s3", -1)).toEqual(["s1", "s3", "s2"]);
  expect(reorderTask(["parent"], "parent", 1)).toBeNull();
});

it("keeps move buttons focusable and ignores Alt+Arrow while a save is pending", () => {
  const source = readFileSync("src/components/tasks/TaskItem.tsx", "utf8");
  expect(source).toContain("if (pending) return");
  expect(source).toContain("aria-disabled={pending || undefined}");
  expect(source).not.toMatch(/aria-label=\{t\.task\.moveUp\(task\.title\)\}[\s\S]{0,80}disabled=\{pending\}/);
  expect(source).not.toMatch(/aria-label=\{t\.task\.moveDown\(task\.title\)\}[\s\S]{0,80}disabled=\{pending\}/);
});

it("keeps Done focusable and ignores the click while a save is pending", () => {
  const source = readFileSync("src/components/tasks/TaskItem.tsx", "utf8");
  expect(source).toContain("aria-disabled={pending || undefined}");
  expect(source).toContain("aria-label={t.task.complete(task.title)}");
  expect(source).toMatch(/aria-label=\{t\.task\.complete\(task\.title\)\}[\s\S]*if \(pending\) return;/);
  expect(source).not.toMatch(/t\.task\.complete\(task\.title\)[\s\S]{0,240}disabled=\{pending\}/);
});

it("moves focus to the other move button when the focused end disappears", () => {
  expect(nextMoveButtonFocus("up", true, false, true, true)).toBe("down");
  expect(nextMoveButtonFocus("down", true, true, true, false)).toBe("up");
  expect(nextMoveButtonFocus("up", true, true, true, true)).toBeNull();
  expect(nextMoveButtonFocus("down", true, true, true, true)).toBeNull();
  expect(nextMoveButtonFocus("up", true, true, true, false)).toBeNull();
  expect(nextMoveButtonFocus("down", true, false, true, true)).toBeNull();
  expect(nextMoveButtonFocus("up", true, false, true, false)).toBeNull();
  expect(nextMoveButtonFocus(null, true, false, true, true)).toBeNull();
  expect(nextMoveButtonFocus("up", false, false, false, true)).toBeNull();

  const source = readFileSync("src/components/tasks/TaskItem.tsx", "utf8");
  expect(source).toContain("nextMoveButtonFocus(");
  expect(source).toContain("target.focus()");
});
