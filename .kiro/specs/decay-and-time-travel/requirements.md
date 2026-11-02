# Decay and Time Travel — Requirements

## Introduction

Decay is the heartbeat of the Haunted Pet To-Do game loop. Every hour without task completions, the pet's HP, Hunger, and Mood erode. Zombie-carrying overdue tasks add additional HP drain. This spec defines how decay is computed as a pure function of elapsed time, how the clock is injected so game logic never reads the wall clock directly, how a developer-only "time fast-forward" control replays decay for demo purposes, and how Web Push notifications are scheduled based on the user's habitual completion times.

The central correctness guarantee is **additivity**: applying decay over interval `[t0, t1]` followed by `[t1, t2]` must produce the same state as applying it once over `[t0, t2]`.

## Glossary

| Term | Definition |
|---|---|
| **Clock** | Interface `{ now(): number }` — sole point of time injection for game logic. |
| **SystemClock** | Reads `Date.now()`; used only in API route bootstrapping, never in pure game logic. |
| **OffsetClock** | A clock backed by a fixed base + mutable offset, used for testing and fast-forward. |
| **Decay** | Per-hour reduction of HP, Hunger, and Mood when the pet is alive. |
| **DECAY_RATE_HP** | HP reduction per hour (from `constants.ts`). |
| **DECAY_RATE_HUNGER** | Hunger reduction per hour. |
| **DECAY_RATE_MOOD** | Mood reduction per hour. |
| **Catch-up** | Computing accumulated decay when the server restarts or the cron job runs after being missed. |
| **Fast-forward** | Developer/demo feature that advances the clock offset and replays game logic. |
| **DEMO_MODE** | Server-only env var. `"true"` allows fast-forward. It is not a `NEXT_PUBLIC_` variable. |
| **DemoControls** | UI component that triggers fast-forward API calls (+1h, +6h, +24h, reset). Shown only when the server says demo mode is on. |
| **Tick** | One catch-up step, or one fast-forward hour. The daily cron is a backstop, not the only clock. |
| **lastTickAt** | The `PetState` field recording when the last tick was processed (Unix ms). |
| **Habitual time** | The time-of-day window in which a user most often completes tasks, inferred from event history. |
| **Web Push** | Browser push notification via VAPID. |
| **VAPID** | Voluntary Application Server Identification — the key pair used to authenticate push messages. |

---

## Requirements

### 1. Clock Interface and Injection

**Requirement 1 — Clock interface**

_User Story_: As a developer, I want all game timing to go through an injectable Clock interface so that I can swap in a controlled clock for tests and fast-forward demos without changing game logic.

**Acceptance Criteria**:

- 1.1: WHEN any function in `src/lib/game/` needs the current time, THEN the system SHALL accept it as a `now: number` parameter (Unix ms) and SHALL NOT call `Date.now()` directly.
- 1.2: WHEN `SystemClock.now()` is called, THEN the system SHALL return the wall-clock time. `SystemClock` lives in `src/lib/server/clock.ts`, outside `src/lib/game/`.
- 1.3: WHEN `OffsetClock.now()` is called, THEN the system SHALL return `base + offsetMs`.
- 1.4: WHEN `OffsetClock.advance(ms)` is called, THEN the system SHALL add `ms` to `offsetMs` so subsequent `now()` calls reflect the advance.
- 1.5: WHERE any CI test uses a clock, THEN the system SHALL use `OffsetClock` with a fixed base, never `SystemClock`.

**Requirement 2 — No Date.now() in game core**

_User Story_: As a developer, I want the CI hook to reject any `Date.now()` call in `src/lib/game/` so that the rule is enforced automatically.

**Acceptance Criteria**:

- 2.1: WHEN a file in `src/lib/game/` is saved containing `Date.now(` or `new Date()`, THEN the `no-date-now-guard` hook SHALL exit non-zero and write a violation message to stderr.
- 2.2: WHEN a file in `src/lib/game/` is saved containing no such patterns, THEN the hook SHALL exit 0.

---

### 2. Hourly Stat Decay

**Requirement 3 — Decay computation**

_User Story_: As a player, I want my pet's stats to decay each hour so that I'm motivated to keep completing tasks.

**Acceptance Criteria**:

