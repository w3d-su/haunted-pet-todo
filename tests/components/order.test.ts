import { expect, it } from "vitest";
import { reorderTask } from "@/components/tasks/order";

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
