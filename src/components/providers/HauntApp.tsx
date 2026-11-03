"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EggHatch } from "@/components/pet/EggHatch";
import { PetSprite } from "@/components/pet/PetSprite";
import { PetStats } from "@/components/pet/PetStats";
import { petSpeech } from "@/components/pet/speech";
import { SpeechBubble } from "@/components/pet/SpeechBubble";
import { Tombstone } from "@/components/pet/Tombstone";
import { TaskForm } from "@/components/tasks/TaskForm";
import { TaskList, type TaskView } from "@/components/tasks/TaskList";
import { DemoControls } from "@/components/ui/DemoControls";
import { ZombieLayer } from "@/components/zombies/ZombieLayer";
import { GameStateProvider, useGameState } from "@/components/providers/GameStateProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { epitaphForDisplay, translateError } from "@/lib/i18n/dictionaries";

function flattenTitles(tasks: readonly TaskView[]): { title: string; status: string; dueAt: number | null }[] {
  return tasks.flatMap((task) => [
    { title: task.title, status: task.status, dueAt: task.dueAt },
    ...flattenTitles(task.subtasks),
  ]);
}

function HauntScreen({ demoMode }: { demoMode: boolean }) {
  const game = useGameState();
  const { locale, t } = useLocale();
  const previousStage = useRef<string | null>(null);
  const [hatching, setHatching] = useState(false);
  const finishHatch = useCallback(() => setHatching(false), []);

  useEffect(() => {
    const stage = game.pet?.stage ?? null;
    if (previousStage.current === "egg" && stage === "hatchling") setHatching(true);
    previousStage.current = stage;
  }, [game.pet]);

  const pet = game.pet;
  const dead = pet?.status === "dead" || pet?.status === "tombstone";
  const line = pet ? petSpeech(pet, flattenTitles(game.tasks), game.now, locale) : null;

  return (
    <main className="flex-1 bg-bg-void px-4 py-8 text-ghost-white">
      <ZombieLayer />
      <section className="mx-auto w-full max-w-xl border-2 border-ghost-white bg-bg-panel px-4 py-6">
        <p className="text-[10px] leading-relaxed text-pumpkin">{t.brand.kicker}</p>
        <h1 className="mt-4 text-[16px] leading-relaxed">{t.brand.title}</h1>
        {game.loading ? (
          <p className="mt-6 text-[10px] leading-relaxed text-ghost-dim">{t.app.listening}</p>
        ) : null}
        {game.error ? (
          <p className="mt-4 text-[10px] leading-relaxed text-blood" role="alert">
            {t.app.error(translateError(game.error, t))}
          </p>
        ) : null}
        {pet && !game.loading ? (
          <div className="mt-6 flex flex-col items-center text-center">
            <p className="text-[8px] uppercase leading-relaxed text-ghost-dim">{t.stage[pet.stage]}</p>
            {hatching ? (
              <EggHatch onDone={finishHatch} />
            ) : dead ? null : (
              <PetSprite pet={pet} evolving={game.evolving} />
            )}
            {game.evolving ? (
              <p className="mt-2 text-[8px] leading-relaxed text-pumpkin" role="status">
                {t.app.evolved}
              </p>
            ) : null}
            <SpeechBubble line={pet.status === "alive" ? (game.breakdownLine ?? line) : null} />
            <PetStats pet={pet} />
            {pet.graveyard.length > 0 ? (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-[8px] leading-relaxed text-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-pumpkin)]">
                  {t.app.graveyard(pet.graveyard.length)}
                </summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {pet.graveyard.map((stone) => (
                    <li key={stone.id} className="text-[8px] leading-relaxed text-bone">
                      {t.app.graveyardEntry(t.stage[stone.stage], epitaphForDisplay(stone.epitaph, t))}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
        <TaskForm pending={game.pending} now={game.now} onCreate={game.createTask} />
        <TaskList
          tasks={game.tasks}
          pending={game.pending}
          onComplete={(id) => void game.completeTask(id)}
          onReorder={(ids) => void game.reorder(ids)}
          onBreakdown={(id) => void game.requestBreakdown(id)}
        />
        {demoMode ? (
          <DemoControls clockOffsetMs={game.clockOffsetMs} onRefresh={game.refresh} />
        ) : null}
      </section>
      {pet && dead ? (
        <Tombstone epitaph={pet.currentEpitaph} pending={game.pending} onRebirth={() => void game.rebirth()} />
      ) : null}
    </main>
  );
}

export function HauntApp({ demoMode }: { demoMode: boolean }) {
  return (
    <GameStateProvider demoMode={demoMode}>
      <HauntScreen demoMode={demoMode} />
    </GameStateProvider>
  );
}
