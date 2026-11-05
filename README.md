# Haunted Pet To-Do

A spooky, gamified to-do list for the Kiroween 2026 Costume Contest: finish your tasks and a little ghost pet thrives; ignore them and zombies crawl in. This repository is the public, MIT-licensed entry.

## Stack

Next.js 15 (App Router), TypeScript in strict mode, Tailwind CSS 4, pnpm, ESLint, Vitest, and fast-check. Week 1 adds the pure game core, Supabase migrations, and task/pet API routes. There is no live Supabase project in this repo.

## Run

```sh
pnpm install
pnpm dev
pnpm test
```

`pnpm dev` serves the landing page at <http://localhost:3000>. `pnpm lint`, `pnpm typecheck`, and `pnpm build` are available too. Copy `.env.example` to `.env.local` when you need local secrets; none are required to boot the landing page or to run the tests.

## Environment

`.env.example` lists every variable and leaves secrets empty. Fill them in `.env.local`. Do not commit that file.

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | public | Web Push VAPID public key |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Service role. The API writes with this key |
| `OPENAI_API_KEY` | server | Model key. Unset uses the fallback text |
| `OPENAI_BASE_URL` | server | Optional compatible endpoint |
| `AI_DAILY_CAP` | server | Site-wide model calls per UTC day (default 200) |
| `VAPID_PRIVATE_KEY` | server | Web Push private key |
| `CRON_SECRET` | server | Bearer token for the daily cron and `/api/cron/remind`. Also a GitHub repository secret |
| `HOURLY_REMINDERS` | server | `true` when the hourly workflow sends nags; the daily cron then skips its nag |
| `DEMO_MODE` | server | `true` shows fast-forward. Not a `NEXT_PUBLIC_` variable |
| `DEMO_COOKIE_SECRET` | server | HMAC for the demo cookie. Empty means a process-local key |

Vercel Hobby runs the cron in `vercel.json` once a day (`0 8 * * *`). Fluid compute on Hobby allows 300 seconds, and no route sets `maxDuration`.

## Sound

`public/sfx/task_complete.ogg` and `public/sfx/zombie_spawn.ogg` are original square-wave tones generated with ffmpeg for this project (not third-party recordings). `pet_hurt.ogg` (0.3 s drop), `pet_death.ogg` (1.5 s slide down), `pet_hatch.ogg` (1.0 s C-E-G-C arpeggio), and `pet_evolve.ogg` (1.2 s two-octave run) were made the same way with ffmpeg's `aevalsrc`, as 22050 Hz mono Vorbis. `GameStateProvider` compares each pet read with the previous one and plays at most one of them through `petTransitionSound` in `src/components/providers/pet-sound.ts`: death first, then evolution, hatching, and a hit of at least 1 HP. The first read after page load plays nothing. Sound stays muted until the player uses the mute toggle, and playback waits for a pointer or key gesture.

## Supabase

The SQL in `supabase/migrations/` is the schema (`tasks`, `events`, `pet_state`). Helpers in `src/lib/db/` talk to a real project. API tests use an in-memory store behind the same operations (`getTasks`, `upsertTask`, `softDeleteTask`, `getPetState` / `savePetState`, `appendEvent`). `tests/db/` drives those helpers and `completion.ts` against Postgres, and only when opted in (below).

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Leave the service-role key out of the client. Do not commit `.env.local`.
3. Enable **Anonymous sign-ins** in the dashboard (Authentication → Sign In / Providers). A SQL migration cannot toggle that Auth setting. For local `supabase start`, `supabase/config.toml` sets `enable_anonymous_sign_ins = true` (keep that flag if you regenerate the file with `supabase init`).
4. Apply the migrations: `pnpm db:migrate` (`supabase db push`). `pnpm db:types` regenerates TypeScript types once the CLI is linked. `20261103140204_nag_and_budget.sql` was edited in place after it first shipped. If a local database already applied an older copy of that file, run `supabase db reset` so the advisory lock and `search_path` on those functions are created again.
   Apply the reorder migration before deploying the task sorting UI. The first five filenames use the version IDs recorded in production. For other linked databases previously migrated with short version IDs, compare their applied SQL and reconcile the migration history before running `db push`.
   Apply `20261105155001_push_locale.sql` before deploying localized push notifications. It adds the locale column and defaults existing subscriptions to English.
5. Sign in from the browser. Do not proxy this through the server: Supabase limits anonymous sign-ins per IP (30/hour), and a server route would spend that budget on Vercel's address. Turnstile or another captcha is the later hardening step; it is not wired up yet.

```ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
const { data, error } = await supabase.auth.signInAnonymously();
const accessToken = data.session?.access_token;
```

