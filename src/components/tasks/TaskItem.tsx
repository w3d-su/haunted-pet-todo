"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useSound } from "@/components/providers/SoundProvider";
import { PixelButton } from "@/components/ui/PixelButton";
import { SubtaskList } from "@/components/tasks/SubtaskList";
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
  onBreakdown,
  onDragStart,
  onDrop,
}: {
  task: TaskView;
  pending: boolean;
  onComplete: (id: string) => void;
  onBreakdown: (id: string) => void;
  onDragStart: (id: string) => void;
  onDrop: (targetId: string) => void;
}) {
  const reduced = useReducedMotion() === true;
  const { play } = useSound();
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
              play("task_complete");
              onComplete(task.id);
            }}
          >
            Done
          </PixelButton>
        )}
      </div>
      <SubtaskList
        task={task}
        pending={pending}
        onComplete={onComplete}
        onBreakdown={onBreakdown}
      />
    </li>
  );
}
