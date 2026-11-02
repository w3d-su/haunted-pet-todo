"use client";

import { useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
  onMoveUp,
  onMoveDown,
}: {
  task: TaskView;
  pending: boolean;
  onComplete: (id: string) => void;
  onBreakdown: (id: string) => void;
  onDragStart: (id: string) => void;
  onDrop: (targetId: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const reduced = useReducedMotion() === true;
  const [flash, setFlash] = useState(false);
  const done = task.status === "done";

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (pending) return;
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "ArrowUp" && onMoveUp) {
      event.preventDefault();
      onMoveUp();
    }
    if (event.key === "ArrowDown" && onMoveDown) {
      event.preventDefault();
      onMoveDown();
    }
  }

  return (
    <li
      className="relative border-2 border-ghost-dim bg-bg-panel px-3 py-3"
      draggable
      onKeyDown={onKeyDown}
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
        <div className="flex flex-wrap justify-end gap-2">
          {onMoveUp ? (
            <PixelButton
              aria-disabled={pending || undefined}
              aria-label={`Up, move ${task.title}`}
              className={pending ? "border-ghost-dim text-ghost-dim" : ""}
              onClick={() => {
                if (!pending) onMoveUp();
              }}
            >
              Up
            </PixelButton>
          ) : null}
          {onMoveDown ? (
            <PixelButton
              aria-disabled={pending || undefined}
              aria-label={`Down, move ${task.title}`}
              className={pending ? "border-ghost-dim text-ghost-dim" : ""}
              onClick={() => {
                if (!pending) onMoveDown();
              }}
            >
              Down
            </PixelButton>
          ) : null}
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
