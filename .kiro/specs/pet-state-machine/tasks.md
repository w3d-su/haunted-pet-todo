# Pet State Machine — Implementation Tasks

## Week 1 (Nov 2–9): Scaffold, Core Types, Reducer, Property Tests

- [ ] 1. (Week 1) Set up project scaffold and tooling
  - [ ] 1.1 Initialise Next.js 15 app with TypeScript strict mode (`pnpm create next-app`)
    - Files: `package.json`, `tsconfig.json`, `next.config.ts`
  - [ ] 1.2 Install and configure Tailwind CSS 4, Framer Motion 12, Vitest, fast-check
    - Files: `tailwind.config.ts`, `vitest.config.ts`, `package.json`
  - [ ] 1.3 Add Press Start 2P font via `next/font/google` and define all CSS custom properties
    - Files: `src/app/globals.css`, `src/app/layout.tsx`
  - [ ] 1.4 Create `.env.example` with all required variable placeholders
    - Files: `.env.example`
  - [ ] 1.5 Add `vercel.json` with cron definition for `/api/cron/decay`
    - Files: `vercel.json`
  _Requirements: 13.1, 13.3_

- [ ] 2. (Week 1) Implement `constants.ts` — all game constants
  - [ ] 2.1 Define `MAX_HP`, `INITIAL_HUNGER`, `INITIAL_MOOD`
  - [ ] 2.2 Define `DECAY_RATE_HP`, `DECAY_RATE_HUNGER`, `DECAY_RATE_MOOD`
  - [ ] 2.3 Define evolution thresholds, zombie drain, task reward values
    - Files: `src/lib/game/constants.ts`
  _Requirements: 8.1, 9.1, 10.1_

- [ ] 3. (Week 1) _Dependency: `clock.ts` is owned by the decay-and-time-travel spec (task 1). No work here — import `Clock`, `SystemClock`, and `OffsetClock` from `src/lib/game/clock.ts` once that task is complete._
  _Requirements: 13.3_

- [ ] 4. (Week 1) Implement `events.ts` — `GameEvent` discriminated union
  - [ ] 4.1 Define all event types: `TASK_COMPLETED`, `DECAY_TICK`, `ZOMBIE_DRAIN`, `EPITAPH_READY`, `REBIRTH`, `PET_HATCHED`, `PET_GREW_UP`, `PET_EVOLVED`, `PET_DIED`, `STREAK_BROKEN`
    - Files: `src/lib/game/events.ts`
  _Requirements: 13.1, 13.4_

- [ ] 5. (Week 1) Implement `pet.ts` — PetState type, initialPetState, rebirthPet
  - [ ] 5.1 Define `PetStage`, `PetStatus`, `EvolvedAdultStage` union types
  - [ ] 5.2 Define `TombstoneRecord` interface
  - [ ] 5.3 Define `PetState` interface with all fields
  - [ ] 5.4 Implement `initialPetState(userId, now)` — returns egg at full HP
  - [ ] 5.5 Implement `rebirthPet(state, now)` — pushes to graveyard, resets to egg
    - Files: `src/lib/game/pet.ts`
  _Requirements: 1.1, 7.1, 7.2, 7.3_

- [ ] 6. (Week 1) Implement `evolution.ts` — canEvolve, resolveEvolvedForm
  - [ ] 6.1 Implement `canEvolve(state, now)` checking streak, stage, and hours-as-adult
  - [ ] 6.2 Implement `hourFromTimestamp(ts)` helper
  - [ ] 6.3 Implement `resolveEvolvedForm(state)` with four-way deterministic selection
  - [ ] 6.4 Encode priority order: night_owl > early_bird > scholar > haunter
    - Files: `src/lib/game/evolution.ts`
  _Requirements: 4.1–4.7_

