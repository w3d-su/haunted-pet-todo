---
inclusion: always
---

# Haunted Pet To-Do — Tech Steering

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15** (App Router) | Use `app/` directory exclusively; no `pages/` |
| Language | **TypeScript 5** (strict mode) | `"strict": true` in tsconfig; no `any` escapes |
| Styling | **Tailwind CSS 4** | Config in `tailwind.config.ts`; no inline `style=` for theming |
| Animation | **Framer Motion 12** | Stepped/snappy easing only; respect `prefers-reduced-motion` |
| Database | **Supabase** (Postgres) | Client from `@supabase/supabase-js` |
| LLM | Provider-agnostic server route | Currently OpenAI-compatible; keys only in env vars, never client bundle |
| Testing | **Vitest** + **fast-check** | Unit + property-based tests |
| Package manager | **pnpm** | Lock file committed; do not use npm or yarn |
| Deploy | **Vercel** | `vercel.json` daily cron (Hobby); server `DEMO_MODE` flag |
| Push notifications | **Web Push** (VAPID) | `web-push` npm package; server-side only |

## Versions Policy

Pin all dependencies to exact versions in `package.json` (no `^` or `~` ranges). When adding a new dependency, pick the latest stable release at time of writing and record it exactly.

## Commands

```sh
pnpm dev          # local dev server (port 3000)
pnpm build        # production build
pnpm test         # run all Vitest tests once (no watch)
pnpm test:watch   # watch mode (dev only, never in CI)
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit
pnpm db:migrate   # apply Supabase migrations (supabase db push)
pnpm db:types     # regenerate supabase type definitions
```

CI must run `pnpm build && pnpm typecheck && pnpm lint && pnpm test`.

## Core Coding Rules

### 1. Pure, Injectable-Clock Game Core

**All game logic lives in `src/lib/game/`.** Functions in this directory:
- Accept a `now: number` parameter (Unix ms) or a `Clock` interface (`{ now(): number }`).
- **Never call `Date.now()` or `new Date()`.** ESLint `no-restricted-syntax` fails CI on `src/lib/game/**`. The wall clock is `SystemClock` in `src/lib/server/clock.ts`.
- Are pure and deterministic: same inputs → same outputs, no side effects.
- Export only plain functions and types; no React, no Supabase, no `fetch`.

This rule makes time fast-forward trivial and property-based testing reliable.

```ts
// ✅ correct
export function decayStats(pet: PetState, now: number): PetState { … }

// ❌ forbidden inside src/lib/game/
const now = Date.now();
const d = new Date();
```

### 2. Zod at Every Boundary

Parse all external data (API request bodies, Supabase row shapes, LLM JSON responses, env vars) with Zod schemas before use. Never trust raw `unknown`.

### 3. Server-Only LLM Calls

LLM API calls happen exclusively in Next.js Route Handlers under `src/app/api/`. Never import the LLM client in a client component or in `src/lib/game/`. All API route handlers must:
- Validate the request body with Zod.
- Return a safe fallback string if the LLM call fails (network error, timeout, bad JSON) so the app never crashes for missing AI content.

```ts
// Fallback example for epitaph generation
catch (e) {
  return NextResponse.json({ epitaph: "Here lies a to-do list. It never stood a chance." });
}
```

### 4. Supabase Row Level Security

Every table must have RLS enabled. Authenticated clients are **select-only** (`auth.uid() = user_id`). Inserts, updates, and deletes go through the server with the service role, which bypasses RLS. Do not grant authenticated write access: the public anon key would let a signed-in user PostgREST their own `hp`, `status`, or `clock_offset_ms`, or point `parent_id` at another user's task. The API still checks that a parent task belongs to the caller.

Do not disable RLS for convenience. Write migrations to create policies, not manual dashboard clicks.

### 5. Environment Variables

| Variable | Location | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Service role key — never expose to client |
| `OPENAI_API_KEY` | server-only | LLM provider API key |
| `OPENAI_BASE_URL` | server-only | Override for compatible providers (optional) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | public | Web Push VAPID public key (the browser must read it) |
| `VAPID_PRIVATE_KEY` | server-only | Web Push VAPID private key |
| `CRON_SECRET` | server-only | Shared secret verified in the daily cron route |
| `DEMO_MODE` | server-only | `"true"` allows fast-forward. Not a `NEXT_PUBLIC_` variable |

Never commit `.env.local`. Provide `.env.example` with placeholder values.

### 6. Accessibility

- All interactive elements have visible focus rings (not removed with `outline: none`).
- Color is never the sole conveyor of meaning (use labels + icons alongside color).
- Animations respect `prefers-reduced-motion`: use Framer Motion's `useReducedMotion()`.
- Pixel-art text must have a minimum contrast ratio of 4.5:1 (WCAG AA).

## Testing Strategy

### Unit Tests (`tests/game/`)
Cover every pure function in `src/lib/game/`. Use Vitest. Test all edge cases: HP at 0, HP at max, zombie spawning threshold, evolution conditions, stat decay per tick.

### Property-Based Tests (fast-check)
Write PBT for all game-state invariants:
- `HP` is always in `[0, MAX_HP]` after any number of decay ticks.
- `Hunger` and `Mood` are always in `[0, 100]`.
- `decayStats` is idempotent if called with the same `now`.
- A `dead` or `tombstone` pet never transitions back to `alive` without an explicit rebirth event.
- Completing a `done` task does not further increase stats.

### Integration Tests
Minimal: test that the Supabase query helpers in `src/lib/db/` correctly build queries (mock the Supabase client).

### No Tests in src/
Test files live exclusively under `tests/` mirroring the `src/` structure. Do not colocate test files next to source files.

## Performance Notes

- Sprite images are tiny pixel-art PNGs; load eagerly, no lazy loading needed.
- Sound effects are short 8-bit `.ogg` files; preload on first user interaction.
- Hourly decay runs via Vercel Cron (`/api/cron/decay`), not client polling.
- Use `React.memo` only where profiling shows it helps; don't premature-optimize.
- Supabase real-time subscription is used only for pet state updates (not for all tables).
