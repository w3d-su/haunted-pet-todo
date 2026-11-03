/** Move `id` one step. Returns null at the ends or when the id is missing. */
export function reorderTask(
  ids: readonly string[],
  id: string,
  direction: -1 | 1,
): string[] | null {
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = ids.slice();
  const moved = next[from];
  if (!moved) return null;
  next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export type MoveButton = "up" | "down";

/**
 * Focus target when the focused move button unmounts because the task hit an end.
 * Returns null when that button is still mounted, was not focused, or has no sibling.
 */
export function nextMoveButtonFocus(
  focused: MoveButton | null,
  hadUp: boolean,
  hasUp: boolean,
  hadDown: boolean,
  hasDown: boolean,
): MoveButton | null {
  if (focused === "up" && hadUp && !hasUp && hasDown) return "down";
  if (focused === "down" && hadDown && !hasDown && hasUp) return "up";
  return null;
}
