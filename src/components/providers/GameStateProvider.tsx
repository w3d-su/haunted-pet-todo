"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { gameRequest, supabaseConfigured } from "./game-request";
import { petTransitionSound } from "./pet-sound";
import { useSound } from "@/components/providers/SoundProvider";
import { en } from "@/lib/i18n/en";
import { hpSpent, type PetState } from "@/lib/game/pet";
import type { TaskView } from "@/components/tasks/TaskList";
import { breakdownFailureIsQuiet } from "@/components/tasks/breakdown-ui";
import type { TaskDraft } from "@/components/tasks/TaskForm";

/**
 * `unavailable`: no VAPID key, or the browser has no Web Push.
 * `blocked`: the player refused notifications; only browser settings undo that.
 */
export type ReminderState = "unavailable" | "off" | "on" | "blocked";

interface GameValue {
  pet: PetState | null;
  tasks: TaskView[];
  now: number;
  clockOffsetMs: number;
  loading: boolean;
  pending: boolean;
  error: string | null;
  evolving: boolean;
  breakdownLine: string | null;
  reminders: ReminderState;
  refresh: () => Promise<void>;
  createTask: (draft: TaskDraft) => Promise<boolean>;
  completeTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  reorder: (orderedIds: readonly string[]) => Promise<void>;
  rebirth: () => Promise<void>;
  requestBreakdown: (id: string) => Promise<void>;
  enableReminders: () => Promise<void>;
  disableReminders: () => Promise<void>;
}

const GameContext = createContext<GameValue | null>(null);
/** One epitaph request per death. A failed call is not retried on the next refresh. */
const epitaphTried = new Set<string>();
/** One attempt per pet and zone, so a refused change is not sent on every refresh. */
const zoneTried = new Set<string>();

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

/** `id` and everything nested under it, children first. */
function withDescendants(tasks: readonly TaskView[], id: string): string[] {
  const collect = (task: TaskView): string[] => [...task.subtasks.flatMap(collect), task.id];
  for (const task of tasks) {
    if (task.id === id) return collect(task);
    const nested = withDescendants(task.subtasks, id);
    if (nested.length > 0) return nested;
  }
  return [];
}

/** How often an open, visible tab re-reads the pet and tasks. */
const BACKGROUND_REFRESH_MS = 60_000;

function vapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key || key === "your-vapid-public-key") return null;
  return key;
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

function pushSupported(): boolean {
  return (
    vapidPublicKey() !== null &&
    typeof Notification !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof PushManager !== "undefined"
  );
}

/**
 * Send this browser's push subscription to the server. With `create` false
 * only an existing subscription is sent. Never asks for permission.
 * Returns true when the server stored it.
 */
async function saveSubscription(create: boolean, locale: string): Promise<boolean> {
  const key = vapidPublicKey();
  if (!key) return false;
  const registration = await navigator.serviceWorker.register("/sw.js");
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (create
      ? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
        })
      : null);
  if (!subscription) return false;
  const response = await gameRequest("/api/push", {
    method: "POST",
    body: JSON.stringify({ ...subscription.toJSON(), locale }),
  });
  return response.ok;
}

async function failureMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.length > 0) return body.error;
  } catch {
    // The body was not JSON. The fallback still tells the player what failed.
  }
  return fallback;
}

