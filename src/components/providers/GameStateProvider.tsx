"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PetState } from "@/lib/game/pet";
import type { TaskView } from "@/components/tasks/TaskList";
import type { TaskDraft } from "@/components/tasks/TaskForm";

interface GameValue {
  pet: PetState | null;
  tasks: TaskView[];
  now: number;
  clockOffsetMs: number;
  loading: boolean;
  pending: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createTask: (draft: TaskDraft) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  reorder: (orderedIds: readonly string[]) => Promise<void>;
  rebirth: () => Promise<void>;
}

const GameContext = createContext<GameValue | null>(null);

export function useGameState(): GameValue {
  const value = useContext(GameContext);
  if (!value) throw new Error("useGameState requires GameStateProvider");
  return value;
}

function markDone(tasks: readonly TaskView[], id: string): TaskView[] {
  return tasks.map((task) => ({
    ...task,
    status: task.id === id ? "done" : task.status,
    subtasks: markDone(task.subtasks, id),
  }));
}

function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Throws when sign-in fails. Callers must not fall through to the memory demo. */
async function bearerFromSupabase(): Promise<Record<string, string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return {};
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  const existing = await supabase.auth.getSession();
  let token = existing.data.session?.access_token;
  if (!token) {
    const signed = await supabase.auth.signInAnonymously();
    token = signed.data.session?.access_token;
    if (signed.error || !token) {
      throw new Error(signed.error?.message ?? "Sign-in failed. Try again.");
    }
  }
  return { Authorization: `Bearer ${token}` };
}

export function GameStateProvider({
  demoMode,
  children,
}: {
  demoMode: boolean;
  children: ReactNode;
}) {
  const [pet, setPet] = useState<PetState | null>(null);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [now, setNow] = useState(0);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headersRef = useRef<Record<string, string>>({});

  async function authed(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    for (const [key, value] of Object.entries(headersRef.current)) headers.set(key, value);
    if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    headers.set("x-time-zone", Intl.DateTimeFormat().resolvedOptions().timeZone);
    return fetch(path, { ...init, headers, credentials: "same-origin" });
  }

  async function refresh() {
    const [petResponse, taskResponse] = await Promise.all([
      authed("/api/pet"),
      authed("/api/tasks"),
    ]);
    if (!petResponse.ok || !taskResponse.ok) {
      throw new Error("The house is dark. Try again.");
    }
    const petBody = (await petResponse.json()) as {
      pet: PetState;
      now: number;
      clockOffsetMs: number;
    };
    const taskBody = (await taskResponse.json()) as { tasks: TaskView[]; now: number };
    setPet(petBody.pet);
    setNow(petBody.now);
    setClockOffsetMs(petBody.clockOffsetMs);
    setTasks(taskBody.tasks);
  }

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        if (supabaseConfigured()) {
          headersRef.current = await bearerFromSupabase();
        } else if (demoMode) {
          const session = await fetch("/api/demo/session", {
            method: "POST",
            credentials: "same-origin",
          });
          if (!session.ok) throw new Error("Demo mode is locked.");
        }
        if (!cancelled) await refresh();
        if (!cancelled) setError(null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "The house is dark.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
    // Boot once. Later writes call refresh themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode]);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something rustled and failed.");
    } finally {
      setPending(false);
    }
  }

  const value: GameValue = {
    pet,
    tasks,
    now,
    clockOffsetMs,
    loading,
    pending,
    error,
    refresh: () => run(refresh),
    createTask: (draft) =>
      run(async () => {
        const response = await authed("/api/tasks", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        if (!response.ok) throw new Error("The task slipped through the floorboards.");
        await refresh();
      }),
    completeTask: (id) =>
      run(async () => {
        setTasks((current) => markDone(current, id));
        const response = await authed("/api/tasks", {
          method: "PATCH",
          body: JSON.stringify({ id, status: "done" }),
        });
        if (!response.ok) throw new Error("That task would not close.");
        await refresh();
      }),
    reorder: (orderedIds) =>
      run(async () => {
        for (let index = 0; index < orderedIds.length; index += 1) {
          const id = orderedIds[index];
          if (!id) continue;
          const response = await authed("/api/tasks", {
            method: "PATCH",
            body: JSON.stringify({ id, sortOrder: index + 1 }),
          });
          if (!response.ok) throw new Error("The list would not shuffle.");
        }
        await refresh();
      }),
    rebirth: () =>
      run(async () => {
        const response = await authed("/api/pet", {
          method: "PATCH",
          body: JSON.stringify({ type: "REBIRTH" }),
        });
        if (!response.ok) throw new Error("The egg is not ready.");
        await refresh();
      }),
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
