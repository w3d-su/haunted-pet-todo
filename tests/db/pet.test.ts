import { expect, it } from "vitest";
import { getPetState, savePetState } from "@/lib/db/pet";
import { initialPetState, type TombstoneRecord } from "@/lib/game/pet";
import { createPetTable } from "../helpers/pet-table";

const USER = "11111111-1111-4111-8111-111111111111";
const PET = "22222222-2222-4222-8222-222222222222";
const NOW = Date.UTC(2026, 9, 31, 8);

it("getPetState returns null when the user has no row", async () => {
  const table = createPetTable(null);
  await expect(getPetState(table.client, USER)).resolves.toBeNull();
});

it("savePetState writes snake_case columns and keeps the graveyard", async () => {
  const stone: TombstoneRecord = {
    id: "stone-1",
    diedAt: NOW,
    stage: "adult",
    finalHp: 0,
    finalHunger: 3,
    finalMood: 4,
    tasksCompletedTotal: 9,
    epitaph: "Gone but not completed.",
    overdueTaskIds: ["task-a"],
  };
  const state = {
    ...initialPetState(USER, NOW, PET, "America/New_York"),
    stage: "adult" as const,
    status: "tombstone" as const,
    hp: 0,
    hunger: 3,
    mood: 4,
    currentStreak: 2,
    tasksCompletedTotal: 9,
    currentEpitaph: "Gone but not completed.",
    graveyard: [stone],
    diedAt: NOW,
  };
  const table = createPetTable(null);
  const saved = await savePetState(table.client, state, 0);
  expect(saved).not.toBeNull();
  expect(saved?.state.userId).toBe(USER);
  expect(saved?.state.graveyard).toEqual([stone]);
  expect(saved?.version).toBe(1);

  const stored = table.stored();
  expect(stored?.user_id).toBe(USER);
  expect(stored?.time_zone).toBe("America/New_York");
  expect(stored?.current_streak).toBe(2);
  expect(stored?.tasks_completed_total).toBe(9);
  expect(stored?.last_tick_at).toBe(new Date(NOW).toISOString());
  expect(stored?.died_at).toBe(new Date(NOW).toISOString());
  expect(stored?.current_epitaph).toBe("Gone but not completed.");
  expect(stored).not.toHaveProperty("userId");
  expect(stored?.clock_offset_ms).toBe(0);
  const graveyard = stored?.graveyard as TombstoneRecord[];
  expect(graveyard[0]?.diedAt).toBe(NOW);
  expect(graveyard[0]?.overdueTaskIds).toEqual(["task-a"]);

  const inserted = await savePetState(table.client, { ...state, hp: 1 }, 0);
  expect(inserted).toBeNull();

  const loaded = await getPetState(table.client, USER);
  expect(loaded?.timeZone).toBe("America/New_York");
  expect(loaded?.graveyard[0]?.overdueTaskIds).toEqual(["task-a"]);
  expect(loaded?.diedAt).toBe(NOW);
  expect(loaded?.lastTickAt).toBe(NOW);
});
