"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "haunted-muted";

export const SOUND_FILES = {
  task_complete: "/sfx/task_complete.ogg",
  zombie_spawn: "/sfx/zombie_spawn.ogg",
} as const;

export type SoundName = keyof typeof SOUND_FILES;

interface SoundValue {
  muted: boolean;
  toggleMuted: () => void;
  play: (name: SoundName) => void;
}

const SoundContext = createContext<SoundValue | null>(null);

export function useSound(): SoundValue {
  const value = useContext(SoundContext);
  if (!value) throw new Error("useSound requires SoundProvider");
  return value;
}

/**
 * Sound stays muted until the player turns it on, and nothing plays before
 * a pointer or key gesture. One AudioContext is created on that gesture.
 */
export function SoundProvider({ children }: { children: ReactNode }) {
  const [muted, setMuted] = useState(true);
  const mutedRef = useRef(true);
  const gesturedRef = useRef(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const buffers = useRef(new Map<SoundName, AudioBuffer>());
  const loading = useRef(new Map<SoundName, Promise<AudioBuffer | null>>());

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) === "false") {
      mutedRef.current = false;
      setMuted(false);
    }
  }, []);

  const audioContext = useCallback(() => {
    const existing = ctxRef.current;
    if (existing) return existing;
    const next = new AudioContext();
    ctxRef.current = next;
    return next;
  }, []);

  const load = useCallback((name: SoundName, ctx: AudioContext) => {
    const cached = buffers.current.get(name);
    if (cached) return Promise.resolve(cached);
    const pending = loading.current.get(name);
    if (pending) return pending;
    const request = fetch(SOUND_FILES[name])
      .then((response) => {
        if (!response.ok) throw new Error("missing sound");
        return response.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        buffers.current.set(name, buffer);
        return buffer;
      })
      .catch(() => null);
    loading.current.set(name, request);
    return request;
  }, []);

  const preload = useCallback(() => {
    if (mutedRef.current || !gesturedRef.current) return;
    const ctx = audioContext();
    void ctx.resume();
    for (const name of Object.keys(SOUND_FILES) as SoundName[]) void load(name, ctx);
  }, [audioContext, load]);

  useEffect(() => {
    const unlock = () => {
      gesturedRef.current = true;
      preload();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [preload]);

  const toggleMuted = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
    if (!next) preload();
  }, [preload]);

  const play = useCallback(
    (name: SoundName) => {
      if (mutedRef.current || !gesturedRef.current) return;
      const ctx = audioContext();
      void ctx.resume().then(async () => {
        if (mutedRef.current) return;
        const buffer = await load(name, ctx);
        if (!buffer || mutedRef.current) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
      });
    },
    [audioContext, load],
  );

  return (
    <SoundContext.Provider value={{ muted, toggleMuted, play }}>{children}</SoundContext.Provider>
  );
}
