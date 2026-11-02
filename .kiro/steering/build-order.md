---
inclusion: always
---

# Haunted Pet To-Do — Cross-Spec Build Order

This file defines the single authoritative execution order for a coding agent working across all three specs. Tasks are referenced as `<spec>/tasks.md task N`. The agent **must tick each checkbox** in the referenced tasks.md file immediately upon completing that task.

---

## Week 1 (Nov 2–9): Scaffold, Core Logic, Persistence, Task CRUD

**Definition of done**: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` all pass. All Week 1 property-based tests (P1–P16, P18–P19, P21–P26) are green. The `run-game-tests` and `no-date-now-guard` hooks pass on every `src/lib/game/` file.

| Order | Spec / Task | What it creates |
|---|---|---|
| 1 | pet-state-machine/tasks.md task 1 | Project scaffold, tooling, `.env.example`, `vercel.json` skeleton |
| 2 | pet-state-machine/tasks.md task 2 | `src/lib/game/constants.ts` |
| 3 | decay-and-time-travel/tasks.md task 1 | `src/lib/game/clock.ts` (`Clock`, `OffsetClock`); `SystemClock` in `src/lib/server/clock.ts` |
| 4 | pet-state-machine/tasks.md task 3 | _(dependency note — no code, clock.ts already done)_ |
| 5 | pet-state-machine/tasks.md task 4 | `src/lib/game/events.ts` (`GameEvent` union) |
| 6 | pet-state-machine/tasks.md task 5 | `src/lib/game/pet.ts` (`PetState`, `PetStage`, `PetStatus`, `initialPetState`, `rebirthPet`) |
| 7 | pet-state-machine/tasks.md task 6 | `src/lib/game/evolution.ts` (`canEvolve`, `resolveEvolvedForm`) |
| 8 | pet-state-machine/tasks.md task 7 | `applyPetEvent` reducer in `src/lib/game/pet.ts` |
| 9 | decay-and-time-travel/tasks.md task 2 | `src/lib/game/decay.ts` (`decayStats`, `decayAmount`, `decayRange`) |
| 10 | decay-and-time-travel/tasks.md task 3 | Wire `DECAY_TICK` into `applyPetEvent` in `pet.ts` |
| 11 | task-lifecycle/tasks.md task 1 | `src/lib/game/tasks.ts` (`Task`, `isOverdue`, `taskCompletionDeltas`, `makeTaskCompletedEvent`) |
| 12 | task-lifecycle/tasks.md task 2 | `src/lib/game/zombies.ts` (`ZombieState`, `activeZombies`, `makeZombieDrainEvent`, `zombieDamage`) |
| 13 | task-lifecycle/tasks.md task 3 | Wire `TASK_COMPLETED` into `applyPetEvent` in `pet.ts` |
| 14 | task-lifecycle/tasks.md task 6 | Supabase migrations `0001_init.sql` (tasks, events tables) and `0002_rls.sql` (RLS for tasks, events) |
| 15 | pet-state-machine/tasks.md task 10 | Add `pet_state` table DDL to `0001_init.sql`; add `users manage own pet` RLS policy to `0002_rls.sql` |
| 16 | pet-state-machine/tasks.md task 11 | `src/lib/db/pet.ts` (`getPetState`, `savePetState`, `PetStateRowSchema`) |
| 17 | task-lifecycle/tasks.md task 7 | `src/lib/db/tasks.ts` (`getTasks`, `upsertTask`, `softDeleteTask`, `TaskRowSchema`) |
| 18 | task-lifecycle/tasks.md task 8 | `src/lib/db/events.ts` (`appendEvent`) |
| 19 | task-lifecycle/tasks.md task 9 | `src/app/api/tasks/route.ts` (full CRUD API) |
| 20 | pet-state-machine/tasks.md task 8 | Unit tests for `pet.ts` and `evolution.ts` |
| 21 | pet-state-machine/tasks.md task 9 | Property-based tests P1–P10 in `tests/game/invariants.property.ts` |
| 22 | decay-and-time-travel/tasks.md task 4 | Unit tests for `decay.ts` and `clock.ts` |
| 23 | decay-and-time-travel/tasks.md task 5 | Property-based tests P18–P26 in `tests/game/invariants.property.ts` |
| 24 | task-lifecycle/tasks.md task 4 | Unit tests for task pure helpers |
| 25 | task-lifecycle/tasks.md task 5 | Property-based tests P11–P16 in `tests/game/invariants.property.ts` |

---

## Week 2 (Nov 9–16): Cron Job, Fast-Forward, Basic UI, Zombie UI

**Definition of done**: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` pass. Cron route returns 401 without `CRON_SECRET`. Fast-forward returns 403 in non-demo mode. Task list renders in the browser (unstyled is fine). Zombie sprites appear for overdue tasks. Property P20 passes.

