"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const FRAMES = [
  "/sprites/zombie_walk_0.png",
  "/sprites/zombie_walk_1.png",
  "/sprites/zombie_walk_2.png",
];

function lane(taskId: string): number {
  let hash = 0;
  for (const char of taskId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 70 + (hash % 26);
}

export function ZombieSprite({
  taskId,
  dissolving,
}: {
  taskId: string;
  dissolving: boolean;
}) {
  const reduced = useReducedMotion() === true;
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % FRAMES.length);
    }, 180);
    return () => window.clearInterval(timer);
  }, [reduced]);

  return (
    <motion.div
      className="absolute right-0"
      style={{ top: `${lane(taskId)}%` }}
      initial={reduced ? false : { x: 64, opacity: 0 }}
      animate={{ x: 0, opacity: dissolving ? 0 : 1 }}
      transition={
        reduced
          ? { duration: 0 }
          : { type: "tween", duration: dissolving ? 0.3 : 0.3, ease: "easeOut" }
      }
    >
      {/* Pixel sprites stay as img so the optimizer cannot resample them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={`pixel-art h-12 w-12 ${reduced ? "" : "zombie-march"}`}
        src={FRAMES[frame]}
        alt="Zombie haunting an overdue task"
        data-task-id={taskId}
      />
    </motion.div>
  );
}
