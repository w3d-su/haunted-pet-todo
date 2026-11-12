"use client";

import { useLocale } from "@/components/providers/LocaleProvider";
import { PixelButton } from "@/components/ui/PixelButton";
import type { TaskView } from "@/components/tasks/TaskList";

export function SubtaskList({
  task,
  pending,
  onComplete,
  onDelete,
  onBreakdown,
}: {
  task: TaskView;
  pending: boolean;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onBreakdown: (id: string) => void;
}) {
  const { t } = useLocale();
  const offer = task.size === "large" && !task.breakdownSuggested && task.status !== "done";
  if (!offer && task.subtasks.length === 0) return null;

  return (
    <div className="mt-3">
      {offer ? (
        <PixelButton disabled={pending} onClick={() => onBreakdown(task.id)}>
          {t.task.breakDown}
        </PixelButton>
      ) : null}
      {task.subtasks.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2 pl-3">
          {task.subtasks.map((subtask) => {
            const done = subtask.status === "done";
            return (
              <li key={subtask.id} className="flex items-start gap-2 text-[8px] leading-relaxed text-ghost-dim">
                <input
                  type="checkbox"
                  checked={done}
                  disabled={done || pending}
                  aria-label={t.task.complete(subtask.title)}
                  className="mt-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-pumpkin)]"
                  onChange={() => onComplete(subtask.id)}
                />
                <span className={`min-w-0 flex-1 [overflow-wrap:anywhere] ${done ? "line-through" : ""}`}>
                  {subtask.title}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={t.task.remove(subtask.title)}
                  className="px-1 uppercase text-ghost-dim hover:text-blood-text disabled:text-ghost-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-pumpkin)]"
                  onClick={() => onDelete(subtask.id)}
                >
                  {t.task.delete}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
