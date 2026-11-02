"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FALLBACK_EPITAPH } from "@/lib/game/pet";
import { PixelButton } from "@/components/ui/PixelButton";

export function Tombstone({
  epitaph,
  onRebirth,
  pending,
}: {
  epitaph: string | null;
  onRebirth: () => void;
  pending: boolean;
}) {
  const reduced = useReducedMotion() === true;
  const [ready, setReady] = useState(reduced);
  const text = epitaph && epitaph.trim().length > 0 ? epitaph : FALLBACK_EPITAPH;

  useEffect(() => {
    if (reduced) {
      setReady(true);
      return;
    }
    const timer = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(timer);
  }, [reduced]);

  return (
    <motion.div
      className="tombstone-shade fixed inset-0 z-[45] flex flex-col items-center justify-center px-4"
      role="dialog"
      aria-label="Pet tombstone"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { type: "tween", duration: 0.3, ease: "easeOut" }}
    >
      <div className="relative">
        {/* Pixel sprites stay as img so the optimizer cannot resample them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="pixel-art h-32 w-24"
          src="/sprites/tombstone.png"
          alt="Tombstone for a ghost pet"
        />
      </div>
      <p className="mt-4 max-w-xs whitespace-pre-line text-center text-[8px] leading-relaxed text-bone">
        {text}
      </p>
      {ready ? (
        <PixelButton className="mt-6" disabled={pending} onClick={onRebirth}>
          New Egg
        </PixelButton>
      ) : (
        <p className="mt-6 text-[8px] leading-relaxed text-ghost-dim">The stone is settling…</p>
      )}
    </motion.div>
  );
}