export function GameStateProvider({
  demoMode,
  children,
}: {
  demoMode: boolean;
  children: ReactNode;
}) {
  const { play } = useSound();
  const { locale } = useLocale();
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const [pet, setPet] = useState<PetState | null>(null);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [now, setNow] = useState(0);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evolving, setEvolving] = useState(false);
  const [breakdownLine, setBreakdownLine] = useState<string | null>(null);
  const [reminders, setReminders] = useState<ReminderState>("unavailable");
  const evolveTimer = useRef<number | null>(null);
  const petRef = useRef<PetState | null>(null);
  // Bumped by every refresh and every action, so a slower, older read cannot
  // overwrite what a newer one already showed.
  const refreshGeneration = useRef(0);
  const busyRef = useRef(false);
  busyRef.current = loading || pending;

  const refresh = useCallback(async () => {
    const generation = (refreshGeneration.current += 1);
    const [petResponse, taskResponse] = await Promise.all([
      gameRequest("/api/pet"),
      gameRequest("/api/tasks"),
    ]);
    if (!petResponse.ok || !taskResponse.ok) {
      throw new Error(en.errors.houseDarkRetry);
    }
    const petBody = (await petResponse.json()) as {
      pet: PetState;
      now: number;
      clockOffsetMs: number;
    };
    const taskBody = (await taskResponse.json()) as { tasks: TaskView[]; now: number };
    if (generation !== refreshGeneration.current) return;
    let nextPet = petBody.pet;
    // The pet keeps the zone it was created in. Follow the browser when it differs,
    // so days, streaks, and the reminder hour match where the player is now.
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zoneKey = `${nextPet.id}:${zone}`;
    if (zone && nextPet.timeZone !== zone && !zoneTried.has(zoneKey)) {
      zoneTried.add(zoneKey);
      try {
        const moved = await gameRequest("/api/pet", {
          method: "PATCH",
          body: JSON.stringify({ timeZone: zone }),
        });
        if (moved.ok) {
          const body = (await moved.json()) as { pet?: PetState };
          if (body.pet) nextPet = body.pet;
        }
      } catch {
        // The pet stays in its old zone until the next page load.
      }
    }
    const deathKey = `${nextPet.id}:${nextPet.diedAt ?? "spent"}`;
    if (
      nextPet.status !== "tombstone" &&
      hpSpent(nextPet.hp) &&
      !epitaphTried.has(deathKey)
    ) {
      epitaphTried.add(deathKey);
      try {
        const epitaph = await gameRequest("/api/ai/epitaph", { method: "POST", body: "{}" });
        if (epitaph.ok) {
          const carved = (await epitaph.json()) as { pet?: PetState };
          if (carved.pet) nextPet = carved.pet;
        }
      } catch {
        // The tombstone still shows the fallback line baked in at death.
      }
    }
    if (generation !== refreshGeneration.current) return;
    setPet(nextPet);
    const transition = petTransitionSound(petRef.current, nextPet);
    petRef.current = nextPet;
    if (transition) play(transition);
    setNow(petBody.now);
    setClockOffsetMs(petBody.clockOffsetMs);
    setTasks(taskBody.tasks);
  }, [play]);

  function noticeEvolution(emitted: readonly { type?: string }[] | undefined) {
    if (!emitted?.some((event) => event.type === "PET_EVOLVED")) return;
    setEvolving(true);
    if (evolveTimer.current !== null) window.clearTimeout(evolveTimer.current);
    evolveTimer.current = window.setTimeout(() => setEvolving(false), 900);
  }

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        if (!supabaseConfigured() && demoMode) {
          const session = await fetch("/api/demo/session", {
            method: "POST",
            credentials: "same-origin",
          });
          if (!session.ok) throw new Error(await failureMessage(session, en.errors.demoLocked));
        }
        if (!cancelled) await refresh();
        if (!cancelled) setError(null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : en.errors.houseDark);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
      if (evolveTimer.current !== null) window.clearTimeout(evolveTimer.current);
    };
    // Boot once. Later writes call refresh themselves.
  }, [demoMode, refresh]);

  // Permission is asked only from `enableReminders`, which a button calls.
  // This effect never prompts. It reports where things stand and keeps an
  // existing subscription's language current.
  useEffect(() => {
    if (loading || error) return;
    if (!pushSupported()) {
      setReminders("unavailable");
      return;
    }
    if (Notification.permission === "denied") {
      setReminders("blocked");
      return;
    }
    if (Notification.permission !== "granted") {
      setReminders("off");
      return;
    }
    let cancelled = false;
    async function syncExisting() {
      try {
        const saved = await saveSubscription(false, locale);
        if (!cancelled) setReminders(saved ? "on" : "off");
      } catch (cause) {
        console.error(cause);
        if (!cancelled) setReminders("off");
      }
    }
    void syncExisting();
    return () => {
      cancelled = true;
    };
  }, [locale, loading, error]);

  // Decay and due dates move on while the tab sits open. Re-read when the tab
  // comes back into view, and once a minute while it stays visible.
  useEffect(() => {
    if (loading) return;
    let running = false;
    async function quietRefresh() {
      if (running || busyRef.current || document.visibilityState !== "visible") return;
      running = true;
      const recovering = petRef.current === null;
      try {
        await refresh();
        if (recovering && petRef.current !== null) setError(null);
      } catch {
        // The next tick or the next action tries again.
      } finally {
        running = false;
      }
    }
    function onWake() {
      void quietRefresh();
    }
    const timer = window.setInterval(onWake, BACKGROUND_REFRESH_MS);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [loading, refresh]);

  async function run(action: () => Promise<void>) {
    refreshGeneration.current += 1;
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : en.errors.rustled);
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
    evolving,
    breakdownLine,
    reminders,
    refresh: () => run(refresh),
    createTask: async (draft) => {
      let created = false;
      await run(async () => {
        const response = await gameRequest("/api/tasks", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        if (!response.ok) {
          throw new Error(await failureMessage(response, en.errors.taskSlipped));
        }
        created = true;
        await refresh();
      });
      return created;
    },
    completeTask: (id) =>
      run(async () => {
        setTasks((current) => markDone(current, id));
        let response: Response;
        try {
          response = await gameRequest("/api/tasks", {
            method: "PATCH",
            body: JSON.stringify({ id, status: "done" }),
          });
          if (!response.ok) throw new Error(await failureMessage(response, en.errors.taskWouldNotClose));
        } catch (cause) {
          // A lost response may still have committed. Restore the UI, then reconcile if online.
          setTasks(tasks);
          await refresh().catch(() => {});
          throw cause;
        }
        play("task_complete");
        const body = (await response.json()) as { emitted?: { type: string }[]; pet?: PetState };
        if (!body.pet || !hpSpent(body.pet.hp)) noticeEvolution(body.emitted);
        await refresh();
      }),
    deleteTask: (id) =>
      run(async () => {
        // The server keeps the children of a deleted task as root tasks, so remove them first.
        const ids = withDescendants(tasks, id);
        try {
          for (const taskId of ids.length > 0 ? ids : [id]) {
            const response = await gameRequest("/api/tasks", {
              method: "DELETE",
              body: JSON.stringify({ id: taskId }),
            });
            if (!response.ok && response.status !== 404) {
              throw new Error(await failureMessage(response, en.errors.taskWouldNotVanish));
            }
          }
        } catch (cause) {
          await refresh().catch(() => {});
          throw cause;
        }
        await refresh();
      }),
    reorder: (orderedIds) =>
      run(async () => {
        const response = await gameRequest("/api/tasks", {
          method: "PATCH",
          body: JSON.stringify({ orderedIds }),
        });
        if (response.status === 409) await refresh();
        if (!response.ok) throw new Error(await failureMessage(response, en.errors.listWouldNotShuffle));
        await refresh();
      }),
    rebirth: () =>
      run(async () => {
        const response = await gameRequest("/api/pet", {
          method: "PATCH",
          body: JSON.stringify({ type: "REBIRTH" }),
        });
        if (!response.ok) throw new Error(await failureMessage(response, en.errors.eggNotReady));
        await refresh();
      }),
    requestBreakdown: (id) =>
      run(async () => {
        const response = await gameRequest("/api/ai/breakdown", {
          method: "POST",
          body: JSON.stringify({ taskId: id }),
        });
        if (response.status === 409) {
          const message = await failureMessage(response, "");
          if (breakdownFailureIsQuiet(response.status, message)) {
            await refresh();
            return;
          }
          throw new Error(message || en.errors.ghostCouldNotBreak);
        }
        if (!response.ok) {
          throw new Error(await failureMessage(response, en.errors.ghostCouldNotBreak));
        }
        const body = (await response.json()) as { intro?: string };
        await refresh();
        setBreakdownLine(body.intro ?? null);
      }),
    enableReminders: () =>
      run(async () => {
        if (!pushSupported()) return;
        const permission = await Notification.requestPermission();
        if (permission === "denied") {
          setReminders("blocked");
          return;
        }
        if (permission !== "granted") return;
        let saved = false;
        try {
          saved = await saveSubscription(true, localeRef.current);
        } catch (cause) {
          console.error(cause);
        }
        setReminders(saved ? "on" : "off");
        if (!saved) throw new Error(en.errors.remindersFailed);
      }),
    disableReminders: () =>
      run(async () => {
        if (!pushSupported()) return;
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          // Tell the server first. An unsubscribed browser can no longer name its endpoint.
          const response = await gameRequest("/api/push", {
            method: "DELETE",
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          if (!response.ok) throw new Error(en.errors.remindersFailed);
          await subscription.unsubscribe();
        }
        setReminders("off");
      }),
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
