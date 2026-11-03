# Task Lifecycle — Implementation Tasks

## Week 1 (Nov 2–9): Core Task Types, Pure Helpers, DB Migration, DB Helpers, CRUD API

- [x] 1. (Week 1) Implement `src/lib/game/tasks.ts` — Task types and pure helpers
  - [x] 1.1 Define `TaskStatus`, `TaskCategory`, `TaskSize` union types
  - [x] 1.2 Define `Task` interface with all fields
  - [x] 1.3 Implement `isOverdue(task, now)` — pure, clock-injectable
  - [x] 1.4 Implement `taskCompletionDeltas(task)` — returns hunger/HP/mood deltas
  - [x] 1.5 Implement `makeTaskCompletedEvent(task, now)` — produces `TASK_COMPLETED` event
    - Files: `src/lib/game/tasks.ts`
  _Requirements: 5.1, 7.2, 8.2, 9.2_

- [x] 2. (Week 1) Implement `src/lib/game/zombies.ts` — ZombieState and pure helpers
  - [x] 2.1 Define `ZombieState` interface
  - [x] 2.2 Implement `activeZombies(tasks, now)` — returns one zombie per overdue task
  - [x] 2.3 Implement `makeZombieDrainEvent(count, fromTime, toTime)`
  - [x] 2.4 Implement `zombieDamage(count, hours)` — linear drain calculation
    - Files: `src/lib/game/zombies.ts`
  _Requirements: 5.3, 5.4, 6.1_

- [x] 3. (Week 1) Wire task completion into `applyPetEvent` in `pet.ts`
  - [x] 3.1 In `applyTaskCompleted` helper: apply hunger/HP/mood deltas using `taskCompletionDeltas` logic
  - [x] 3.2 Guard against completing an already-done task (return state unchanged if `wasOverdue` flag mismatch)
  - [x] 3.3 Update `tasksCompletedTotal`, streak, and `recentCompletionTimestamps`/`Categories`
    - Files: `src/lib/game/pet.ts`
  _Requirements: 7.2, 7.3, 8.2, 8.3, 9.2_

- [x] 4. (Week 1) Write unit tests for task pure helpers
  - [x] 4.1 Test `isOverdue` for all status × dueAt combinations
  - [x] 4.2 Test `taskCompletionDeltas` returns reduced values for overdue tasks
  - [x] 4.3 Test `activeZombies` — one zombie per overdue, none for done/todo without past dueAt
  - [x] 4.4 Test `zombieDamage` linearity
    - Files: `tests/game/tasks.test.ts`, `tests/game/zombies.test.ts`
  _Requirements: 5.3, 5.4, 7.2, 8.2_

- [x] 5. (Week 1) Write property-based tests for task invariants
  - [x] 5.1 Build arbitraries: `arbTask`, `arbOverdueTask`, `arbDoneTask`, `arbTaskCompletedEvent`
  - [x] 5.2 Write property test for Property P11 (one zombie per overdue task)
  - [x] 5.3 Write property test for Property P12 (done tasks have no zombie)
  - [x] 5.4 Write property test for Property P13 (completion never lowers HP)
  - [x] 5.5 Write property test for Property P14 (double-complete is no-op)
  - [x] 5.6 Write property test for Property P15 (zombieDamage linear scaling)
  - [x] 5.7 Write property test for Property P16 (done task never isOverdue)
    - Files: `tests/game/invariants.property.ts`
  _Requirements: P11–P16 (requirements 5.3, 5.4, 7.2, 8.2, 9.2)_

- [x] 6. (Week 1) Create Supabase migrations for `tasks` and `events` tables
  - [x] 6.1 Add `tasks` table DDL with all columns, CHECK constraints, and indexes to `0001_init.sql`
  - [x] 6.2 Add `events` table DDL to `0001_init.sql`
  - [x] 6.3 Add RLS policies for `tasks` (all operations: `auth.uid() = user_id`) to `0002_rls.sql`
  - [x] 6.4 Add RLS policies for `events` (INSERT only; no DELETE) to `0002_rls.sql`
    - Files: `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_rls.sql`
  _Requirements: 12.3, 13.1, 13.2_

