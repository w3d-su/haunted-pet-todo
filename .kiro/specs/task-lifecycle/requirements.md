# Task Lifecycle — Requirements

## Introduction

Tasks are the primary input that drives the Haunted Pet To-Do game loop. A task starts as `todo`, may become `overdue` when its due date passes without completion, and transitions to `done` when the user marks it complete. Overdue tasks spawn exactly one zombie sprite that damages the pet hourly. Completing a task (even an overdue one) feeds the pet, boosts mood, and slays the zombie. Large tasks can be broken into AI-suggested subtasks. All task state is persisted in Supabase with per-user Row Level Security, and all state-change side-effects are captured in an append-only events log.

## Glossary

| Term | Definition |
|---|---|
| **Task** | A unit of work with a title, optional metadata, and a lifecycle status. |
| **TaskStatus** | `"todo"`, `"done"`, or `"overdue"`. |
| **TaskCategory** | Classification string: `"study"`, `"work"`, `"chores"`, `"health"`, `"creative"`, `"other"`. |
| **TaskSize** | Effort estimate: `"small"`, `"medium"`, `"large"`. |
| **Subtask** | A child task linked to a parent task by `parentId`; same status lifecycle. |
| **Zombie** | A sprite spawned by an overdue task that drains pet HP hourly. |
| **ZombieState** | Runtime state of an active zombie tied to one overdue task. |
| **ZOMBIE_DRAIN_PER_HOUR** | HP removed from the pet per zombie per cron tick. |
| **Slay** | Removing a zombie by completing its overdue parent task. |
| **Streak** | Consecutive days the user has completed at least one task. |
| **Events Log** | Append-only `events` table; records all significant game actions. |
| **RLS** | Row Level Security — Supabase policy ensuring users see only their own rows. |
| **LLM Breakdown** | AI-generated list of 3–7 subtasks for a `"large"` task. |
| **NagLevel** | `"gentle"`, `"dramatic"`, or `"haunting"` — escalating nag intensity. |

---

## Requirements

### 1. Task CRUD

**Requirement 1 — Create task**

_User Story_: As a user, I want to create a task with a title, optional notes, category, size estimate, and optional due date so that I can track what I need to do.

**Acceptance Criteria**:

- 1.1: WHEN a user submits a new task via the API, THEN the system SHALL create a row in the `tasks` table with `status = "todo"`, generate a UUID `id`, and record `created_at`.
- 1.2: WHEN a task is created, THEN the system SHALL validate the request body with Zod and reject any request missing a non-empty `title` with HTTP 400.
- 1.3: WHEN a task is created with `category` not in the allowed set, THEN the system SHALL reject the request with HTTP 400.
- 1.4: WHEN a task is created with `size = "large"`, THEN the system SHALL set a flag `breakdownSuggested = false` to indicate subtask breakdown has not yet been offered.
- 1.5: WHEN a task is created, THEN the system SHALL append a `TASK_CREATED` event to the `events` table.

**Requirement 2 — Read tasks**

_User Story_: As a user, I want to retrieve my task list so that I can see what I need to do and what is overdue.

**Acceptance Criteria**:

- 2.1: WHEN a user GETs `/api/tasks`, THEN the system SHALL return only tasks belonging to the authenticated user (enforced by RLS).
- 2.2: WHEN a user GETs `/api/tasks`, THEN the system SHALL include subtasks nested under their parent tasks.
- 2.3: WHERE a task's `dueAt` is in the past AND `status != "done"`, THEN the system SHALL return `status = "overdue"` in the response (computed field or DB-persisted; see §4).

**Requirement 3 — Update task**

_User Story_: As a user, I want to edit a task's title, notes, category, size, or due date so that I can keep it accurate.

**Acceptance Criteria**:

- 3.1: WHEN a PATCH request is received for a task, THEN the system SHALL validate the body with Zod and apply only the provided fields.
- 3.2: WHEN a task's `status` is `"done"`, THEN the system SHALL reject further status changes. The client may set `status` only to `"done"`. An overdue task returns to `"todo"` only when its due time moves to the future. Completion uses `UPDATE ... WHERE status <> 'done'` so a concurrent complete gets HTTP 409.
- 3.3: IF a task's `dueAt` is updated to a future time AND `status` was `"overdue"`, THEN the system SHALL set `status` back to `"todo"` and remove its associated zombie.

**Requirement 4 — Delete task**

