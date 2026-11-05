"use client";

import { MAX_HP } from "@/lib/game/constants";
import type { PetState } from "@/lib/game/pet";
import { useLocale } from "@/components/providers/LocaleProvider";
import { StatBar } from "@/components/ui/StatBar";

export function PetStats({ pet }: { pet: PetState }) {
  const { t } = useLocale();
  if (pet.stage === "egg") return null;
  return (
    <div className="mt-4 flex flex-col gap-2">
      <StatBar label={t.stats.hp} value={pet.hp} max={MAX_HP} tone="hp" />
      <StatBar label={t.stats.hunger} value={pet.hunger} max={100} tone="hunger" />
      <StatBar label={t.stats.mood} value={pet.mood} max={100} tone="mood" />
    </div>
  );
}
