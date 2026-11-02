"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PixelButton } from "@/components/ui/PixelButton";
import type { TaskView } from "@/components/tasks/TaskList";

const badge: Record<TaskView["status"], string> = {
  todo: "text-ghost-dim",
  done: "text-slime",
  overdue: "text-blood",
};

export function TaskItem({
  task,
  pending,
  onComplete,
  onDragStart,
  onDrop,
}: {
  task: TaskView;
  pending: boolean;
  onComplete: (id: string) => void;
  onDragStart: (id: string) => void;
  onDrop: (targetId: string) => void;
}) {
  const reduced = useReducedMotion() === true;
  const [flash, setFlash] = useState(false);
  const done = task.status === "done";

  return (
    <li
      className="relative border-2 border-ghost-dim bg-bg-panel px-3 py-3"
      draggable
      onDragStart={() => onDragStart(task.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(task.id)}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-slime"
        initial={false}
        animate={{ opacity: flash && !reduced ? [0, 0.45, 0] : 0 }}
        transition={reduced ? { duration: 0 } : { type: "tween", duration: 0.15, ease: "easeOut" }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className={`text-[10px] leading-relaxed text-ghost-white ${done ? "line-through" : ""}`}>
            {task.title}
          </p>
          <p className={`mt-2 text-[8px] uppercase leading-relaxed ${badge[task.status]}`}>
            {task.status}
          </p>
        </div>
        {done ? null : (
          <PixelButton
            disabled={pending}
            aria-label={`Complete ${task.title}`}
            onClick={() => {
              setFlash(true);
              window.setTimeout(() => setFlash(false), reduced ? 0 : 160);
              onComplete(task.id);
            }}
          >
            Done
          </PixelButton>
        )}
      </div>
      {task.subtasks.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2 pl-3">
          {task.subtasks.map((subtask) => (
            <li key={subtask.id} className="text-[8px] leading-relaxed text-ghost-dim">
              {subtask.title} ({subtask.status})
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
