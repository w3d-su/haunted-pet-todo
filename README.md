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
| `CRON_SECRET` | server | Bearer token for the daily cron |
| `DEMO_MODE` | server | `true` shows fast-forward. Not a `NEXT_PUBLIC_` variable |
| `DEMO_COOKIE_SECRET` | server | HMAC for the demo cookie. Empty means a process-local key |

Vercel Hobby runs the cron in `vercel.json` once a day (`0 8 * * *`). Fluid compute on Hobby allows 300 seconds, and no route sets `maxDuration`.

## Sound

`public/sfx/task_complete.ogg` and `public/sfx/zombie_spawn.ogg` are original square-wave tones generated with ffmpeg for this project (not third-party recordings). Sound stays muted until the player uses the mute toggle, and playback waits for a pointer or key gesture.

## Supabase

The SQL in `supabase/migrations/` is the schema (`tasks`, `events`, `pet_state`). Helpers in `src/lib/db/` talk to a real project. API tests use an in-memory store behind the same operations (`getTasks`, `upsertTask`, `softDeleteTask`, `getPetState` / `savePetState`, `appendEvent`). `tests/db/` drives those helpers and `completion.ts` against Postgres, and only when opted in (below).

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Leave the service-role key out of the client. Do not commit `.env.local`.
3. Enable **Anonymous sign-ins** in the dashboard (Authentication → Sign In / Providers). A SQL migration cannot toggle that Auth setting. For local `supabase start`, `supabase/config.toml` sets `enable_anonymous_sign_ins = true` (keep that flag if you regenerate the file with `supabase init`).
4. Apply the migrations: `pnpm db:migrate` (`supabase db push`). `pnpm db:types` regenerates TypeScript types once the CLI is linked. `0005_nag_and_budget.sql` was edited in place after it first shipped. If a local database already applied an older copy of that file, run `supabase db reset` so the advisory lock and `search_path` on those functions are created again.
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

`POST /api/push` stores a Web Push subscription for an https endpoint on FCM, Mozilla, Windows, or Apple, at most five per user. The keys must be a 65-byte p256dh and a 16-byte auth secret. Hobby only allows a daily cron, so the job cannot nag at a habitual hour. During that daily run it sends at most one nag per local day, and only when the user still has an open task and finished nothing today in the pet's time zone. A 404 or 410 from the push service deletes that subscription. `VAPID_PRIVATE_KEY` stays on the server. The browser subscribes with `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. `push_subscriptions` is select-only for the signed-in user; the service role writes it.

## Database concurrency tests

`tests/db/postgres-concurrency.test.ts` drops schemas `public` and `auth` and reapplies the migrations. It runs only when `HAUNTED_TEST_DATABASE_URL` is set. If the URL path names a database and that name does not contain `test`, the file throws before connecting. A missing path is not taken from the hostname. After connecting, the suite runs `select current_database()` and throws before any drop unless that name contains `test`. If the URL is unset, the suite skips. CI's `postgres` job uses `postgres:17` and `haunted_test`, creates the `anon`, `authenticated`, and `service_role` roles from `tests/db/bootstrap.sql`, applies the migrations, then runs `tests/db`.

```sh
HAUNTED_TEST_DATABASE_URL='postgresql:///haunted_test?host=/var/run/postgresql' pnpm exec vitest run tests/db
```

## Kiro

`/.kiro` holds the Kiro specs, steering docs, and hooks for this project. It is committed on purpose and is part of the hackathon submission.