- [x] 7. (Week 1) Implement `src/lib/db/tasks.ts` — task DB helpers
  - [x] 7.1 Implement `getTasks(supabase, userId)` — fetches non-deleted tasks, Zod-validates
  - [x] 7.2 Implement `upsertTask(supabase, task)` — creates or updates task row
  - [x] 7.3 Implement `softDeleteTask(supabase, taskId, userId)` — sets `deleted_at`
  - [x] 7.4 Define `TaskRowSchema` for Supabase row → TypeScript Task mapping
    - Files: `src/lib/db/tasks.ts`
  _Requirements: 1.1, 4.1, 13.1_

- [x] 8. (Week 1) Implement `src/lib/db/events.ts` — event append helper
  - [x] 8.1 Implement `appendEvent(supabase, userId, eventType, payload)` — INSERT into events
    - Files: `src/lib/db/events.ts`
  _Requirements: 12.1, 12.2_

- [x] 9. (Week 1) Implement `src/app/api/tasks/route.ts` — CRUD API
  - [x] 9.1 GET handler: return tasks for authenticated user, nest subtasks under parents, catch up pet decay
  - [x] 9.2 POST handler: validate body with Zod, create task, append `TASK_CREATED` event
  - [x] 9.3 PATCH handler: validate body, handle `status = "done"` completion cascade (apply `TASK_COMPLETED` event to pet, slay zombie if overdue, append event)
  - [x] 9.4 PATCH handler: handle `status = "overdue"` guard (reject 409 if already done)
  - [x] 9.5 PATCH handler: handle `sortOrder` update
  - [x] 9.6 PATCH handler: handle `dueAt` update with overdue-to-todo reversal if future date
  - [x] 9.7 DELETE handler: soft-delete task, slay zombie if overdue, append `TASK_DELETED` event
    - Files: `src/app/api/tasks/route.ts`
  _Requirements: 1.1–1.5, 2.1–2.3, 3.1–3.3, 4.1–4.3, 7.1–7.4, 8.1–8.3, 9.1, 14.1, 14.2_

## Week 2 (Nov 9–16): Unstyled Task UI, Zombie UI

- [x] 10. (Week 2) Implement `TaskList.tsx`, `TaskItem.tsx`, `TaskForm.tsx`
  - [x] 10.1 `TaskForm.tsx`: controlled form with title, category select, size select, optional due date; client-side Zod validation. An "Already late" checkbox sets the due time one hour before the server clock, because the pixel font makes the native datetime control hard to fill.
  - [x] 10.2 `TaskItem.tsx`: show task title, status badge, complete button; strike-through + slime flash on completion
  - [x] 10.3 `TaskList.tsx`: fetch from `/api/tasks`, optimistic update on complete
  - [x] 10.4 `TaskList.tsx`: drag-to-reorder that calls PATCH `sortOrder`
  - [x] 10.5 Keyboard reorder: Up and Down buttons, and Alt+ArrowUp / Alt+ArrowDown, in `TaskItem.tsx`. Both paths use `reorderTask` in `src/components/tasks/order.ts` and then the same `sortOrder` PATCH. Covered by `tests/components/order.test.ts`.
    - Files: `src/components/tasks/TaskList.tsx`, `src/components/tasks/TaskItem.tsx`, `src/components/tasks/TaskForm.tsx`, `src/components/tasks/order.ts`, `tests/components/order.test.ts`
  _Requirements: 1.1, 2.1, 7.1, 14.1, 14.2_

- [x] 11. (Week 2) Implement zombie UI components
  - [x] 11.1 `ZombieSprite.tsx`: render `zombie_walk_N.png` frames with stepped CSS animation
  - [x] 11.2 `ZombieLayer.tsx`: fixed full-viewport overlay; one `ZombieSprite` per active zombie keyed by `taskId`
  - [x] 11.3 Wire `ZombieLayer` to `GameStateProvider` so zombies appear/dissolve reactively
  - [x] 11.4 Respect `prefers-reduced-motion` — static sprite, no walk animation
    - Files: `src/components/zombies/ZombieSprite.tsx`, `src/components/zombies/ZombieLayer.tsx`
  _Requirements: 5.3_

