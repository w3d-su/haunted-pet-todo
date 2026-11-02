import type { PetStage, PetState } from "./pet";

/**
 * Things that happen to a pet.
 * Task-log rows (`TASK_CREATED`, `TASK_OVERDUE`, …) are event-table types,
 * not reducer inputs. The client may request only `REBIRTH`.
 */
export type GameEvent =
  | {
      type: "TASK_COMPLETED";
      taskId: string;
      wasOverdue: boolean;
      category: string;
      completedAt: number;
    }
  | { type: "DECAY_TICK"; fromTime: number; toTime: number }
  | {
      type: "ZOMBIE_DRAIN";
      zombieCount: number;
      fromTime: number;
      toTime: number;
    }
  | { type: "EPITAPH_READY"; epitaph: string }
  | { type: "REBIRTH"; tombstoneId: string }
  | { type: "PET_HATCHED" }
  | { type: "PET_GREW_UP" }
  | { type: "PET_EVOLVED"; newStage: PetStage }
  | { type: "PET_DIED"; finalState: Omit<PetState, "graveyard"> }
  | { type: "STREAK_BROKEN" };