- [ ] 7. (Week 1) Implement `applyPetEvent` reducer in `pet.ts`
  - [ ] 7.1 Add tombstone guard (absorb all events except `REBIRTH`, `EPITAPH_READY`)
  - [ ] 7.2 Add dead guard (absorb all events except `EPITAPH_READY`)
  - [ ] 7.3 Implement `TASK_COMPLETED` branch: hatch egg, update streaks, check grow-up/evolve, restore stats
  - [ ] 7.4 Implement `EPITAPH_READY` branch: set tombstone status + epitaph
  - [ ] 7.5 Implement `REBIRTH` branch: call `rebirthPet`
  - [ ] 7.6 Implement stat clamping helpers `clampHp`, `clampHunger`, `clampMood`
  - [ ] 7.7 Add default branch returning `state` unchanged for unknown events
    - Files: `src/lib/game/pet.ts`
  _Requirements: 2.1, 3.1, 5.1–5.4, 6.1–6.2, 7.1–7.4, 8.1, 8.2, 9.1, 10.1, 11.1–11.3, 13.1–13.5_

- [ ] 8. (Week 1) Write unit tests for `pet.ts` and `evolution.ts`
  - [ ] 8.1 Test `initialPetState` produces egg with MAX_HP
  - [ ] 8.2 Test first `TASK_COMPLETED` transitions egg → hatchling
  - [ ] 8.3 Test `TASK_COMPLETED` at thresholds transitions hatchling → adult
  - [ ] 8.4 Test `DECAY_TICK` driving HP to 0 sets `status = "dead"`
  - [ ] 8.5 Test `EPITAPH_READY` on dead sets `status = "tombstone"`
  - [ ] 8.6 Test `REBIRTH` on tombstone produces egg + graveyard entry
  - [ ] 8.7 Test dead pet ignores `DECAY_TICK`
  - [ ] 8.8 Test tombstone pet ignores `DECAY_TICK`
  - [ ] 8.9 Test `canEvolve` rejects hatchling, low streak, short adult tenure
  - [ ] 8.10 Test `resolveEvolvedForm` for each of the four forms
    - Files: `tests/game/pet.test.ts`, `tests/game/evolution.test.ts`
  _Requirements: 1.1, 2.1, 3.1, 5.1–5.4, 6.1, 7.1–7.4, 13.1–13.5_

- [ ] 9. (Week 1) Write property-based tests for pet state machine invariants
  - [ ] 9.1 Build arbitraries: `arbPetState`, `arbGameEvent`, `arbAlivePetState`, `arbDeadOrTombstoneState`, `arbAdultReadyForEvolution`, `arbTombstoneState`
  - [ ] 9.2 Write property test for Property P1 (HP bounds)
  - [ ] 9.3 Write property test for Property P2 (Hunger bounds)
  - [ ] 9.4 Write property test for Property P3 (Mood bounds)
  - [ ] 9.5 Write property test for Property P4 (dead/tombstone absorbs damage)
  - [ ] 9.6 Write property test for Property P5 (task completion never lowers HP)
  - [ ] 9.7 Write property test for Property P6 (evolution is deterministic)
  - [ ] 9.8 Write property test for Property P7 (rebirth → full HP egg)
  - [ ] 9.9 Write property test for Property P8 (graveyard append-only)
  - [ ] 9.10 Write property test for Property P9 (applyPetEvent is pure/deterministic)
  - [ ] 9.11 Write property test for Property P10 (stat clamp is idempotent)
    - Files: `tests/game/invariants.property.ts`
  _Requirements: P1–P10 (all requirements transitively)_

- [ ] 10. (Week 1) Create Supabase migration for `pet_state` table
  - [ ] 10.1 Add `pet_state` table DDL (including CHECK constraints) to `0001_init.sql`
  - [ ] 10.2 Add RLS policy (`users manage own pet`) to `0002_rls.sql`
    - Files: `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_rls.sql`
  _Requirements: 1.1 (persistence)_

- [ ] 11. (Week 1) Implement `src/lib/db/pet.ts` — DB helpers
  - [ ] 11.1 Implement `getPetState(supabase, userId)` — fetches and Zod-validates row
  - [ ] 11.2 Implement `savePetState(supabase, state)` — upserts pet state row
  - [ ] 11.3 Define Zod schema `PetStateRowSchema` for Supabase row shape
    - Files: `src/lib/db/pet.ts`
  _Requirements: 13.1 (persistence layer)_

