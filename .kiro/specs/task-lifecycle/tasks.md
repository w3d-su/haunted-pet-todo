# Task Lifecycle — Implementation Tasks

## Week 1 (Nov 2–9): Core Task Types, Pure Helpers, DB Migration, DB Helpers, CRUD API

- [ ] 1. (Week 1) Implement `src/lib/game/tasks.ts` — Task types and pure helpers
  - [ ] 1.1 Define `TaskStatus`, `TaskCategory`, `TaskSize` union types
  - [ ] 1.2 Define `Task` interface with all fields
  - [ ] 1.3 Implement `isOverdue(task, now)` — pure, clock-injectable
  - [ ] 1.4 Implement `taskCompletionDeltas(task)` — returns hunger/HP/mood deltas
  - [ ] 1.5 Implement `makeTaskCompletedEvent(task, now)` — produces `TASK_COMPLETED` event
    - Files: `src/lib/game/tasks.ts`
  _Requirements: 5.1, 7.2, 8.2, 9.2_

- [ ] 2. (Week 1) Implement `src/lib/game/zombies.ts` — ZombieState and pure helpers
  - [ ] 2.1 Define `ZombieState` interface
  - [ ] 2.2 Implement `activeZombies(tasks, now)` — returns one zombie per overdue task
  - [ ] 2.3 Implement `makeZombieDrainEvent(count, fromTime, toTime)`
  - [ ] 2.4 Implement `zombieDamage(count, hours)` — linear drain calculation
    - Files: `src/lib/game/zombies.ts`
  _Requirements: 5.3, 5.4, 6.1_

- [ ] 3. (Week 1) Wire task completion into `applyPetEvent` in `pet.ts`
  - [ ] 3.1 In `applyTaskCompleted` helper: apply hunger/HP/mood deltas using `taskCompletionDeltas` logic
  - [ ] 3.2 Guard against completing an already-done task (return state unchanged if `wasOverdue` flag mismatch)
  - [ ] 3.3 Update `tasksCompletedTotal`, streak, and `recentCompletionTimestamps`/`Categories`
    - Files: `src/lib/game/pet.ts`
  _Requirements: 7.2, 7.3, 8.2, 8.3, 9.2_

- [ ] 4. (Week 1) Write unit tests for task pure helpers
  - [ ] 4.1 Test `isOverdue` for all status × dueAt combinations
  - [ ] 4.2 Test `taskCompletionDeltas` returns reduced values for overdue tasks
  - [ ] 4.3 Test `activeZombies` — one zombie per overdue, none for done/todo without past dueAt
  - [ ] 4.4 Test `zombieDamage` linearity
    - Files: `tests/game/tasks.test.ts`, `tests/game/zombies.test.ts`
  _Requirements: 5.3, 5.4, 7.2, 8.2_

- [ ] 5. (Week 1) Write property-based tests for task invariants
  - [ ] 5.1 Build arbitraries: `arbTask`, `arbOverdueTask`, `arbDoneTask`, `arbTaskCompletedEvent`
  - [ ] 5.2 Write property test for Property P11 (one zombie per overdue task)
  - [ ] 5.3 Write property test for Property P12 (done tasks have no zombie)
  - [ ] 5.4 Write property test for Property P13 (completion never lowers HP)
  - [ ] 5.5 Write property test for Property P14 (double-complete is no-op)
  - [ ] 5.6 Write property test for Property P15 (zombieDamage linear scaling)
  - [ ] 5.7 Write property test for Property P16 (done task never isOverdue)
    - Files: `tests/game/invariants.property.ts`
  _Requirements: P11–P16 (requirements 5.3, 5.4, 7.2, 8.2, 9.2)_

- [ ] 6. (Week 1) Create Supabase migrations for `tasks` and `events` tables
  - [ ] 6.1 Add `tasks` table DDL with all columns, CHECK constraints, and indexes to `0001_init.sql`
  - [ ] 6.2 Add `events` table DDL to `0001_init.sql`
  - [ ] 6.3 Add RLS policies for `tasks` (all operations: `auth.uid() = user_id`) to `0002_rls.sql`
  - [ ] 6.4 Add RLS policies for `events` (INSERT only; no DELETE) to `0002_rls.sql`
    - Files: `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_rls.sql`
  _Requirements: 12.3, 13.1, 13.2_

