import type { PetStage, PetStatus } from "@/lib/game/pet";

export interface SpeechTask {
  readonly title: string;
  readonly status: string;
  readonly dueAt: number | null;
}

const HOUR_MS = 3_600_000;

function quote(title: string): string {
  const trimmed = title.replace(/[\r\n"]/g, " ").trim().slice(0, 40);
  return `"${trimmed}"`;
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
): string | null {
  if (pet.stage === "egg" || pet.status !== "alive") return null;

  const overdue = tasks
    .filter((task) => task.status === "overdue" && task.dueAt !== null)
    .slice()
    .sort((left, right) => (left.dueAt ?? 0) - (right.dueAt ?? 0));
  const oldest = overdue[0];
  const overdueHours = oldest?.dueAt != null ? (now - oldest.dueAt) / HOUR_MS : 0;

  if (pet.stage === "hatchling") {
    if (oldest) return "nooo… overdue bad 😢";
    if (pet.hunger < 40) return "hungry… do thing pls";
    if (pet.tasksCompletedTotal > 0) return "yay!! u did it!! ✨";
    return "boo… 👻 task?";
  }

  if (oldest && overdueHours > 6) {
    return `The ghost of ${quote(oldest.title)} walks these halls and it will not rest 💀`;
  }
  if (oldest && overdueHours >= 1) {
    return "WOOOO it has been HOURS and your task is still undone 😱👻";
  }
  if (oldest) return "Pssst… your task is just sitting there, getting a liiittle cold 🌙";
  if (pet.hunger < 30) return "I haven't eaten since that last task… I'm fading 🌫️";
  if (pet.mood < 30) return "My mood is: haunted mansion on a Monday. Help.";
  if (pet.stage !== "adult") return "I evolved because of YOU. Don't make me regret it 👑👻";
  return "You're on a roll, spooky friend ✨ I can feel the power!";
}
