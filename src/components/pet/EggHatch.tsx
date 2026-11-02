"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";

/** Shake, then crack, then dissolve. 0.8s unless motion is reduced. */
export function EggHatch({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion() === true;

  useEffect(() => {
    const timer = window.setTimeout(onDone, reduced ? 0 : 800);
    return () => window.clearTimeout(timer);
  }, [onDone, reduced]);

  return (
    <motion.img
      className="pixel-art h-16 w-16"
      src="/sprites/egg_idle.png"
      alt="Ghost pet egg hatching"
      initial={false}
      animate={
        reduced
          ? { opacity: 0 }
          : { x: [0, -4, 4, -4, 4, 0, 0], rotate: [0, -6, 6, -6, 0, 0, 0], opacity: [1, 1, 1, 1, 1, 1, 0] }
      }
      transition={reduced ? { duration: 0 } : { duration: 0.8, ease: "linear" }}
    />
  );
}
