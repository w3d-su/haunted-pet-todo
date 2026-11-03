import { dictionaryFor } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locale";
import type { PetStage, PetStatus } from "@/lib/game/pet";

export interface SpeechTask {
  readonly title: string;
  readonly status: string;
  readonly dueAt: number | null;
}

const HOUR_MS = 3_600_000;

function quote(title: string): string {
  return title.replace(/[\r\n"]/g, " ").trim().slice(0, 40);
}

/**
 * One line of pet dialogue, or null when the egg has nothing to say.
 * Lines stay under 140 characters and follow the stage voices.
 */
export function petSpeech(
  pet: {
    stage: PetStage;
    status: PetStatus;
    hunger: number;
    mood: number;
    tasksCompletedTotal: number;
  },
  tasks: readonly SpeechTask[],
  now: number,
  locale: Locale = "en",
): string | null {
  const speech = dictionaryFor(locale).speech;
  if (pet.stage === "egg" || pet.status !== "alive") return null;

  const overdue = tasks
    .filter((task) => task.status === "overdue" && task.dueAt !== null)
    .slice()
    .sort((left, right) => (left.dueAt ?? 0) - (right.dueAt ?? 0));
  const oldest = overdue[0];
  const overdueHours = oldest?.dueAt != null ? (now - oldest.dueAt) / HOUR_MS : 0;

  if (pet.stage === "hatchling") {
    if (oldest) return speech.hatchling.overdue;
    if (pet.hunger < 40) return speech.hatchling.hungry;
    if (pet.tasksCompletedTotal > 0) return speech.hatchling.celebrate;
    return speech.hatchling.ask;
  }

  if (oldest && overdueHours > 6) return speech.adult.haunting(quote(oldest.title));
  if (oldest && overdueHours >= 1) return speech.adult.dramatic;
  if (oldest) return speech.adult.gentle;
  if (pet.hunger < 30) return speech.adult.hungry;
  if (pet.mood < 30) return speech.adult.mood;
  if (pet.stage !== "adult") return speech.adult.evolved;
  return speech.adult.happy;
}