- [ ] 7. (Week 1) Implement `src/lib/db/tasks.ts` — task DB helpers
  - [ ] 7.1 Implement `getTasks(supabase, userId)` — fetches non-deleted tasks, Zod-validates
  - [ ] 7.2 Implement `upsertTask(supabase, task)` — creates or updates task row
  - [ ] 7.3 Implement `softDeleteTask(supabase, taskId, userId)` — sets `deleted_at`
  - [ ] 7.4 Define `TaskRowSchema` for Supabase row → TypeScript Task mapping
    - Files: `src/lib/db/tasks.ts`
  _Requirements: 1.1, 4.1, 13.1_

- [ ] 8. (Week 1) Implement `src/lib/db/events.ts` — event append helper
  - [ ] 8.1 Implement `appendEvent(supabase, userId, eventType, payload)` — INSERT into events
    - Files: `src/lib/db/events.ts`
  _Requirements: 12.1, 12.2_

- [ ] 9. (Week 1) Implement `src/app/api/tasks/route.ts` — CRUD API
  - [ ] 9.1 GET handler: return tasks for authenticated user, nest subtasks under parents
  - [ ] 9.2 POST handler: validate body with Zod, create task, append `TASK_CREATED` event
  - [ ] 9.3 PATCH handler: validate body, handle `status = "done"` completion cascade (apply `TASK_COMPLETED` event to pet, slay zombie if overdue, append event)
  - [ ] 9.4 PATCH handler: handle `status = "overdue"` guard (reject 409 if already done)
  - [ ] 9.5 PATCH handler: handle `sortOrder` update
  - [ ] 9.6 PATCH handler: handle `dueAt` update with overdue-to-todo reversal if future date
  - [ ] 9.7 DELETE handler: soft-delete task, slay zombie if overdue, append `TASK_DELETED` event
    - Files: `src/app/api/tasks/route.ts`
  _Requirements: 1.1–1.5, 2.1–2.3, 3.1–3.3, 4.1–4.3, 7.1–7.4, 8.1–8.3, 9.1, 14.1, 14.2_

## Week 2 (Nov 9–16): Unstyled Task UI, Zombie UI

- [ ] 10. (Week 2) Implement `TaskList.tsx`, `TaskItem.tsx`, `TaskForm.tsx`
  - [ ] 10.1 `TaskForm.tsx`: controlled form with title, category select, size select, optional due date; client-side Zod validation
  - [ ] 10.2 `TaskItem.tsx`: show task title, status badge, complete button; strike-through + slime flash on completion
  - [ ] 10.3 `TaskList.tsx`: fetch from `/api/tasks`, optimistic update on complete
  - [ ] 10.4 `TaskList.tsx`: drag-to-reorder that calls PATCH `sortOrder`
    - Files: `src/components/tasks/TaskList.tsx`, `src/components/tasks/TaskItem.tsx`, `src/components/tasks/TaskForm.tsx`
  _Requirements: 1.1, 2.1, 7.1, 14.1, 14.2_

- [ ] 11. (Week 2) Implement zombie UI components
  - [ ] 11.1 `ZombieSprite.tsx`: render `zombie_walk_N.png` frames with stepped CSS animation
  - [ ] 11.2 `ZombieLayer.tsx`: fixed full-viewport overlay; one `ZombieSprite` per active zombie keyed by `taskId`
  - [ ] 11.3 Wire `ZombieLayer` to `GameStateProvider` so zombies appear/dissolve reactively
  - [ ] 11.4 Respect `prefers-reduced-motion` — static sprite, no walk animation
    - Files: `src/components/zombies/ZombieSprite.tsx`, `src/components/zombies/ZombieLayer.tsx`
  _Requirements: 5.3_

