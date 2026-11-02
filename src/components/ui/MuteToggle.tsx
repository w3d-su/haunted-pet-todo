"use client";

import { PixelButton } from "@/components/ui/PixelButton";
import { useSound } from "@/components/providers/SoundProvider";

export function MuteToggle() {
  const { muted, toggleMuted } = useSound();

  return (
    <PixelButton
      className="fixed right-3 top-3 z-[60]"
      aria-pressed={muted}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      onClick={toggleMuted}
    >
      {muted ? "Muted" : "Sound"}
    </PixelButton>
  );
}