- [x] 12. (Week 2) Extend `src/app/api/cron/decay/route.ts` — overdue-task check
  - _Depends on decay-and-time-travel task 6, which owns the cron route file._
  - [x] 12.1 Load all users' tasks, identify newly overdue ones (`isOverdue` with current time)
  - [x] 12.2 Set `status = "overdue"` on newly overdue tasks, append `TASK_OVERDUE` events
  - [x] 12.3 Count active zombies per user and apply their drain inside the shared catch-up (`catchUp`), which is what `applyPetEvent` uses for a tick
    - Files: `src/app/api/cron/decay/route.ts`
  _Requirements: 5.1, 5.2, 5.4, 6.1, 6.2, 6.3_

- [x] 13. (Week 2) Integration tests for DB task helpers
  - [x] 13.1 Test `getTasks` excludes soft-deleted tasks
  - [x] 13.2 Test `upsertTask` maps TypeScript camelCase to snake_case columns
  - [x] 13.3 Test `appendEvent` inserts correct event_type and user_id
    - Files: `tests/db/tasks.test.ts`
  _Requirements: 12.1, 12.2, 13.1_

## Week 3 (Nov 16–23): AI Breakdown, Subtasks, Nag Integration

- [x] 14. (Week 3) Implement `src/lib/ai/breakdown.ts` and Zod schema
  - [x] 14.1 Implement `buildBreakdownPrompt(task)` — pure prompt builder
  - [x] 14.2 Define `BreakdownResponseSchema` in `src/lib/ai/schemas.ts`
    - Files: `src/lib/ai/breakdown.ts`, `src/lib/ai/schemas.ts`
  _Requirements: 11.2, 11.3_

- [x] 15. (Week 3) Implement `src/app/api/ai/breakdown/route.ts`
  - [x] 15.1 POST: validate request body with Zod (task id)
  - [x] 15.2 Fetch task from DB, build prompt, call LLM
  - [x] 15.3 Validate LLM response with `BreakdownResponseSchema`; return fallback on failure
  - [x] 15.4 On success, create subtask rows via `upsertTask` and set `breakdownSuggested = true`
    - Files: `src/app/api/ai/breakdown/route.ts`
  _Requirements: 11.1–11.4_

- [x] 16. (Week 3) Implement `SubtaskList.tsx` and breakdown UI
  - [x] 16.1 `SubtaskList.tsx`: render subtasks with individual complete checkboxes
  - [x] 16.2 Show "Ask ghost to break this down 👻" button for large tasks with `breakdownSuggested = false`
  - [x] 16.3 Display ghost-voice intro line from breakdown response in `SpeechBubble`
    - Files: `src/components/tasks/SubtaskList.tsx`
  _Requirements: 10.1–10.3, 11.1, 11.4_

- [x] 17. (Week 3) Write unit tests for AI breakdown
  - [x] 17.1 Test `buildBreakdownPrompt` includes title and omits null notes
  - [x] 17.2 Test `BreakdownResponseSchema` rejects < 3 subtasks
  - [x] 17.3 Test `BreakdownResponseSchema` rejects > 7 subtasks
  - [x] 17.4 Write property test for Property P17 (breakdown 3–7 items)
    - Files: `tests/ai/breakdown.test.ts`, `tests/game/invariants.property.ts`
  _Requirements: 11.2, 11.3, P17_

## Week 4 (Nov 23–30): Polish and Accessibility

- [x] 18. (Week 4) Accessibility audit for task components
  - [x] 18.1 Verify `TaskItem` complete button has descriptive `aria-label`
  - [x] 18.2 Verify status badges use text + color (not color alone)
  - [x] 18.3 Verify `TaskForm` inputs have associated `<label>` elements
    - Files: `src/components/tasks/`
  _Requirements: 1.1, 7.1_

- [x] 19. (Week 4) Sound effects for task events
  - [x] 19.1 Trigger `task_complete.ogg` through `SoundProvider` on task completion
  - [x] 19.2 Trigger `zombie_spawn.ogg` when a new zombie is added to `ZombieLayer`
    - Files: `src/components/tasks/TaskItem.tsx`, `src/components/zombies/ZombieLayer.tsx`
  _Requirements: 7.1, 5.3_
