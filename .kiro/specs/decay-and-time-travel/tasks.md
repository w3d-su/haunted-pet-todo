# Decay and Time Travel — Implementation Tasks

## Week 1 (Nov 2–9): Clock Interface, Decay Function, Property Tests

- [x] 1. (Week 1) Implement `src/lib/game/clock.ts` — Clock interface and implementations
  - [x] 1.1 Define `Clock` interface with `now(): number`
  - [x] 1.2 Implement `SystemClock` in `src/lib/server/clock.ts` (the only wall-clock call site; not inside `src/lib/game/`)
  - [x] 1.3 Implement `OffsetClock` with mutable `offsetMs`, `advance(ms)`, and `reset()`
  - [x] 1.4 Add guard in `OffsetClock.advance` that throws on negative input
    - Files: `src/lib/game/clock.ts`
  _Requirements: 1.1–1.5_

- [x] 2. (Week 1) Implement `src/lib/game/decay.ts` — decayStats and helpers
  - [x] 2.1 Implement `decayAmount(ratePerHour, elapsedHours)` — pure linear calculation
  - [x] 2.2 Implement `decayStats(pet, now)` with all guards (dead/tombstone, egg HP immunity, time-reversal, zero-elapsed)
  - [x] 2.3 Apply streak-break detection inside `decayStats` when `timeSinceCompletion > STREAK_BREAK_HOURS * 3_600_000`
  - [x] 2.4 Implement `decayRange(pet, fromMs, toMs)` convenience wrapper for tests
  - [x] 2.5 Clamp all outputs to their valid ranges before returning
    - Files: `src/lib/game/decay.ts`
  _Requirements: 3.1–3.6, 4.1–4.3, 11.1–11.3_

