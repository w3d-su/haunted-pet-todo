"use client";

import { useReducedMotion } from "framer-motion";

export function StatBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "hp" | "hunger" | "mood";
}) {
  const reduced = useReducedMotion() === true;
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const fill =
    tone === "hunger"
      ? "bg-slime"
      : tone === "mood"
        ? "bg-mood-purple"
        : ratio < 0.25
          ? "bg-blood"
          : "bg-pumpkin";
  const shown = tone === "hp" ? Math.ceil(value - 1e-9) : Math.round(value);
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[8px] leading-relaxed text-ghost-white">{label}</span>
      <div
        className="h-3 w-24 border-2 border-ghost-white bg-bg-panel"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={shown}
      >
        <div
          className={`h-full ${fill}`}
          style={{
            width: `${ratio * 100}%`,
            transition: reduced ? undefined : "width 0.15s ease-out",
          }}
        />
      </div>
      <span className="w-8 text-[10px] leading-relaxed text-ghost-white">{shown}</span>
    </div>
  );
}
