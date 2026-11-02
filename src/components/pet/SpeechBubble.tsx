"use client";

import { motion, useReducedMotion } from "framer-motion";

export function SpeechBubble({ line }: { line: string | null }) {
  const reduced = useReducedMotion() === true;
  if (!line) return null;
  return (
    <motion.p
      className="mt-4 max-w-sm border-2 border-ghost-white bg-bg-panel-raised px-3 py-3 text-[10px] leading-relaxed text-ghost-white"
      role="status"
      initial={reduced ? false : { scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={reduced ? { duration: 0 } : { type: "tween", duration: 0.15, ease: "easeOut" }}
    >
      {line}
    </motion.p>
  );
}
