"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PixelButton } from "@/components/ui/PixelButton";

const ACTIONS = [
  { key: "1", label: "+1h", body: { hours: 1 } },
  { key: "6", label: "+6h", body: { hours: 6 } },
  { key: "24", label: "+24h", body: { hours: 24 } },
  { key: "reset", label: "Reset", body: { reset: true } },
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
  const hours = Math.round(clockOffsetMs / 3_600_000);

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
      <p className="mt-2 text-[10px] leading-relaxed text-ghost-white" aria-live="polite">
        {pending ? "The spirit is listening…" : `Clock +${hours}h`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <PixelButton
            key={action.key}
            disabled={pending !== null}
            aria-label={
              action.key === "reset" ? "Reset the demo clock" : `Advance time by ${action.label}`
            }
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
