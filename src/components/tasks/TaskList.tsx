"use client";

import { useState } from "react";
import { TaskItem } from "@/components/tasks/TaskItem";

export interface TaskView {
  id: string;
  title: string;
  status: "todo" | "done" | "overdue";
  size: "small" | "medium" | "large";
  breakdownSuggested: boolean;
  dueAt: number | null;
  deletedAt: number | null;
  sortOrder: number;
  subtasks: TaskView[];
}

export function TaskList({
  tasks,
  pending,
  onComplete,
  onReorder,
  onBreakdown,
}: {
  tasks: readonly TaskView[];
  pending: boolean;
  onComplete: (id: string) => void;
  onReorder: (orderedIds: readonly string[]) => void;
  onBreakdown: (id: string) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  function drop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const ids = tasks.map((task) => task.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = ids.slice();
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setDraggedId(null);
    onReorder(next);
  }

  if (tasks.length === 0) {
    return <p className="mt-6 text-[10px] leading-relaxed text-ghost-dim">No tasks yet. The egg is waiting.</p>;
  }

  return (
    <ul className="mt-6 flex flex-col gap-3">
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          pending={pending}
          onComplete={onComplete}
          onBreakdown={onBreakdown}
          onDragStart={setDraggedId}
          onDrop={drop}
        />
      ))}
    </ul>
  );
}
