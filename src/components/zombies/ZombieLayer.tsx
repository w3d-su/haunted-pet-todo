"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { Task } from "@/lib/game/tasks";
import { activeZombies, type ZombieState } from "@/lib/game/zombies";
import { useGameState } from "@/components/providers/GameStateProvider";
import type { TaskView } from "@/components/tasks/TaskList";
import { ZombieSprite } from "@/components/zombies/ZombieSprite";

function asTasks(nodes: readonly TaskView[]): Task[] {
  const rows: Task[] = [];
  const walk = (list: readonly TaskView[]) => {
    for (const node of list) {
      rows.push({
        id: node.id,
        userId: "00000000-0000-4000-8000-000000000000",
        title: node.title,
        notes: null,
        category: "other",
        size: "medium",
        status: node.status,
        dueAt: node.dueAt,
        completedAt: null,
        deletedAt: node.deletedAt,
        parentId: null,
        breakdownSuggested: false,
        allSubtasksDone: false,
        sortOrder: node.sortOrder,
        createdAt: 0,
      });
      walk(node.subtasks);
    }
  };
  walk(nodes);
  return rows;
}

export function ZombieLayer() {
  const reduced = useReducedMotion() === true;
  const { tasks, now } = useGameState();
  const live = activeZombies(asTasks(tasks), now);
  const liveRef = useRef(live);
  liveRef.current = live;
  const signature = live.map((zombie) => zombie.taskId).join("|");
  const previous = useRef<ZombieState[]>([]);
  const [leaving, setLeaving] = useState<ZombieState[]>([]);

  useEffect(() => {
    const current = liveRef.current;
    const ids = new Set(current.map((zombie) => zombie.taskId));
    const gone = previous.current.filter((zombie) => !ids.has(zombie.taskId));
    previous.current = current;
    if (gone.length === 0) return;
    setLeaving((existing) => [...existing, ...gone]);
    const timer = window.setTimeout(() => {
      const goneIds = new Set(gone.map((zombie) => zombie.taskId));
      setLeaving((existing) => existing.filter((zombie) => !goneIds.has(zombie.taskId)));
    }, reduced ? 0 : 300);
    return () => window.clearTimeout(timer);
  }, [signature, reduced]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40" aria-hidden={live.length === 0}>
      {live.map((zombie) => (
        <ZombieSprite key={zombie.taskId} taskId={zombie.taskId} dissolving={false} />
      ))}
      {leaving.map((zombie) => (
        <ZombieSprite key={`${zombie.taskId}-out`} taskId={zombie.taskId} dissolving />
      ))}
    </div>
  );
}
