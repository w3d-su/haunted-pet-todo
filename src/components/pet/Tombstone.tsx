"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale } from "@/components/providers/LocaleProvider";
import { epitaphForDisplay } from "@/lib/i18n/dictionaries";
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
  const { t } = useLocale();
  const [ready, setReady] = useState(reduced);
  const text = epitaphForDisplay(epitaph, t);

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
      aria-label={t.tombstone.dialog}
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
          alt={t.tombstone.alt}
        />
      </div>
      <p className="mt-4 max-w-xs whitespace-pre-line text-center text-[8px] leading-relaxed text-bone">
        {text}
      </p>
      {ready ? (
        <PixelButton className="mt-6" disabled={pending} onClick={onRebirth}>
          {t.tombstone.newEgg}
        </PixelButton>
      ) : (
        <p className="mt-6 text-[8px] leading-relaxed text-ghost-dim">{t.tombstone.settling}</p>
      )}
    </motion.div>
  );
}