| Order | Spec / Task | What it creates |
|---|---|---|
| 1 | decay-and-time-travel/tasks.md task 6 | `src/app/api/cron/decay/route.ts` (full cron handler — decay + zombie drain + epitaph trigger) |
| 2 | decay-and-time-travel/tasks.md task 7 | `vercel.json` daily cron (`0 8 * * *`) only after the cron route exists. Hobby cannot run an hourly cron. |
| 3 | task-lifecycle/tasks.md task 12 | Extend `src/app/api/cron/decay/route.ts` with overdue-task check and `TASK_OVERDUE` events |
| 4 | decay-and-time-travel/tasks.md task 8 | `src/app/api/demo/fast-forward/route.ts` |
| 5 | pet-state-machine/tasks.md task 12 | `src/app/api/pet/route.ts` |
| 6 | pet-state-machine/tasks.md task 13 | `PetSprite.tsx`, `PetStats.tsx` |
| 7 | pet-state-machine/tasks.md task 14 | `Tombstone.tsx`, `EggHatch.tsx` |
| 8 | task-lifecycle/tasks.md task 10 | `TaskList.tsx`, `TaskItem.tsx`, `TaskForm.tsx` (unstyled but functional) |
| 9 | task-lifecycle/tasks.md task 11 | `ZombieSprite.tsx`, `ZombieLayer.tsx` |
| 10 | decay-and-time-travel/tasks.md task 9 | `DemoControls.tsx` component |
| 11 | decay-and-time-travel/tasks.md task 10 | Property test P20 (fast-forward N hours = N ticks) |
| 12 | task-lifecycle/tasks.md task 13 | Integration tests for DB task helpers |

---

## Week 3 (Nov 16–23): AI Features, Web Push, Subtasks, Nag Integration

**Definition of done**: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` pass. Epitaph appears on pet death. Task breakdown returns 3–7 subtasks. Push subscription saves to DB. Nag notifications fire at habitual hour. Property P17 passes.

| Order | Spec / Task | What it creates |
|---|---|---|
| 1 | pet-state-machine/tasks.md task 15 | `src/lib/ai/epitaph.ts`, `src/app/api/ai/epitaph/route.ts` |
| 2 | pet-state-machine/tasks.md task 16 | Wire evolution trigger into `GameStateProvider.tsx` |
| 3 | task-lifecycle/tasks.md task 14 | `src/lib/ai/breakdown.ts`, `BreakdownResponseSchema` in `src/lib/ai/schemas.ts` |
| 4 | task-lifecycle/tasks.md task 15 | `src/app/api/ai/breakdown/route.ts` |
| 5 | task-lifecycle/tasks.md task 16 | `SubtaskList.tsx`, breakdown UI |
| 6 | task-lifecycle/tasks.md task 17 | Unit + property tests for AI breakdown (P17) |
| 7 | decay-and-time-travel/tasks.md task 11 | `src/lib/push/vapid.ts`, `src/lib/push/notify.ts` |
| 8 | decay-and-time-travel/tasks.md task 12 | `src/app/api/push/route.ts` |
| 9 | decay-and-time-travel/tasks.md task 13 | Supabase migration `0003_push.sql` |
| 10 | decay-and-time-travel/tasks.md task 14 | Habitual-time push logic in cron handler |
| 11 | decay-and-time-travel/tasks.md task 15 | Push subscription UI in `GameStateProvider.tsx` |

---

## Week 4 (Nov 23–30): Polish, Accessibility, Final Tests, Deploy

**Definition of done**: All MVP items checked in product.md. Full CI pipeline (`pnpm build && pnpm typecheck && pnpm lint && pnpm test`) passes with zero errors. All property tests P1–P26 green. Accessibility checklist in `visual-style.md` passes. Vercel deploy is live.

| Order | Spec / Task | What it creates |
|---|---|---|
| 1 | decay-and-time-travel/tasks.md task 16 | Verify and fix `no-date-now-guard` hook |
| 2 | decay-and-time-travel/tasks.md task 17 | Accessibility for `DemoControls` |
| 3 | decay-and-time-travel/tasks.md task 18 | End-to-end smoke test (decay → death loop) |
| 4 | pet-state-machine/tasks.md task 17 | Accessibility audit for pet components |
| 5 | pet-state-machine/tasks.md task 18 | Integration tests for DB pet helpers |
| 6 | task-lifecycle/tasks.md task 18 | Accessibility audit for task components |
| 7 | task-lifecycle/tasks.md task 19 | Sound effects for task events |

---

## Rules for the Coding Agent

1. **Tick checkboxes**: After completing each task row above, mark `[ ]` as `[x]` in the corresponding `tasks.md` file.
2. **One spec owns each file**: Do not create a file already owned by another spec's task. If you need functionality from that file, complete that spec's task first.
3. **Clock ownership**: `src/lib/game/clock.ts` is owned by `decay-and-time-travel/tasks.md task 1`. All other specs import from it; they do not re-implement it.
4. **Cron route ownership**: `src/app/api/cron/decay/route.ts` is created by `decay-and-time-travel/tasks.md task 6` and extended by `task-lifecycle/tasks.md task 12`. Do not create it twice.
5. **Week gate**: Do not start Week 2 work until the Week 1 definition of done is met.
6. **No `Date.now()` in `src/lib/game/`**: ESLint rejects it in CI. The `no-date-now-guard` hook runs that same rule after a save. `PostFileSave` cannot block the save.