- [x] 3. (Week 1) Wire `DECAY_TICK` event through `applyPetEvent` in `pet.ts`
  - [x] 3.1 Add `applyDecayTick` helper that calls `decayStats(state, event.toTime)` and checks for HP = 0 death trigger
  - [x] 3.2 When HP reaches 0, set `status = "dead"` in returned state (`stage` is NOT changed — it stays at the pet's last living stage so the tombstone renderer knows which form died)
    - Files: `src/lib/game/pet.ts`
  _Requirements: 3.1, 5.1_

- [x] 4. (Week 1) Write unit tests for `decay.ts` and `clock.ts`
  - [x] 4.1 Test `decayStats` with dead/tombstone returns unchanged state
  - [x] 4.2 Test `decayStats` with egg: HP unchanged, hunger/mood decay
  - [x] 4.3 Test `decayStats` with `now = lastTickAt` returns identical state
  - [x] 4.4 Test `decayStats` with `now < lastTickAt` returns identical state
  - [x] 4.5 Test `decayStats` after 1h reduces stats by correct amount
  - [x] 4.6 Test HP clamp at 0 when decay exceeds remaining HP
  - [x] 4.7 Test streak break sets streak to 0 and applies mood penalty
  - [x] 4.8 Test `OffsetClock.advance` updates `now()` correctly
  - [x] 4.9 Test `OffsetClock.advance(-1)` throws
  - [x] 4.10 Test `OffsetClock.reset` returns offset to 0
    - Files: `tests/game/decay.test.ts`
  _Requirements: 1.3, 1.4, 3.1–3.6, 4.1–4.3_

- [x] 5. (Week 1) Write property-based tests for decay invariants
  - [x] 5.1 Build arbitraries: `arbAlivePetState`, `arbDeadOrTombstoneState`, `arbEggState`, `arbThreeOrderedTimestamps`
  - [x] 5.2 Write property test for Property P18 (HP bounds after N decay calls)
  - [x] 5.3 Write property test for Property P19 (decay additivity over split intervals)
  - [x] 5.4 Write property test for Property P21 (dead/tombstone immune to decay)
  - [x] 5.5 Write property test for Property P22 (egg HP immune)
  - [x] 5.6 Write property test for Property P23 (decay is monotone non-increasing)
  - [x] 5.7 Write property test for Property P24 (OffsetClock is monotone)
  - [x] 5.8 Write property test for Property P25 (zero elapsed = identity)
  - [x] 5.9 Write property test for Property P26 (hunger + mood in [0, 100])
    - Files: `tests/game/invariants.property.ts`
  _Requirements: P18, P19, P21–P26 (P20 is Week 2 task 10)_

## Week 2 (Nov 9–16): Cron Job, Fast-Forward API, DemoControls

- [ ] 6. (Week 2) Implement Vercel Cron job handler `src/app/api/cron/decay/route.ts`
  - [x] 6.1 Add `Authorization: Bearer <CRON_SECRET>` verification (return 401 on failure). Compare with a constant-time hash, and reject an empty secret.
  - [x] 6.2 Fetch all users' `PetState` and `Task` lists via service role client
  - [x] 6.3 For each user: run the same catch-up as a read (`syncWorld` / `catchUp`), which marks newly overdue tasks and applies decay plus zombie drain
  - [x] 6.4 Zombie drain is part of that catch-up (eggs still take none), not a second copy of the reducer
  - [x] 6.5 Save updated `PetState` and append events to `events` table
  - [x] 6.6 If pet newly dead, count the death. The epitaph route runs when the tombstone is viewed, not inside the cron, so a crowd of deaths cannot call the model.
  - [x] 6.7 Return HTTP 200 with `{ processed: N, deaths: K }` summary
    - Files: `src/app/api/cron/decay/route.ts`
  _Requirements: 5.1, 5.2, 6.1–6.5_

- [x] 7. (Week 2) Add cron schedule to `vercel.json`
  - [x] 7.1 Add `"crons": [{ "path": "/api/cron/decay", "schedule": "0 8 * * *" }]` (daily; Hobby rejects hourly) only once `src/app/api/cron/decay/route.ts` exists. Do not point `vercel.json` at a missing route.
    - Files: `vercel.json`
  _Requirements: 6.5_

- [x] 8. (Week 2) Implement `src/app/api/demo/fast-forward/route.ts`
  - [x] 8.1 Require auth. Return 403 unless server `DEMO_MODE === "true"`. Add `N` hours to `pet_state.clock_offset_ms`; do not push `lastTickAt` past the effective clock.
  - [x] 8.2 Parse request body with `FastForwardBodySchema` (Zod); return 400 if invalid
  - [x] 8.3 Implement `reset: true` branch: set `clock_offset_ms` to 0 and clamp future clock cursors (`lastTickAt`, completion times, `createdAt`, `deletedAt`) to the new effective now. Due dates stay; they are deadlines, not cursors.
  - [x] 8.4 Implement `hours: N` branch: add N hours to `clock_offset_ms`, then run the same catch-up as a read
  - [x] 8.5 That catch-up is `syncWorld` / `catchUp` / `runOneTick`, the same path as the cron. One catch-up after the offset change, not an HTTP-side loop (requirement 7.2).
  - [x] 8.6 Return updated `PetState` after all ticks
    - Files: `src/app/api/demo/fast-forward/route.ts`
  _Requirements: 7.1–7.5_

- [x] 9. (Week 2) Implement `DemoControls.tsx` component
  - [x] 9.1 Render only when the server reports `DEMO_MODE === "true"` (not a `NEXT_PUBLIC_` env flag)
  - [x] 9.2 Render "+1h", "+6h", "+24h", and "Reset" `PixelButton` components
  - [x] 9.3 Each button calls `POST /api/demo/fast-forward` with the correct body and triggers full data refresh on success
  - [x] 9.4 Show a loading indicator while the request is in-flight; disable buttons during loading
  - [x] 9.5 Respect `prefers-reduced-motion` for any entry animation
    - Files: `src/components/ui/DemoControls.tsx`
  _Requirements: 8.1–8.4_

- [x] 10. (Week 2) Write property test for Property P20 (fast-forward N hours = N ticks)
  - [x] 10.1 `runOneTick(pet, tasks, now)` in `src/lib/game/pet.ts` returns `catchUp(...).state`. It lives next to catch-up so `decay.ts` does not import the reducer (that import would cycle).
  - [x] 10.2 Write PBT: for N ∈ {1, 6, 24}, N hourly `runOneTick` calls match one N-hour `runOneTick` within ±1. With no zombie during the window (including a todo that comes due inside it) and the pet still alive, that also matches `decayStats` within ±1. Eggs keep their HP.
    - Files: `tests/game/invariants.property.ts`, `src/lib/game/pet.ts`
  _Requirements: 7.4, P20_

## Week 3 (Nov 16–23): Web Push, Habitual-Time Reminders

- [x] 11. (Week 3) Implement `src/lib/push/vapid.ts` and `notify.ts`
  - [x] 11.1 Implement `getVapidKeys()` reading from `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`
  - [x] 11.2 Implement `sendPushNotification(subscription, payload)` using `web-push` package
  - [x] 11.3 Wrap `webpush.sendNotification` in try/catch; log errors without throwing. A 404 or 410 is returned as `gone` so the cron deletes that row (requirement 9.3).
    - Files: `src/lib/push/vapid.ts`, `src/lib/push/notify.ts`
  _Requirements: 10.3, 10.4_

- [x] 12. (Week 3) Implement push subscription API `src/app/api/push/route.ts`
  - [x] 12.1 POST: validate `PushSubscription` body with Zod, upsert into `push_subscriptions` table
  - [x] 12.2 DELETE: remove subscription row for authenticated user
    - Files: `src/app/api/push/route.ts`
  _Requirements: 9.1–9.3_

- [x] 13. (Week 3) Add Supabase migration for `push_subscriptions` table
  - [x] 13.1 Add table DDL and a select-only RLS policy (`auth.uid() = user_id`) to `0004_push.sql`. `0003_events_seq.sql` already exists. Writes stay on the service role.
    - Files: `supabase/migrations/0003_push.sql`
  _Requirements: 9.2, 9.3_

- [x] 14. (Week 3) Add a once-a-day nag to the cron handler
  - [x] 14.1 Hobby only allows a daily cron, so there is no habitual-hour send. `claim_nag_day` stores the user's local day and a second run the same day does not send.
  - [x] 14.2 In the cron handler: send when the user has an open task, nothing was completed today in the pet's time zone, and the day was just claimed
  - [x] 14.3 Build the nag with `buildNagPrompt` (from `src/lib/ai/nag.ts`) for the pet's `NagLevel`
    - Files: `src/lib/db/nag.ts`, `src/app/api/cron/decay/route.ts`, `supabase/migrations/0005_nag_and_budget.sql`
  _Requirements: 10.1–10.4_

- [x] 15. (Week 3) Add push subscription UI in `GameStateProvider`
  - [x] 15.1 Request notification permission on first user interaction after sign-in
  - [x] 15.2 POST resulting `PushSubscription` to `/api/push`
    - Files: `src/components/providers/GameStateProvider.tsx`
  _Requirements: 9.1_

## Week 4 (Nov 23–30): Polish, Accessibility, Final Tests

- [x] 16. (Week 4) Fix and verify `no-date-now-guard` hook
  - [x] 16.1 Confirm hook reads file path from stdin JSON (`event.file_path`) via Node, not `$KIRO_FILE_PATH`
  - [x] 16.2 Confirm violation message is written to stderr (exit 1) not stdout
  - [ ] 16.3 Manually test hook by temporarily adding `Date.now()` to a game file, saving, and observing hook output. Still needs a live test in Kiro.
    - Files: `.kiro/hooks/no-date-now-guard.json`
  _Requirements: 2.1, 2.2_

- [x] 17. (Week 4) Accessibility and UX for DemoControls
  - [x] 17.1 Add `aria-label` to each button describing the action ("Advance time by 1 hour")
  - [x] 17.2 Add a visually hidden live region that announces the clock offset after fast-forward
    - Files: `src/components/ui/DemoControls.tsx`
  _Requirements: 8.3, 8.4_

- [x] 18. (Week 4) End-to-end smoke test of full decay → death loop
  - [x] 18.1 Use `OffsetClock` and a mock Supabase to run 24 one-hour ticks starting from a near-dead pet
  - [x] 18.2 Verify pet status reaches `"dead"` at the expected tick
  - [x] 18.3 Verify stats never go out of bounds at any intermediate tick
    - Files: `tests/game/decay.test.ts`
  _Requirements: 3.1–3.6, 5.1_
