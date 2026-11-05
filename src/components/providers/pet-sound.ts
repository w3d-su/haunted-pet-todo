import { hpSpent, type PetState } from "@/lib/game/pet";
import type { SoundName } from "./SoundProvider";

/** HP has to fall by at least this much between two reads to count as a hit. */
const HURT_THRESHOLD = 1;

/**
 * Picks at most one sound for the change between two pet reads.
 * Death wins over evolution, evolution over hatching, hatching over a hit.
 * The first read, a different pet, or a pet that was already gone plays nothing.
 */
export function petTransitionSound(
  previous: PetState | null,
  next: PetState,
): SoundName | null {
  if (!previous || previous.id !== next.id) return null;
  if (previous.status !== "alive" || hpSpent(previous.hp)) return null;
  if (next.status !== "alive" || hpSpent(next.hp)) return "pet_death";
  if (previous.stage === "egg" && next.stage !== "egg") return "pet_hatch";
  if (previous.stage !== next.stage && next.stage.startsWith("adult")) return "pet_evolve";
  if (next.hp <= previous.hp - HURT_THRESHOLD) return "pet_hurt";
  return null;
}
