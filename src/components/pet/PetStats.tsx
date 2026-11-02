import { MAX_HP } from "@/lib/game/constants";
import type { PetState } from "@/lib/game/pet";
import { StatBar } from "@/components/ui/StatBar";

export function PetStats({ pet }: { pet: PetState }) {
  if (pet.stage === "egg") return null;
  return (
    <div className="mt-4 flex flex-col gap-2">
      <StatBar label="HP" value={pet.hp} max={MAX_HP} tone="hp" />
      <StatBar label="Hunger" value={pet.hunger} max={100} tone="hunger" />
      <StatBar label="Mood" value={pet.mood} max={100} tone="mood" />
    </div>
  );
}
