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
