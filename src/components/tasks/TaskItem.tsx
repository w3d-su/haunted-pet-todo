"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale } from "@/components/providers/LocaleProvider";
import { PixelButton } from "@/components/ui/PixelButton";
import { SubtaskList } from "@/components/tasks/SubtaskList";
import type { TaskView } from "@/components/tasks/TaskList";
import { nextMoveButtonFocus, type MoveButton } from "@/components/tasks/order";

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
  const { t } = useLocale();
  const [flash, setFlash] = useState(false);
  const done = task.status === "done";
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const focusedMove = useRef<MoveButton | null>(null);
  const hadUp = useRef(false);
  const hadDown = useRef(false);
  const hasUp = onMoveUp !== undefined;
  const hasDown = onMoveDown !== undefined;

  useLayoutEffect(() => {
    const next = nextMoveButtonFocus(focusedMove.current, hadUp.current, hasUp, hadDown.current, hasDown);
    const target = next === "up" ? upRef.current : next === "down" ? downRef.current : null;
    if (next && target) {
      target.focus();
      focusedMove.current = next;
    }
    hadUp.current = hasUp;
    hadDown.current = hasDown;
  }, [hasUp, hasDown]);

  function rememberMove(which: MoveButton) {
    focusedMove.current = which;
  }

  function forgetMove(which: MoveButton) {
    // Blur from unmount runs before the layout effect. Clearing now would drop the button it replaces.
    queueMicrotask(() => {
      if (focusedMove.current !== which) return;
      const button = which === "up" ? upRef.current : downRef.current;
      if (!button?.isConnected) return;
      if (document.activeElement !== button) focusedMove.current = null;
    });
  }

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
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] leading-relaxed text-ghost-white [overflow-wrap:anywhere] ${done ? "line-through" : ""}`}>
            {task.title}
          </p>
          <p className={`mt-2 text-[8px] uppercase leading-relaxed ${badge[task.status]}`}>
            {t.status[task.status]}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {onMoveUp ? (
            <PixelButton
              ref={upRef}
              aria-disabled={pending || undefined}
              aria-label={t.task.moveUp(task.title)}
              className={pending ? "border-ghost-dim text-ghost-dim" : ""}
              onFocus={() => rememberMove("up")}
              onBlur={() => forgetMove("up")}
              onClick={() => {
                rememberMove("up");
                if (!pending) onMoveUp();
              }}
            >
              {t.task.up}
            </PixelButton>
          ) : null}
          {onMoveDown ? (
            <PixelButton
              ref={downRef}
              aria-disabled={pending || undefined}
              aria-label={t.task.moveDown(task.title)}
              className={pending ? "border-ghost-dim text-ghost-dim" : ""}
              onFocus={() => rememberMove("down")}
              onBlur={() => forgetMove("down")}
              onClick={() => {
                rememberMove("down");
                if (!pending) onMoveDown();
              }}
            >
              {t.task.down}
            </PixelButton>
          ) : null}
          {done ? null : (
            <PixelButton
              aria-disabled={pending || undefined}
              aria-label={t.task.complete(task.title)}
              className={pending ? "border-ghost-dim text-ghost-dim" : ""}
              onClick={() => {
                if (pending) return;
                setFlash(true);
                window.setTimeout(() => setFlash(false), reduced ? 0 : 160);
                onComplete(task.id);
              }}
            >
              {t.task.done}
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
