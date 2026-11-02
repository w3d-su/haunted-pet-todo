"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PixelButton } from "@/components/ui/PixelButton";

const ACTIONS = [
  { key: "1", label: "+1h", name: "+1h, advance time by 1 hour", body: { hours: 1 } },
  { key: "6", label: "+6h", name: "+6h, advance time by 6 hours", body: { hours: 6 } },
  { key: "24", label: "+24h", name: "+24h, advance time by 24 hours", body: { hours: 24 } },
  { key: "reset", label: "Reset", name: "Reset the demo clock", body: { reset: true } },
] as const;

export function DemoControls({
  clockOffsetMs,
  onRefresh,
}: {
  clockOffsetMs: number;
  onRefresh: () => Promise<void>;
}) {
  const reduced = useReducedMotion() === true;
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
    const unit = Math.abs(hours) === 1 ? "hour" : "hours";
    setAnnouncement(`Demo clock offset is ${hours} ${unit}`);
  }, [clockOffsetMs, hours]);

  async function go(key: string, body: { hours: 1 | 6 | 24 } | { reset: true }) {
    setPending(key);
    setError(null);
    try {
      const response = await fetch("/api/demo/fast-forward", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError("The clock refused to move.");
        return;
      }
      await onRefresh();
    } catch {
      setError("The clock refused to move.");
    } finally {
      setPending(null);
    }
  }

  return (
    <motion.section
      aria-label="Demo clock"
      className="mt-6 border-2 border-ghost-dim bg-bg-panel-raised p-3"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduced ? { duration: 0 } : { type: "tween", duration: 0.15, ease: "easeOut" }}
    >
      <p className="text-[8px] leading-relaxed text-ghost-dim">Demo clock</p>
      <p className="mt-2 text-[10px] leading-relaxed text-ghost-white">
        {pending ? "The spirit is listening…" : `Clock +${hours}h`}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <PixelButton
            key={action.key}
            disabled={pending !== null}
            aria-label={action.name}
            onClick={() => void go(action.key, action.body)}
          >
            {action.label}
          </PixelButton>
        ))}
      </div>
      {error ? <p className="mt-2 text-[8px] leading-relaxed text-blood">{error}</p> : null}
    </motion.section>
  );
}