- 3.1: WHEN `decayStats(pet, now)` is called AND `PetState.lastTickAt` is set, THEN the system SHALL compute `elapsedHours = (now - lastTickAt) / 3_600_000` and reduce `hp`, `hunger`, and `mood` proportionally.
- 3.2: WHEN `decayStats` reduces `hp`, THEN the system SHALL clamp the result to `[0, MAX_HP]`.
- 3.3: WHEN `decayStats` reduces `hunger` or `mood`, THEN the system SHALL clamp each to `[0, 100]`.
- 3.4: WHEN `decayStats` is called AND `PetState.status` is `"dead"` or `"tombstone"`, THEN the system SHALL return `pet` unchanged.
- 3.5: WHEN `decayStats` is called AND `PetState.stage` is `"egg"`, THEN the system SHALL NOT decay HP (eggs are immune).
- 3.6: WHEN `decayStats` completes, THEN the system SHALL set `pet.lastTickAt = now`.

**Requirement 4 — Decay additivity (idempotency over split intervals)**

_User Story_: As a developer, I want decay to be mathematically additive so that the order or granularity of tick invocations doesn't affect the final state.

**Acceptance Criteria**:

- 4.1: WHEN `decayStats(pet, t2)` is called after `decayStats(pet, t1)` where `t1 < t2`, the cumulative stat reduction SHALL equal applying `decayStats` once from the original state to `t2` directly (within floating-point rounding tolerance of ±1).
- 4.2: WHEN `decayStats` is called with `now === pet.lastTickAt`, THEN the system SHALL return `pet` unchanged (zero elapsed time).
- 4.3: IF `now < pet.lastTickAt`, THEN the system SHALL return `pet` unchanged (time cannot go backwards).

**Requirement 5 — Catch-up decay on server restart**

_User Story_: As a user who returns after being away, I want my pet's stats to have decayed the correct amount for the time I was away so that the game is realistic.

**Acceptance Criteria**:

- 5.1: WHEN a pet is read or written AND `PetState.lastTickAt` is in the past, THEN the system SHALL apply a single `DECAY_TICK` covering `[lastTickAt, effectiveNow]`. The daily cron uses the same catch-up for users who have not been online.
- 5.2: WHEN catch-up runs, THEN the system SHALL NOT simulate the gap as many one-hour ticks. One call with the real elapsed time is enough (additivity). Death is recorded by the reducer after that call so a split interval does not drop hunger or mood.
- 5.3: WHEN catch-up computes a new pet state, THEN the system SHALL write that state back only when the reducer emitted an event OR the elapsed interval is greater than 60 seconds. Shorter gaps are applied in memory for the response and for a completion payload. They SHALL NOT compare-and-swap `pet_state.version`. When version retries are exhausted, the system SHALL return HTTP 503 with `Retry-After: 1`.

---

### 3. Hourly Cron Job

**Requirement 6 — Vercel Cron job**

_User Story_: As a developer, I want a Vercel Cron job to fire every hour so that stat decay and overdue-task checking happen automatically without client polling.

**Acceptance Criteria**:

- 6.1: WHEN `GET /api/cron/decay` is called, THEN the system SHALL verify the `Authorization: Bearer <CRON_SECRET>` header before processing.
- 6.2: IF the authorization header is missing or incorrect, THEN the system SHALL return HTTP 401 and exit without modifying any state.
- 6.3: WHEN the cron handler processes a user, THEN the system SHALL: (a) fetch `PetState`, (b) apply `DECAY_TICK`, (c) compute new zombie drain, (d) apply `ZOMBIE_DRAIN`, (e) check for newly overdue tasks, (f) save updated `PetState`, (g) append events.
- 6.4: WHEN the cron handler finishes, THEN the system SHALL return HTTP 200 with a summary JSON payload.
- 6.5: WHEN `vercel.json` is read, THEN the system SHALL schedule `/api/cron/decay` once per day (`0 8 * * *`, 08:00 UTC, which is 16:00 in Taipei). Vercel Hobby rejects cron expressions that run more than once a day, and Hobby timing is only guaranteed within the hour. The cron is a backstop. Play sessions catch up from `lastTickAt`.

---

### 4. Developer Time Fast-Forward

**Requirement 7 — Fast-forward API**

_User Story_: As a demo presenter, I want to advance the in-game clock by 1 hour, 6 hours, or 24 hours instantly so that I can show the full game loop — overdue tasks, zombie spawn, pet death, epitaph, and rebirth — in under 3 minutes.

