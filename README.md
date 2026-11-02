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

Decay runs when a pet or task route reads or writes, from `lastTickAt` to now. Stats are stored as double precision so a polling client does not floor away the fraction on every read. The daily cron entry stays out of `vercel.json` until `/api/cron/decay` exists. Vercel Hobby would reject an hourly schedule anyway.

Authenticated database roles can select their own rows and cannot write. The API writes with `SUPABASE_SERVICE_ROLE_KEY`.

`DEMO_MODE=true` (server-only, not `NEXT_PUBLIC_`) is reserved for fast-forward. The column `pet_state.clock_offset_ms` stores a per-user offset added to wall time. Nothing in this slice writes it.

## Database concurrency tests

`tests/db/postgres-concurrency.test.ts` drops schemas `public` and `auth` and reapplies the migrations. It runs only when `HAUNTED_TEST_DATABASE_URL` is set. If the URL path names a database and that name does not contain `test`, the file throws before connecting. A missing path is not taken from the hostname. After connecting, the suite runs `select current_database()` and throws before any drop unless that name contains `test`. If the URL is unset, the suite skips. CI's `postgres` job uses `postgres:17` and `haunted_test`, creates the `anon`, `authenticated`, and `service_role` roles from `tests/db/bootstrap.sql`, applies the migrations, then runs `tests/db`.

```sh
HAUNTED_TEST_DATABASE_URL='postgresql:///haunted_test?host=/var/run/postgresql' pnpm exec vitest run tests/db
```

## Kiro

`/.kiro` holds the Kiro specs, steering docs, and hooks for this project. It is committed on purpose and is part of the hackathon submission.
