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

The SQL in `supabase/migrations/` is the schema (`tasks`, `events`, `pet_state`). Helpers in `src/lib/db/` talk to a real project. Tests never do: API handlers take an in-memory store behind the same operations (`getTasks`, `upsertTask`, `softDeleteTask`, `getPetState` / `savePetState`, `appendEvent`).

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Leave the service-role key out of the client. Do not commit `.env.local`.
3. Enable **Anonymous sign-ins** in the dashboard (Authentication → Sign In / Providers). A SQL migration cannot toggle that Auth setting. For local `supabase start`, `supabase/config.toml` sets `enable_anonymous_sign_ins = true` (keep that flag if you regenerate the file with `supabase init`).
4. Apply the migrations: `pnpm db:migrate` (`supabase db push`). `pnpm db:types` regenerates TypeScript types once the CLI is linked.
5. Sign in without a password:

```sh
curl -s -X POST http://localhost:3000/api/auth/anonymous
```

The response has `userId` and `accessToken`. Send `Authorization: Bearer <accessToken>` on later calls. Send `X-Time-Zone: America/New_York` (any IANA name) on the first `GET /api/pet` so evolution and streaks use that zone instead of UTC.

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

Decay runs when a pet or task route reads or writes, from `lastTickAt` to now. `vercel.json` schedules `/api/cron/decay` once a day (`0 8 * * *`) as a backstop. Vercel Hobby rejects an hourly cron. The cron handler itself is not in this slice.

`DEMO_MODE=true` (server-only, not `NEXT_PUBLIC_`) is reserved for fast-forward. The column `pet_state.clock_offset_ms` stores a per-user offset added to wall time. Nothing in this slice writes it.

## Kiro

`/.kiro` holds the Kiro specs, steering docs, and hooks for this project. It is committed on purpose and is part of the hackathon submission.