_User Story_: As a user, I want to delete a task so that I can remove items I no longer need.

**Acceptance Criteria**:

- 4.1: WHEN a DELETE request is received for a task, THEN the system SHALL soft-delete by setting `deletedAt` timestamp rather than hard-deleting.
- 4.2: WHEN a task is deleted AND it has an active zombie, THEN the system SHALL mark the zombie as slain and append a `ZOMBIE_SLAIN` event.
- 4.3: WHEN a task is deleted, THEN the system SHALL append a `TASK_DELETED` event to `events`.

---

### 2. Overdue Transitions and Zombie Spawning

**Requirement 5 — Overdue transition**

_User Story_: As a user who misses a task's due date, I want the task to visually become overdue so that I know it is affecting my pet.

**Acceptance Criteria**:

- 5.1: WHEN catch-up runs AND a task has `dueAt <= now` AND `status = "todo"`, THEN the system SHALL set `status = "overdue"` with `UPDATE ... WHERE status = 'todo'`. A task that was just completed is left `done`. The transition SHALL NOT upsert the rest of the row.
- 5.2: WHEN a task transitions to `"overdue"`, THEN the system SHALL append an `TASK_OVERDUE` event to `events`.
- 5.3: WHEN a task's `status` becomes `"overdue"`, THEN the system SHALL spawn exactly one `ZombieState` associated with that task's `id`.
- 5.4: WHERE a task already has `status = "overdue"`, WHEN the cron tick runs again, THEN the system SHALL NOT spawn a second zombie for that task.

**Requirement 6 — Zombie HP drain**

_User Story_: As a user with overdue tasks, I want zombies to drain my pet's HP hourly so that procrastination has real consequences.

**Acceptance Criteria**:

- 6.1: WHEN time passes with active zombies, THEN the system SHALL drain HP by `ZOMBIE_DRAIN_PER_HOUR` per zombie per hour, counting only the hours that task was actually overdue. Read/write catch-up does this; the daily cron is the backstop.
- 6.2: WHEN `ZOMBIE_DRAIN` is applied AND `PetState.hp` would drop to 0, THEN the system SHALL set `PetState.status = "dead"` (handled by `applyPetEvent`).
- 6.3: WHEN `PetState.status` is `"dead"` or `"tombstone"`, THEN the system SHALL NOT apply zombie drain (no further damage).

---

### 3. Task Completion and Feeding

**Requirement 7 — Completing a todo task**

_User Story_: As a user who finishes a task on time, I want my pet's hunger and HP restored and its mood boosted so that I feel rewarded.

**Acceptance Criteria**:

- 7.1: WHEN a user marks a `"todo"` task as done, THEN the system SHALL set `status = "done"` and record `completedAt`.
- 7.2: WHEN a `"todo"` task is completed, THEN the system SHALL apply a `TASK_COMPLETED` event to the pet, restoring `TASK_HUNGER_RESTORE` hunger and `TASK_HP_RESTORE` HP, and boosting mood by `TASK_MOOD_BOOST`.
- 7.3: WHEN a `"todo"` task is completed, THEN the system SHALL update `PetState.tasksCompletedTotal` and `currentStreak` (via `applyPetEvent`).
- 7.4: WHEN a `"todo"` task is completed, THEN the system SHALL append a `TASK_COMPLETED` event to the `events` table.

**Requirement 8 — Completing an overdue task (zombie slay)**

_User Story_: As a user who finally finishes an overdue task, I want the zombie to disappear and my pet to receive reduced but real nourishment so that late completion is still rewarded.

**Acceptance Criteria**:

- 8.1: WHEN a user marks an `"overdue"` task as done, THEN the system SHALL set `status = "done"`, slay the associated zombie, and append a `ZOMBIE_SLAIN` event.
- 8.2: WHEN an overdue task is completed, THEN the system SHALL apply a `TASK_COMPLETED` event with `wasOverdue = true`, restoring `OVERDUE_TASK_HUNGER_RESTORE` hunger and `OVERDUE_TASK_HP_RESTORE` HP (reduced values).
- 8.3: WHEN an overdue task is completed, THEN the system SHALL still update `currentStreak` and `tasksCompletedTotal`.

**Requirement 9 — No double-completion**

_User Story_: As a developer, I want the system to reject completing an already-done task so that stats cannot be double-boosted.

**Acceptance Criteria**:

- 9.1: WHEN a `PATCH` request attempts to set `status = "done"` on a task that already has `status = "done"`, THEN the system SHALL return HTTP 409. Claiming the task (`status <> 'done'`), the pet version compare-and-swap, and the event inserts happen in one transaction. A duplicate completion returns 409 as soon as that claim fails. A version miss (`SQLSTATE HA001`) rolls the claim back; the server reloads the pet row, redoes catch-up in memory, and resubmits `complete_task` only (it does not re-enter other write paths). Events that catch-up emitted, including `PET_DIED`, go into that resubmit with the completion events, in order and without duplicates. Two concurrent completes of the same task yield one success and one 409. Concurrent completes of different tasks each reward the pet once. If those version retries are exhausted, the system SHALL return HTTP 503 with `Retry-After: 1`, not HTTP 500.
- 9.2: IF a `TASK_COMPLETED` event is applied via `applyPetEvent` for a `taskId` already recorded on the pet, THEN the system SHALL NOT change `PetState.hp`, `hunger`, or `mood`. Two different tasks that share a completion timestamp and category both count.

---

### 4. Subtasks and AI Breakdown

**Requirement 10 — Subtask creation**

_User Story_: As a user with a large task, I want to create subtasks manually or via AI so that I can tackle it in pieces.

**Acceptance Criteria**:

- 10.1: WHEN a task is created with `parentId` set to another task's `id`, THEN the system SHALL treat it as a subtask of that parent.
- 10.2: WHEN a subtask is completed, THEN the system SHALL NOT automatically complete the parent task.
- 10.3: WHEN all subtasks of a parent task are completed, THEN the system SHALL set the parent task's `allSubtasksDone` flag to `true` and prompt the user to complete the parent.

**Requirement 11 — AI breakdown for large tasks**

_User Story_: As a user with a large task, I want the pet to offer to break it into subtasks using AI so that the task feels less overwhelming.

**Acceptance Criteria**:

- 11.1: WHEN a task with `size = "large"` is created, THEN the system SHALL prompt the user (via speech bubble) to request an AI breakdown.
- 11.2: WHEN the user requests a breakdown via `POST /api/ai/breakdown`, THEN the system SHALL call the LLM with `buildBreakdownPrompt(task)`, validate the response with Zod (`BreakdownResponseSchema`), and return 3–7 subtask titles.
- 11.3: IF the LLM call fails or returns invalid JSON, THEN the system SHALL return a deterministic fallback list of 3 generic subtasks and SHALL NOT crash.
- 11.4: WHEN the breakdown is accepted by the user, THEN the system SHALL create the subtask rows and set `breakdownSuggested = true` on the parent.

---

### 5. Events Log

**Requirement 12 — Append-only events**

_User Story_: As a developer, I want all significant game actions recorded in an append-only log so that the game history is auditable and epitaph generation has rich context.

**Acceptance Criteria**:

- 12.1: WHEN any of `TASK_CREATED`, `TASK_COMPLETED`, `TASK_OVERDUE`, `TASK_DELETED`, `ZOMBIE_SLAIN`, `PET_DIED`, `PET_EVOLVED`, `REBIRTH` events occur, THEN the system SHALL INSERT a row into the `events` table.
- 12.2: WHEN a row is inserted into `events`, THEN the system SHALL record `event_type`, `user_id`, `payload` (jsonb), and `created_at`.
- 12.3: WHERE RLS is enforced on `events`, the system SHALL allow INSERT for authenticated users and SHALL NOT allow DELETE for any user.

---

### 6. Supabase Persistence and RLS

**Requirement 13 — Tasks table RLS**

_User Story_: As a user, I want my tasks to be private to my account so that other users cannot read or modify them.

**Acceptance Criteria**:

- 13.1: WHEN a user performs any SELECT, INSERT, UPDATE, or DELETE on the `tasks` table, THEN the system SHALL enforce `auth.uid() = user_id` via RLS policy.
- 13.2: WHERE RLS is enabled on `tasks`, WHEN an unauthenticated request hits the Supabase client, THEN the system SHALL return no rows.

**Requirement 14 — Task ordering**

_User Story_: As a user, I want to reorder my tasks by dragging so that I can prioritise them visually.

**Acceptance Criteria**:

- 14.1: WHEN a task is created, THEN the system SHALL assign a `sortOrder` integer (default: current max + 1).
- 14.2: WHEN a PATCH request updates `sortOrder` for a task, THEN the system SHALL update only that field without touching other task fields.