Send `Authorization: Bearer <accessToken>` on API calls. Send `X-Time-Zone: America/New_York` (any IANA name) on the **first** `GET /api/pet`. The zone is fixed at creation; later headers are ignored.

```sh
curl -s http://localhost:3000/api/pet \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Time-Zone: America/New_York"

curl -s -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Light a candle","category":"chores","size":"small"}'
```

Row Level Security uses `auth.uid()`. Anonymous users are real `auth.users` rows, so the same policies apply. The user-scoped API uses the anon key plus that JWT. It does not use the service role.

Decay runs when a pet or task route reads or writes, from `lastTickAt` to now. Stats are stored as double precision so a polling client does not floor away the fraction on every read. `vercel.json` schedules `GET /api/cron/decay` once a day (`0 8 * * *`). That is 08:00 UTC, which is 16:00 in Taipei, not 08:00 Taipei. Vercel Hobby rejects an hourly cron. Fluid compute is the default, and on Hobby its default and maximum duration are both 300 seconds ([Vercel docs](https://vercel.com/docs/functions/configuring-functions/duration)). The route does not set `maxDuration`, because a lower value would shorten that limit. The job walks pets four at a time. About 2500 pets, at a few round trips of roughly 20 ms each, finish well inside 300 seconds. If the function stops early, opening the app still catches up from `lastTickAt`. The route requires `Authorization: Bearer $CRON_SECRET` and compares that secret in constant time.

Authenticated database roles can select their own rows and cannot write. The API writes with `SUPABASE_SERVICE_ROLE_KEY`.

`events.seq` is a `bigint generated always as identity`. The timeline is ordered by `seq`, so rows that share a `created_at` stay in insert order.

`DEMO_MODE=true` (server-only, not `NEXT_PUBLIC_`) allows `POST /api/demo/fast-forward`. That adds `1`, `6`, or `24` hours to `pet_state.clock_offset_ms`, then runs the same catch-up as a read. Reset sets the offset to 0 and pulls future clock cursors, including the completion day, back to wall time. Due dates are left alone. The in-memory demo is used only when demo mode is on and Supabase is not configured. The session cookie is HttpOnly and HMAC-signed with `DEMO_COOKIE_SECRET` (a process-local key if that is unset, so cookies do not survive a restart). The cookie is `Secure` only when the request is https (`x-forwarded-proto` or the URL). `next start` sets `NODE_ENV=production` and still serves plain http, including a LAN address, so that alone does not mark the cookie Secure. One process admits at most 32 demo users and refuses a new session when that list is full, instead of evicting someone still active. Each demo user can keep 100 tasks that are not done, and at most 300 stored rows. Deleted rows are removed, and the oldest done tasks are dropped past that cap. A full open list returns 429. A configured Supabase project signs the browser in anonymously and does not fall back to that memory store. Writes still use the service role.

`POST /api/ai/epitaph` carves a tombstone line when the dead pet is viewed. The daily cron only records the death and leaves the fallback line in place, so a crowd of deaths does not call the model. `POST /api/ai/breakdown` splits a large task into 3–7 subtasks. Both read `OPENAI_API_KEY` on the server only. If that variable is missing, the model reply fails validation, or the daily budget is spent, they use a fixed fallback and do not call the model. `AI_DAILY_CAP` (default 200) is the site-wide cap per UTC day, and each user gets 20 calls that day. Set a spend limit on the OpenAI project as well. `PATCH /api/pet` still accepts only rebirth and the time zone.

`POST /api/push` stores a Web Push subscription for an https endpoint on FCM, Mozilla, Windows, or Apple, at most five per user. The keys must be a 65-byte p256dh and a 16-byte auth secret. Hobby only allows a daily cron. A nag goes out at most once per local day, and only when the user still has an open task and finished nothing today in the pet's time zone. By default the daily run sends it. `.github/workflows/remind.yml` calls `GET /api/cron/remind` at minute 17 of every hour with the repository secret `CRON_SECRET`. That route nags each user with a subscription once their local hour reaches their reminder hour: the most common hour of their last 10 completions, or 19:00 with fewer than three (`src/lib/game/habit.ts`). Set `HOURLY_REMINDERS=true` on Vercel once the workflow runs, so the daily cron stops sending its own nag. Both paths share `claim_nag_day`, so a user never gets two on one local day. GitHub can start a scheduled run late or drop it, and the route sends at or after the hour, so a late run still sends that day. GitHub also disables scheduled workflows in a public repo after 60 days without activity. A 404 or 410 from the push service deletes that subscription. `VAPID_PRIVATE_KEY` stays on the server. The browser subscribes with `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. `push_subscriptions` is select-only for the signed-in user; the service role writes it.

## Database concurrency tests

`tests/db/postgres-concurrency.test.ts` drops schemas `public` and `auth` and reapplies the migrations. It runs only when `HAUNTED_TEST_DATABASE_URL` is set. If the URL path names a database and that name does not contain `test`, the file throws before connecting. A missing path is not taken from the hostname. After connecting, the suite runs `select current_database()` and throws before any drop unless that name contains `test`. If the URL is unset, the suite skips. CI's `postgres` job uses `postgres:17` and `haunted_test`, creates the `anon`, `authenticated`, and `service_role` roles from `tests/db/bootstrap.sql`, applies the migrations, then runs `tests/db`.

```sh
HAUNTED_TEST_DATABASE_URL='postgresql:///haunted_test?host=/var/run/postgresql' pnpm exec vitest run tests/db
```

## Kiro

`/.kiro` holds the Kiro specs, steering docs, and hooks for this project. It is committed on purpose and is part of the hackathon submission.

## How we used Kiro

`.kiro` is part of the repo: steering files, three specs, and hook definitions. Per the run log, a headless Kiro CLI run drafted the property-test hook and an earlier copy of this section, then `fs_write` and `str_replace` were denied. The text below was applied by hand and checked against the tree. On 2026-11-06, `no-date-now-guard` and the `run-property-tests` command were exercised by a headless Kiro CLI 3.0.0 V3 session (details under "What is verified"). No hook has been exercised in the Kiro IDE.

### Steering files (`.kiro/steering/`)

| File | Inclusion | What it contains |
|---|---|---|
| `product.md` | `always` | Vision, game loop, and the MVP checklist. Still open: reminder-time suggestions and the CRT-and-sound line. |
| `tech.md` | `always` | Stack, commands, and the coding rules: injectable clock, Zod at boundaries, server-only model calls, RLS, env vars, and accessibility. |
| `structure.md` | `always` | Directory layout and layer rules. |
| `build-order.md` | `always` | Week-by-week order across the three specs, naming the file each task owns. |
| `pet-voice.md` | `fileMatch` (`src/lib/ai/**`, `src/components/pet/**`) | Ghost personality, nag levels, and epitaph style. |
| `visual-style.md` | `fileMatch` (components, app `.tsx`, `globals.css`, `tailwind.config.ts`) | Palette, type, sprites, motion, and the sound table. |

### Specs (`.kiro/specs/`)

Each spec is `requirements.md`, `design.md`, and `tasks.md`:

- `pet-state-machine` — reducer, pet types, evolution, pet DB helpers, pet API, and pet UI
- `decay-and-time-travel` — `Clock`, `decayStats`, the daily cron, demo fast-forward, Web Push, and property tests P18–P26
- `task-lifecycle` — tasks, zombies, migrations, the task API, task UI, AI breakdown, and property tests P11–P17

The `tasks.md` boxes were compared with the code. Decay task 6 is ticked because `src/app/api/cron/decay/route.ts` delegates to `runDecayCron` in `handlers.ts` (bearer check, `syncWorld` catch-up, death count, `{ processed, deaths, failures }`). Decay task 16 is ticked because 16.3 was run in Kiro CLI V3 on 2026-11-06. Task-lifecycle task 10.5 records the Up/Down buttons and Alt+Arrow reorder. Pet-state-machine task 11b notes that `src/app/api/auth/anonymous/route.ts` was added in `d19675182c14855580acc67eb00359d7be51c527` and removed in `cf11d891cef262ed18180f7e79fca1d80d6bd98a`: that commit's README says a server proxy would spend Supabase's per-IP anonymous sign-in limit on Vercel's address, so `GameStateProvider.tsx` calls `supabase.auth.signInAnonymously()` directly.

### Hooks (`.kiro/hooks/`)

Five hook files are committed. They are definitions for Kiro, not something this repo has run inside the IDE. `PostFileSave` fires only when the agent saves a file.

A game-core save used to run the property tests twice, once inside `pnpm vitest run tests/game` and once from `run-property-tests`. `run-game-tests` now excludes `**/*.property.ts`, so those files run only from the dedicated property-test hook. That hook also matches `tests/game/*.property.ts`, so editing a property file still runs it once.

| File | Trigger | Matcher | Action |
|---|---|---|---|
| `run-game-tests.json` | `PostFileSave` | `(^|[\\/])src[\\/]lib[\\/]game[\\/].*\.tsx?$` or the same shape for `tests/game` | `pnpm vitest run tests/game --exclude '**/*.property.ts' --reporter=dot`. Timeout 60 is on the hook. |
| `no-date-now-guard.json` | `PostFileSave` | `(^|[\\/])src[\\/]lib[\\/]game[\\/].*\.tsx?$` | `node .kiro/hooks/no-date-now-guard.mjs {{filePath}}`. Timeout 15 is on the hook. The script runs ESLint rule `haunted/no-wall-clock` and writes a violation to stderr with exit 1. |
| `run-property-tests.json` | `PostFileSave` | the game-core pattern above, or `(^|[\\/])tests[\\/]game[\\/].*\.property\.ts$` | `pnpm vitest run --reporter=dot tests/game/invariants.property.ts tests/game/clamp.property.ts`. Timeout 120 is on the hook. This is the only hook that runs those files. |
| `visual-style-check.json` | `PostFileSave` | `src/components/.*\.tsx$`, `src/app/.*\.tsx$`, `src/app/globals.css`, `tailwind.config.ts` | Agent prompt that reviews the saved file against `visual-style.md`. |
| `pet-voice-check.json` | `PostFileSave` | `src/lib/ai/.*\.tsx?$` | Agent prompt that reviews the saved file against `pet-voice.md`. |

Each of those three matchers was compiled with `new RegExp` from the JSON string and checked against real paths. All 8 `src/lib/game/*.ts` files matched, including `src/lib/game/clock.ts` and the Windows-style `src\lib\game\clock.ts`. None matched `foo/notsrc/lib/game/x.ts`, `foo\notsrc\lib\game\x.ts`, `src/lib/gameplay/clock.ts`, or any of the 22 files under `src/components/`. `no-date-now-guard` matched none of the 40 files under `tests/`. `run-game-tests` matched the 8 files under `tests/game/` and not `tests/components/order.test.ts`. `run-property-tests` matched only `tests/game/invariants.property.ts` and `tests/game/clamp.property.ts` from `tests/`.

From the repo root, with `NODE_PATH` unset:

```sh
env -u NODE_PATH pnpm vitest run --reporter=dot tests/game/invariants.property.ts tests/game/clamp.property.ts
```

Exit code 0. Vitest 5.0.5 reported 2 files, 30 tests passed, duration 677ms, on 2026-11-03. Those are the only `*.property.ts` files under `tests/`. `invariants.property.ts` contains P1–P26 plus P19b. `clamp.property.ts` is the clamp bounds property. That shell run is not a Kiro save.

### What is verified, and what is not

Checked in this tree, outside any Kiro IDE session:

- `tests/game/date-guard.test.ts` spawns `.kiro/hooks/no-date-now-guard.mjs` with `NODE_PATH` removed. A clean game file exits 0. A computed `Date.now` exits 1 and the message goes to stderr. That test is a Vitest process, not a Kiro `PostFileSave`.
- `runDecayCron`, which `src/app/api/cron/decay/route.ts` calls, returns 401 without the bearer secret in `tests/api/cron.test.ts` and again in `tests/db/tasks.test.ts`.
- `POST /api/demo/fast-forward` returns 403 when `DEMO_MODE` is not `"true"` in `tests/api/fast-forward.test.ts`.
- Snake_case column mapping is asserted in `tests/db/pet.test.ts` (`savePetState writes snake_case columns`) and `tests/db/tasks.test.ts` (`maps a task to snake_case`).

Not yet verified:

- None of the hooks has been exercised in the Kiro IDE. The Kiro CLI V3 run below is the only live test.
- `run-game-tests`, `visual-style-check`, and `pet-voice-check` have not been fired by Kiro.
- Production is <https://haunted-pet-todo.vercel.app>, deployed by the Vercel GitHub integration from `main`. On 2026-11-06 it served `55ac1a7` with all six `public/sfx/` files, `/api/pet` and `/api/cron/decay` returned 401 without credentials, the client bundle pointed at a Supabase project, and PostgREST reported `permission denied for function reorder_tasks` (so migration 0006 exists there). Nobody has played through the deployed app end to end.

Kiro CLI V3 run (2026-11-06, `kiro-cli chat --v3 --no-interactive --trust-all-tools` in the repo root, Windows):

- Kiro sends `{"hook_event_name":"PostFileSave","cwd":...,"file_path":...}` on stdin and leaves `{{filePath}}` unexpanded. `no-date-now-guard.mjs` first missed the top-level `file_path` and exited 0 with "no file path". It now reads that field. An agent edit that added `Date.now()` to `src/lib/game/clock.ts` then exited 1 with `clock.ts:5 src/lib/game must not use Date.now()` on stderr, and the edit that removed it exited 0.
- The `run-property-tests` command, fired by an agent edit to `src/lib/game/constants.ts`, exited 0 with 2 files and 30 tests passed. The same run exited 1 when `pnpm` was not on `PATH`. Run `corepack enable` so the `pnpm` hooks can start.
- Kiro discards hook stdout for `PostFileSave`, and the agent saw no hook text. Exit codes and stderr were captured by a temporary logging hook that ran the same commands with the same stdin. That hook was then deleted.