- [ ] 12. (Week 2) Extend `src/app/api/cron/decay/route.ts` — overdue-task check
  - _Depends on decay-and-time-travel task 6, which owns the cron route file._
  - [ ] 12.1 Load all users' tasks, identify newly overdue ones (`isOverdue` with current time)
  - [ ] 12.2 Set `status = "overdue"` on newly overdue tasks, append `TASK_OVERDUE` events
  - [ ] 12.3 Count active zombies per user, apply `ZOMBIE_DRAIN` event to each pet via `applyPetEvent`
    - Files: `src/app/api/cron/decay/route.ts`
  _Requirements: 5.1, 5.2, 5.4, 6.1, 6.2, 6.3_

- [ ] 13. (Week 2) Integration tests for DB task helpers
  - [ ] 13.1 Test `getTasks` excludes soft-deleted tasks
  - [ ] 13.2 Test `upsertTask` maps TypeScript camelCase to snake_case columns
  - [ ] 13.3 Test `appendEvent` inserts correct event_type and user_id
    - Files: `tests/db/tasks.test.ts`
  _Requirements: 12.1, 12.2, 13.1_

## Week 3 (Nov 16–23): AI Breakdown, Subtasks, Nag Integration

- [ ] 14. (Week 3) Implement `src/lib/ai/breakdown.ts` and Zod schema
  - [ ] 14.1 Implement `buildBreakdownPrompt(task)` — pure prompt builder
  - [ ] 14.2 Define `BreakdownResponseSchema` in `src/lib/ai/schemas.ts`
    - Files: `src/lib/ai/breakdown.ts`, `src/lib/ai/schemas.ts`
  _Requirements: 11.2, 11.3_

- [ ] 15. (Week 3) Implement `src/app/api/ai/breakdown/route.ts`
  - [ ] 15.1 POST: validate request body with Zod (task id)
  - [ ] 15.2 Fetch task from DB, build prompt, call LLM
  - [ ] 15.3 Validate LLM response with `BreakdownResponseSchema`; return fallback on failure
  - [ ] 15.4 On success, create subtask rows via `upsertTask` and set `breakdownSuggested = true`
    - Files: `src/app/api/ai/breakdown/route.ts`
  _Requirements: 11.1–11.4_

- [ ] 16. (Week 3) Implement `SubtaskList.tsx` and breakdown UI
  - [ ] 16.1 `SubtaskList.tsx`: render subtasks with individual complete checkboxes
  - [ ] 16.2 Show "Ask ghost to break this down 👻" button for large tasks with `breakdownSuggested = false`
  - [ ] 16.3 Display ghost-voice intro line from breakdown response in `SpeechBubble`
    - Files: `src/components/tasks/SubtaskList.tsx`
  _Requirements: 10.1–10.3, 11.1, 11.4_

- [ ] 17. (Week 3) Write unit tests for AI breakdown
  - [ ] 17.1 Test `buildBreakdownPrompt` includes title and omits null notes
  - [ ] 17.2 Test `BreakdownResponseSchema` rejects < 3 subtasks
  - [ ] 17.3 Test `BreakdownResponseSchema` rejects > 7 subtasks
  - [ ] 17.4 Write property test for Property P17 (breakdown 3–7 items)
    - Files: `tests/ai/breakdown.test.ts`, `tests/game/invariants.property.ts`
  _Requirements: 11.2, 11.3, P17_

## Week 4 (Nov 23–30): Polish and Accessibility

- [ ] 18. (Week 4) Accessibility audit for task components
  - [ ] 18.1 Verify `TaskItem` complete button has descriptive `aria-label`
  - [ ] 18.2 Verify status badges use text + color (not color alone)
  - [ ] 18.3 Verify `TaskForm` inputs have associated `<label>` elements
    - Files: `src/components/tasks/`
  _Requirements: 1.1, 7.1_

- [ ] 19. (Week 4) Sound effects for task events
  - [ ] 19.1 Trigger `task_complete.ogg` through `SoundProvider` on task completion
  - [ ] 19.2 Trigger `zombie_spawn.ogg` when a new zombie is added to `ZombieLayer`
    - Files: `src/components/tasks/TaskItem.tsx`, `src/components/zombies/ZombieLayer.tsx`
  _Requirements: 7.1, 5.3_