**Acceptance Criteria**:

- 7.1: WHEN `POST /api/demo/fast-forward` is called AND the server env `DEMO_MODE !== "true"`, OR the caller is not signed in, THEN the system SHALL return HTTP 403 and SHALL NOT change state.
- 7.2: WHEN `POST /api/demo/fast-forward` is called with `{ hours: N }` where N ∈ {1, 6, 24}, THEN the system SHALL add `N * 3_600_000` to that user's `pet_state.clock_offset_ms`, then run the same catch-up as a normal read (`effectiveNow = wall clock + offset`). It SHALL NOT write `lastTickAt` beyond that effective time.
- 7.3: WHEN `POST /api/demo/fast-forward` is called with `{ reset: true }`, THEN the system SHALL set `clock_offset_ms` to 0 AND clamp `lastTickAt` and any other stored game timestamps that would still be in the future relative to the new effective now down to that now. Resetting the offset alone leaves `now < lastTickAt`, and decay then no-ops.
- 7.4: WHEN fast-forwarding N hours, THEN the system SHALL produce the same `PetState` as if the real cron had fired N times (Property P20).
- 7.5: WHEN `POST /api/demo/fast-forward` is called, THEN the system SHALL validate the request body with Zod.

**Requirement 8 — DemoControls component**

_User Story_: As a demo presenter, I want a visible control panel in the UI so that I can advance time without using the CLI during a live demo.

**Acceptance Criteria**:

- 8.1: WHEN the server env `DEMO_MODE === "true"`, THEN the system SHALL render `DemoControls`. The client learns this from the server, not from a `NEXT_PUBLIC_` flag.
- 8.2: WHEN `DEMO_MODE !== "true"`, THEN the system SHALL NOT render `DemoControls` and fast-forward SHALL return 403.
- 8.3: WHEN `DemoControls` renders, THEN the system SHALL display buttons for "+1h", "+6h", "+24h", and "Reset".
- 8.4: WHEN a `DemoControls` button is clicked, THEN the system SHALL call `POST /api/demo/fast-forward` with the corresponding `hours` value, then trigger a full page data refresh.

---

### 5. Web Push Notifications

**Requirement 9 — Push subscription management**

_User Story_: As a user, I want to subscribe to browser push notifications so that my pet can remind me at my most productive times.

**Acceptance Criteria**:

- 9.1: WHEN a user grants notification permission, THEN the system SHALL POST the `PushSubscription` object to `POST /api/push`.
- 9.2: WHEN the push subscription is stored, THEN the system SHALL persist it in the `push_subscriptions` table associated with the user's `user_id`.
- 9.3: WHEN the user revokes permission, or the push service answers 404 or 410, THEN the system SHALL remove the row from `push_subscriptions`.

**Requirement 10 — Daily reminder**

_User Story_: As a user, I want one reminder a day while work is still open so that the pet nags me without waiting for an hourly cron. Vercel Hobby only allows a daily cron.

**Acceptance Criteria**:

- 10.1: WHEN the daily cron runs, THEN the system SHALL consider each user at most once for that user's local calendar day.
- 10.2: IF the user has an open task AND nothing was completed today in the pet's time zone AND a nag was not already sent that local day AND a push subscription is stored, THEN the system SHALL send one nag with `buildNagPrompt` for the pet's `NagLevel`.
- 10.3: WHEN a push notification is sent, THEN the system SHALL use `sendPushNotification` from `src/lib/push/notify.ts`, with the VAPID keys from environment variables and a 5 second timeout.
- 10.4: IF the push send fails, THEN the system SHALL log the error and continue. IF the push service returns 404 or 410, THEN the system SHALL delete that subscription.

---

### 6. Streak Break from Decay

**Requirement 11 — Streak break detection**

_User Story_: As a user who misses two consecutive days, I want my streak to reset so that the streak has meaningful stakes.

**Acceptance Criteria**:

- 11.1: WHEN `decayStats` is called AND `(now - lastCompletionAt) > STREAK_BREAK_HOURS * 3_600_000`, THEN the system SHALL set `PetState.currentStreak = 0` and apply the mood penalty.
- 11.2: WHEN a streak break occurs, THEN the system SHALL emit a `STREAK_BROKEN` event within the pet state update.
- 11.3: WHEN a streak break mood penalty is applied, THEN the system SHALL still clamp mood to `[0, 100]`.
