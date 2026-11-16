# Haunted Pet To-Do

A gamified to-do list: finishing tasks keeps a ghost pet alive, ignoring them spawns zombies. Next.js 15 (App Router), TypeScript strict, Tailwind 4, Supabase, Vitest + fast-check. Deployed on Vercel Hobby.

## Commands

```sh
pnpm dev         # http://localhost:3000
pnpm test        # Vitest, run once
pnpm typecheck
pnpm lint
pnpm build
```

Before finishing a change, run `pnpm typecheck && pnpm lint && pnpm test`.

## Layout

- `src/lib/game/`: pure game core (pet, decay, tasks, zombies, evolution). No React, I/O, or `fetch`.
- `src/lib/server/clock.ts`: the only place that reads the wall clock.
- `src/lib/db/`: Supabase helpers. `src/lib/ai/`: prompts and Zod schemas for model replies.
- `src/app/api/`: route handlers. Logic goes in `handlers.ts`, and `route.ts` stays thin.
- `src/components/`: UI. It talks to the server only through `fetch` to `/api`, never by importing `src/lib/db` or `src/lib/ai`.
- `tests/`: mirrors `src/`. Tests never go next to source files.
- `supabase/migrations/`: timestamped SQL files (`YYYYMMDDHHMMSS_name.sql`).

## Rules

- **No wall clock in `src/lib/game/`**: no `Date.now()` and no `new Date()`. Take a `now: number` or a `Clock` argument. ESLint enforces this.
- **Validate input with Zod** at every boundary: request bodies, DB rows, model JSON, and env vars.
- **Model calls stay on the server**, only in `src/app/api/`. Always return a fixed fallback when the key is missing, the call fails, or the budget runs out.
- **RLS stays on.** Authenticated users can only select their own rows. All writes go through the API with the service role. Never grant client write access.
- **pnpm only.** Pin dependencies to exact versions (no `^` or `~`).
- **Never commit `.env.local`.** When you add a variable, add it to `.env.example` and the README table.
- **Add a new migration** instead of editing one that has already shipped.
- **Accessibility**: keep focus rings visible, don't rely on color alone, and respect `prefers-reduced-motion`.
- **Tests**: unit tests are `*.test.ts`, property tests are `*.property.ts`.

## Careful

- `tests/db` drops the `public` and `auth` schemas. Only point `HAUNTED_TEST_DATABASE_URL` at a database whose name contains `test`.
- `DEMO_MODE` is server-only. Never make it `NEXT_PUBLIC_`.
- The Vercel cron runs once a day (`0 8 * * *` UTC). Hourly reminders come from `.github/workflows/remind.yml`.
- The UI supports English and Traditional Chinese (`src/lib/i18n/`). Add every new string to both `en.ts` and `zh-TW.ts`. The `Dictionary` type comes from `en.ts`.

More detail lives in `README.md` and `.kiro/steering/`.
