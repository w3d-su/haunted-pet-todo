"use client";

import { PixelButton } from "@/components/ui/PixelButton";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useSound } from "@/components/providers/SoundProvider";

export function MuteToggle() {
  const { muted, toggleMuted } = useSound();
  const { t } = useLocale();

  return (
    <PixelButton
      className="fixed right-3 top-3 z-[60]"
      aria-pressed={muted}
      aria-label={muted ? t.sound.unmute : t.sound.mute}
      onClick={toggleMuted}
    >
      {muted ? t.sound.off : t.sound.on}
    </PixelButton>
  );
}
