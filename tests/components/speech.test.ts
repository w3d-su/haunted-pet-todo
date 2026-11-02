import { expect, it } from "vitest";
import { initialPetState } from "@/lib/game/pet";
import { petSpeech } from "@/components/pet/speech";

const NOW = Date.UTC(2026, 9, 1, 12);

it("keeps the egg quiet and stays inside the speech bubble", () => {
  const egg = initialPetState("user", NOW, "pet", "UTC");
  expect(petSpeech(egg, [], NOW)).toBeNull();

  const hatchling = { ...egg, stage: "hatchling" as const };
  const line = petSpeech(hatchling, [], NOW);
  expect(line).toBeTruthy();
  expect(line!.length).toBeLessThanOrEqual(140);

  const adult = { ...egg, stage: "adult" as const, hunger: 10, mood: 10 };
  const hungry = petSpeech(adult, [], NOW);
  expect(hungry).toMatch(/fading|mood/i);
  expect(hungry!.length).toBeLessThanOrEqual(140);

  const haunting = petSpeech(
    { ...egg, stage: "adult" as const },
    [{ title: "Reply to emails", status: "overdue", dueAt: NOW - 7 * 3_600_000 }],
    NOW,
  );
  expect(haunting).toContain("Reply to emails");
  expect(haunting!.length).toBeLessThanOrEqual(140);
  expect(haunting).not.toMatch(/lazy|failure|depressed|anxious/i);
});
