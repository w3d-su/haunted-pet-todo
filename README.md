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

## Supabase

The SQL in `supabase/migrations/` is the schema (`tasks`, `events`, `pet_state`). Helpers in `src/lib/db/` talk to a real project. API tests use an in-memory store behind the same operations (`getTasks`, `upsertTask`, `softDeleteTask`, `getPetState` / `savePetState`, `appendEvent`). `tests/db/` drives those helpers and `completion.ts` against Postgres, and only when opted in (below).

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Leave the service-role key out of the client. Do not commit `.env.local`.
3. Enable **Anonymous sign-ins** in the dashboard (Authentication → Sign In / Providers). A SQL migration cannot toggle that Auth setting. For local `supabase start`, `supabase/config.toml` sets `enable_anonymous_sign_ins = true` (keep that flag if you regenerate the file with `supabase init`).
4. Apply the migrations: `pnpm db:migrate` (`supabase db push`). `pnpm db:types` regenerates TypeScript types once the CLI is linked.
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

Decay runs when a pet or task route reads or writes, from `lastTickAt` to now. Stats are stored as double precision so a polling client does not floor away the fraction on every read. `vercel.json` schedules `GET /api/cron/decay` once a day (`0 8 * * *`). That is 08:00 UTC, which is 16:00 in Taipei, not 08:00 Taipei. Vercel Hobby rejects an hourly cron. The route requires `Authorization: Bearer $CRON_SECRET` and compares that secret in constant time.

Authenticated database roles can select their own rows and cannot write. The API writes with `SUPABASE_SERVICE_ROLE_KEY`.

`events.seq` is a `bigint generated always as identity`. The timeline is ordered by `seq`, so rows that share a `created_at` stay in insert order.

`DEMO_MODE=true` (server-only, not `NEXT_PUBLIC_`) allows `POST /api/demo/fast-forward`. That adds `1`, `6`, or `24` hours to `pet_state.clock_offset_ms`, then runs the same catch-up as a read. Reset sets the offset to 0 and pulls future clock cursors, including the completion day, back to wall time. Due dates are left alone. The in-memory demo is used only when demo mode is on and Supabase is not configured. The session cookie is HttpOnly, Secure, and HMAC-signed, and one process keeps at most 32 demo users. A configured Supabase project signs the browser in anonymously and does not fall back to that memory store. Writes still use the service role.

`POST /api/ai/epitaph` carves a tombstone line after the pet dies. The daily cron posts each new death there. `POST /api/ai/breakdown` splits a large task into 3–7 subtasks. Both read `OPENAI_API_KEY` on the server only. If that variable is missing, or the model reply fails validation, they use a fixed fallback and do not call the model. Each signed-in user gets 5 calls per minute. `PATCH /api/pet` still accepts only rebirth and the time zone.

`POST /api/push` stores a Web Push subscription. The cron sends a nag when the current hour in the pet's time zone matches that user's most common completion hour and nothing was completed that day. `VAPID_PRIVATE_KEY` stays on the server. The browser subscribes with `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. `push_subscriptions` is select-only for the signed-in user; the service role writes it.

## Database concurrency tests

`tests/db/postgres-concurrency.test.ts` drops schemas `public` and `auth` and reapplies the migrations. It runs only when `HAUNTED_TEST_DATABASE_URL` is set. If the URL path names a database and that name does not contain `test`, the file throws before connecting. A missing path is not taken from the hostname. After connecting, the suite runs `select current_database()` and throws before any drop unless that name contains `test`. If the URL is unset, the suite skips. CI's `postgres` job uses `postgres:17` and `haunted_test`, creates the `anon`, `authenticated`, and `service_role` roles from `tests/db/bootstrap.sql`, applies the migrations, then runs `tests/db`.

```sh
HAUNTED_TEST_DATABASE_URL='postgresql:///haunted_test?host=/var/run/postgresql' pnpm exec vitest run tests/db
```

## Kiro

`/.kiro` holds the Kiro specs, steering docs, and hooks for this project. It is committed on purpose and is part of the hackathon submission.
