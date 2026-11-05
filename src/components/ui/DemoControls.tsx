"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale } from "@/components/providers/LocaleProvider";
import { gameRequest } from "@/components/providers/game-request";
import { PixelButton } from "@/components/ui/PixelButton";

const ACTION_BODIES = [
  { key: "1", body: { hours: 1 } },
  { key: "6", body: { hours: 6 } },
  { key: "24", body: { hours: 24 } },
  { key: "reset", body: { reset: true } },
] as const;

export function DemoControls({
  clockOffsetMs,
  onRefresh,
}: {
  clockOffsetMs: number;
  onRefresh: () => Promise<void>;
}) {
  const reduced = useReducedMotion() === true;
  const { t } = useLocale();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const seenOffset = useRef<number | null>(null);
  const hours = Math.round(clockOffsetMs / 3_600_000);

  useEffect(() => {
    if (seenOffset.current === null) {
      seenOffset.current = clockOffsetMs;
      return;
    }
    if (seenOffset.current === clockOffsetMs) return;
    seenOffset.current = clockOffsetMs;
    setAnnouncement(t.demo.announcement(hours));
  }, [clockOffsetMs, hours, t]);

  async function go(key: string, body: { hours: 1 | 6 | 24 } | { reset: true }) {
    setPending(key);
    setError(null);
    try {
      const response = await gameRequest("/api/demo/fast-forward", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError("refused");
        return;
      }
      await onRefresh();
    } catch {
      setError("refused");
    } finally {
      setPending(null);
    }
  }

  return (
    <motion.section
      aria-label={t.demo.label}
      className="mt-6 border-2 border-ghost-dim bg-bg-panel-raised p-3"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduced ? { duration: 0 } : { type: "tween", duration: 0.15, ease: "easeOut" }}
    >
      <p className="text-[8px] leading-relaxed text-ghost-dim">{t.demo.label}</p>
      <p className="mt-2 text-[10px] leading-relaxed text-ghost-white">
        {pending ? t.app.listening : t.demo.offset(hours)}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ACTION_BODIES.map((action) => {
          const label =
            action.key === "1"
              ? t.demo.plus1
              : action.key === "6"
                ? t.demo.plus6
                : action.key === "24"
                  ? t.demo.plus24
                  : t.demo.reset;
          const name =
            action.key === "1"
              ? t.demo.plus1Name
              : action.key === "6"
                ? t.demo.plus6Name
                : action.key === "24"
                  ? t.demo.plus24Name
                  : t.demo.resetName;
          return (
            <PixelButton
              key={action.key}
              disabled={pending !== null}
              aria-label={name}
              onClick={() => void go(action.key, action.body)}
            >
              {label}
            </PixelButton>
          );
        })}
      </div>
      {error ? (
        <p className="mt-2 text-[8px] leading-relaxed text-blood-text">{t.demo.refused}</p>
      ) : null}
    </motion.section>
  );
}
