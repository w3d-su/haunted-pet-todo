"use client";

import { useEffect, useState } from "react";
import { PixelButton } from "@/components/ui/PixelButton";

const STORAGE_KEY = "haunted-muted";

/** Sound stays off until a later slice plays it. The choice is still visible. */
export function MuteToggle() {
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) === "false") setMuted(false);
  }, []);

  return (
    <PixelButton
      className="fixed right-3 top-3 z-[60]"
      aria-pressed={muted}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      onClick={() => {
        const next = !muted;
        setMuted(next);
        window.localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
      }}
    >
      {muted ? "Muted" : "Sound"}
    </PixelButton>
  );
}