## Week 2 (Nov 9–16): Pet API, Basic UI

- [ ] 12. (Week 2) Implement `src/app/api/pet/route.ts` — pet state API
  - [ ] 12.1 GET: fetch pet state for authenticated user
  - [ ] 12.2 PATCH: accept `GameEvent`, call `applyPetEvent`, save result
  - [ ] 12.3 Validate request body with Zod before processing
    - Files: `src/app/api/pet/route.ts`
  _Requirements: 13.1, 13.3_

- [ ] 13. (Week 2) Implement `PetSprite.tsx` and `PetStats.tsx` components
  - [ ] 13.1 `PetSprite.tsx`: map `PetStage` → correct sprite filename and alt text
  - [ ] 13.2 `PetSprite.tsx`: apply `pixel-art` CSS class and correct Tailwind size class
  - [ ] 13.3 `PetStats.tsx`: render HP / Hunger / Mood `StatBar` components with labels
  - [ ] 13.4 Hide stat bars for `egg` stage
    - Files: `src/components/pet/PetSprite.tsx`, `src/components/pet/PetStats.tsx`
  _Requirements: 1.3, 2.2, 3.2, 3.3_

- [ ] 14. (Week 2) Implement `Tombstone.tsx` and `EggHatch.tsx` components
  - [ ] 14.1 `Tombstone.tsx`: display tombstone sprite, overlay epitaph, show "New Egg" button after 1.5s
  - [ ] 14.2 `EggHatch.tsx`: shake → crack → dissolve animation (0.8s, Framer Motion stepped)
  - [ ] 14.3 Both components: respect `prefers-reduced-motion` via `useReducedMotion()`
    - Files: `src/components/pet/Tombstone.tsx`, `src/components/pet/EggHatch.tsx`
  _Requirements: 6.4, 7.1–7.4_

## Week 3 (Nov 16–23): LLM Epitaphs, Evolution UI, Graveyard

- [ ] 15. (Week 3) Implement epitaph prompt builder and API route
  - [ ] 15.1 Implement `buildEpitaphPrompt(pet, tasks)` in `src/lib/ai/epitaph.ts`
  - [ ] 15.2 Implement `src/app/api/ai/epitaph/route.ts` with LLM call + Zod validation + fallback
  - [ ] 15.3 On success, POST to `/api/pet` with `EPITAPH_READY` event
    - Files: `src/lib/ai/epitaph.ts`, `src/app/api/ai/epitaph/route.ts`
  _Requirements: 6.1, 6.2_

- [ ] 16. (Week 3) Wire evolution trigger into `GameStateProvider`
  - [ ] 16.1 After each `TASK_COMPLETED` event response, check if `canEvolve` is now true
  - [ ] 16.2 If so, dispatch `PET_EVOLVED` event and trigger evolution animation
    - Files: `src/components/providers/GameStateProvider.tsx`
  _Requirements: 4.1–4.7_

## Week 4 (Nov 23–30): Polish, Accessibility, Deploy

- [ ] 17. (Week 4) Accessibility audit for pet components
  - [ ] 17.1 Verify all `<img>` sprites have descriptive `alt` text per visual-style checklist
  - [ ] 17.2 Verify focus rings on `PixelButton` in Tombstone
  - [ ] 17.3 Verify epitaph contrast passes WCAG AA
    - Files: `src/components/pet/`
  _Requirements: 6.4_

- [ ] 18. (Week 4) Integration test for DB pet helpers
  - [ ] 18.1 Mock Supabase client and test `getPetState` handles missing row gracefully
  - [ ] 18.2 Test `savePetState` correctly maps TypeScript fields to snake_case columns
    - Files: `tests/db/pet.test.ts`
  _Requirements: 7.1 (graveyard persistence)_
