---
inclusion: always
---

# Haunted Pet To-Do — Product Steering

## Vision

A spooky, gamified to-do app where your productivity directly sustains a little ghost pet. Do your work and watch it thrive; ignore it and watch zombies rise. It turns the universal guilt of an untouched task list into a darkly delightful game loop.

## Target Users

Students and chronic procrastinators who need external pressure, entertainment, and accountability. They respond better to playful horror than to another clean-minimalist productivity app.

## Core Game Loop

1. User creates tasks.
2. Pet starts as an egg → hatches into a hatchling → evolves into an adult form.
3. Completing tasks feeds the pet (restores Hunger, boosts Mood).
4. Every hour the pet's HP, Hunger, and Mood decay unless tasks are completed.
5. Overdue tasks spawn zombie sprites that crawl across the screen and drain the pet's HP hourly.
6. Pet HP reaching 0 → pet dies → becomes a tombstone.
7. An LLM writes a darkly funny epitaph referencing the actual procrastinated tasks.
8. A new egg appears and the cycle begins again.
9. Completion streaks cause the adult form to evolve; the evolved form depends on time-of-day and the category of tasks completed.

## Feature List

### MVP (must ship for judging)
- [x] Task CRUD (create, complete, delete, reorder)
- [x] Pet life-stage rendering: egg / hatchling / adult (one base adult form)
- [x] Daily stat decay (HP, Hunger, Mood) via Vercel Cron job
- [x] Overdue tasks → zombie sprites crawl on screen
- [x] Zombie HP drain per hour
- [x] Pet death → tombstone + LLM epitaph
- [x] Rebirth: new egg after tombstone is shown
- [ ] Pet AI personality: nags via toast/speech-bubble, breaks tasks into subtasks, suggests reminder times
- [x] Developer time fast-forward control (visible only in dev/demo mode)
- [ ] Web Push notification reminders at user's habitual times
- [x] Supabase persistence: tasks, pet state, events log
- [ ] Pixel-art CRT visual style + spooky sound effects (muted by default)
- [x] Vercel deploy

### Stretch Goals (post-MVP / nice to have)
- [ ] Multiple evolved adult forms (time-of-day × task-category matrix)
- [ ] Zombie boss fight mode (clear 5 overdue tasks in a row to defeat the boss)
- [ ] Leaderboard / friend comparison
- [ ] Custom pet naming
- [ ] Seasonal palette variants (beyond Halloween)
- [ ] Task import from calendar
- [ ] Mood-based playlist integration

## Pet Life Stages

The canonical stage names used everywhere in code, database, and UI:

| Stage constant | Display name | Condition |
|---|---|---|
| `egg` | Egg | Freshly hatched (first pet or after rebirth) |
| `hatchling` | Hatchling | First task completed |
| `adult` | Adult | 7+ tasks completed total, streak ≥ 3 |
| `adult_night_owl` | Night Owl | Evolved; majority of last 10 completions between 22:00–05:59 |
| `adult_early_bird` | Early Bird | Evolved; majority of last 10 completions between 06:00–10:59. 05:00–05:59 counts as night owl |
| `adult_scholar` | Scholar | Evolved; majority of last 10 completions in `study` or `work` category |
| `adult_haunter` | Haunter | Evolved; default form when no other criterion is met |

> **Note**: Life stages (`PetStage`) are orthogonal to liveness (`PetStatus`). A pet in any stage above can have `status = "alive"`, `"dead"`, or `"tombstone"`. The stage is preserved through death so the tombstone can show which form the pet was in.

## Pet Status Values

| Status | Meaning |
|---|---|
| `alive` | HP > 0, normal gameplay |
| `dead` | HP reached 0 this tick; trigger epitaph generation |
| `tombstone` | Epitaph generated; new egg timer started |

## Task Status Values

| Status | Meaning |
|---|---|
| `todo` | Not yet done, due date in the future (or no due date) |
| `done` | Completed by the user |
| `overdue` | Past due date and not completed; spawns a zombie |

## Hackathon Constraints

- **New project**: all code written during the hackathon window. No pre-existing apps.
- **Public repo**: OSI-approved open-source license (MIT) in root LICENSE file.
- **Committed .kiro/**: the `.kiro/` directory (steering, hooks, specs) must be committed and visible in the public repo — it is part of the judging submission.
- **3-minute demo**: the demo video must fit in 3 minutes. Prioritize the core loop (create task → pet reacts → overdue → zombie → death → epitaph → rebirth) over stretch features.
- **Fast-forward demo control**: `DemoControls` is shown only when the server env `DEMO_MODE=true`. It advances that user's `clock_offset_ms` by 1 h, 6 h, or 24 h and then runs the same catch-up as a normal read. The client cannot turn this on with a public env var.

## "Done" Criteria for Judging

| Criterion | Target |
|---|---|
| **Impact** | Core loop is playable end-to-end; a procrastinator can understand the stakes in < 30 s |
| **Technical Implementation** | No `Date.now()` in `src/lib/game/`, all LLM calls server-side, RLS on Supabase tables, property-based tests passing |
| **Design** | CRT scanline aesthetic, pixel sprites, Halloween palette, sound effects, animations feel snappy and spooky |
| **Innovation** | LLM-generated epitaphs reference the actual procrastinated tasks; pet personality feels alive and distinct per life stage |
| **Presentation** | 3-min demo covers full loop; README shows screenshots; fast-forward works live |
