---
inclusion: always
---

# Haunted Pet To-Do — Structure Steering

## Directory Layout

```
haunted-pet-todo/
├── .kiro/
│   ├── steering/
│   │   ├── product.md
│   │   ├── tech.md
│   │   ├── structure.md
│   │   ├── pet-voice.md
│   │   ├── visual-style.md
│   │   └── build-order.md
│   └── hooks/
│       ├── run-game-tests.json
│       ├── visual-style-check.json
│       ├── pet-voice-check.json
│       └── no-date-now-guard.json
├── public/
│   ├── sprites/          # pixel-art PNGs; named <stage>_<frame>.png
│   │   ├── egg_idle.png
│   │   ├── hatchling_idle.png
│   │   ├── hatchling_happy.png
│   │   ├── adult_idle.png
│   │   ├── adult_hungry.png
│   │   ├── adult_night_owl_idle.png
│   │   ├── adult_early_bird_idle.png
│   │   ├── adult_scholar_idle.png
│   │   ├── adult_haunter_idle.png
│   │   ├── dead.png           # death overlay / transition frame
│   │   ├── tombstone.png
│   │   └── zombie_walk_0.png  # zombie sprite sheet frames
│   └── sfx/              # 8-bit .ogg files; named <event>.ogg
│       ├── task_complete.ogg
│       ├── zombie_spawn.ogg
│       ├── pet_hurt.ogg
│       ├── pet_death.ogg
│       ├── pet_hatch.ogg
│       └── pet_evolve.ogg
├── supabase/
│   └── migrations/       # numbered SQL files: 0001_init.sql, 0002_rls.sql …
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── cron/
│   │       │   └── decay/
│   │       │       └── route.ts    # daily decay backstop (Hobby cron)
│   │       ├── tasks/
│   │       │   └── route.ts        # CRUD for tasks
│   │       ├── pet/
│   │       │   └── route.ts        # read/write pet state
│   │       ├── ai/
│   │       │   ├── epitaph/
│   │       │   │   └── route.ts    # LLM epitaph generation
│   │       │   ├── breakdown/
│   │       │   │   └── route.ts    # LLM task breakdown
│   │       │   └── nag/
│   │       │       └── route.ts    # LLM nag message generation
│   │       ├── push/
│   │       │   └── route.ts        # Web Push subscription + send
│   │       └── demo/
│   │           └── fast-forward/
│   │               └── route.ts    # Demo-mode time fast-forward
│   ├── components/
│   │   ├── pet/
│   │   │   ├── PetSprite.tsx       # renders the correct sprite for life stage
│   │   │   ├── PetStats.tsx        # HP / Hunger / Mood bars
│   │   │   ├── SpeechBubble.tsx    # pet nag / dialogue
│   │   │   ├── Tombstone.tsx       # tombstone + epitaph display
│   │   │   └── EggHatch.tsx        # egg → hatchling animation
│   │   ├── tasks/
│   │   │   ├── TaskList.tsx
│   │   │   ├── TaskItem.tsx
│   │   │   ├── TaskForm.tsx
│   │   │   └── SubtaskList.tsx
│   │   ├── zombies/
│   │   │   ├── ZombieLayer.tsx     # absolutely-positioned overlay for all zombies
│   │   │   └── ZombieSprite.tsx    # single crawling zombie, keyed by task id
│   │   ├── ui/
│   │   │   ├── CrtOverlay.tsx      # scanline + vignette overlay
│   │   │   ├── PixelButton.tsx
│   │   │   ├── StatBar.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── MuteToggle.tsx
│   │   │   └── DemoControls.tsx    # only when server DEMO_MODE=true
│   │   └── providers/
│   │       ├── SoundProvider.tsx   # manages AudioContext, mute state
│   │       └── GameStateProvider.tsx # Supabase real-time + client cache
│   └── lib/
│       ├── game/                   # PURE FUNCTIONS ONLY — no React, no I/O
│       │   ├── clock.ts            # Clock interface + OffsetClock (no wall clock)
│       │   ├── constants.ts        # MAX_HP, DECAY_RATES, ZOMBIE_DRAIN, thresholds
│       │   ├── events.ts           # GameEvent discriminated union + append helpers (pure)
│       │   ├── pet.ts              # PetState type, PetStage, PetStatus, initialPetState, rebirthPet, applyPetEvent
│       │   ├── evolution.ts        # canEvolve, resolveEvolvedForm, hourFromTimestamp
│       │   ├── decay.ts            # decayStats(pet, now) → PetState, decayAmount, decayRange
│       │   ├── tasks.ts            # Task type, isOverdue, taskCompletionDeltas, makeTaskCompletedEvent
│       │   └── zombies.ts          # ZombieState, activeZombies, makeZombieDrainEvent, zombieDamage
│       ├── ai/
│       │   ├── epitaph.ts          # buildEpitaphPrompt(pet, tasks) → string
│       │   ├── breakdown.ts        # buildBreakdownPrompt(task) → string
│       │   ├── nag.ts              # buildNagPrompt(pet, tasks, level) → string
│       │   └── schemas.ts          # Zod schemas for LLM response shapes
│       ├── server/
│       │   └── clock.ts            # SystemClock, the one wall-clock call site
│       ├── db/
│       │   ├── client.ts           # Supabase client (server + browser exports)
│       │   ├── tasks.ts            # DB helpers: getTasks, upsertTask, etc.
│       │   ├── pet.ts              # DB helpers: getPetState, savePetState
│       │   └── events.ts           # DB helper: appendEvent
│       └── push/
│           ├── vapid.ts            # VAPID key helpers
│           └── notify.ts           # sendPushNotification(subscription, payload)
├── tests/                          # mirrors src/ structure
│   ├── game/
│   │   ├── decay.test.ts
│   │   ├── pet.test.ts
│   │   ├── tasks.test.ts
│   │   ├── zombies.test.ts
│   │   ├── evolution.test.ts
│   │   └── invariants.property.ts  # fast-check property-based tests
│   ├── ai/
│   │   ├── epitaph.test.ts
│   │   ├── breakdown.test.ts
│   │   └── nag.test.ts
│   └── db/
│       ├── tasks.test.ts
│       └── pet.test.ts
├── .env.example
├── .gitignore
├── LICENSE                         # MIT
├── README.md
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── vercel.json
└── package.json
```

## Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| React components | PascalCase `.tsx` | `PetSprite.tsx` |
| Pure library modules | camelCase `.ts` | `decay.ts` |
| Test files — unit | `<module>.test.ts` | `decay.test.ts` |
| Test files — PBT | `<module>.property.ts` | `invariants.property.ts` |
| DB migration files | `NNNN_<description>.sql` | `0001_init.sql` |
| Sprite files | `<stage>_<state>.png` | `adult_hungry.png` |
| Sound effect files | `<event>.ogg` | `task_complete.ogg` |
| Env vars (public) | `NEXT_PUBLIC_<SCREAMING_SNAKE>` | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` |
| Env vars (server) | `SCREAMING_SNAKE_CASE` | `OPENAI_API_KEY` |
| CSS custom properties | `--hp-color`, `--pet-sprite-size` | kebab-case with semantic prefix |
| Constants | `SCREAMING_SNAKE_CASE` in `constants.ts` | `MAX_HP`, `DECAY_RATE_HP` |
| Pet life stage literals | lowercase snake_case string | `"egg"`, `"adult_haunter"` (see `PetStage`; does NOT include `"dead"` or `"tombstone"`) |
| Task status literals | lowercase | `"todo"`, `"done"`, `"overdue"` |
| Pet status literals | lowercase | `"alive"`, `"dead"`, `"tombstone"` (see `PetStatus`; orthogonal to `PetStage`) |

## Layer Import Rules

Strictly enforce the following import directions. A lower layer **must not** import from a higher layer.

```
src/lib/game/        ← no external imports (pure functions + types only)
      ↑
src/lib/ai/          ← may import from src/lib/game/ (for types/constants)
src/lib/db/          ← may import from src/lib/game/ (for types)
src/lib/push/        ← standalone; no game imports needed
      ↑
src/app/api/         ← may import from any src/lib/ module
      ↑
src/components/      ← may import from src/lib/game/ (types only, no mutation)
                        may NOT import from src/app/api/ directly
                        may NOT import from src/lib/db/ directly
                        fetches data via SWR/fetch to src/app/api/ routes
      ↑
src/app/             ← may import from src/components/, src/lib/game/ (types)
```

**Summary**: `src/lib/game/` is the dependency-free core. Everything else depends on it; it depends on nothing. Components talk to the server only through `fetch` / API routes, never by importing DB or LLM clients directly.

## Key Type Locations

All canonical shared types live in `src/lib/game/`:

- `PetState` — in `src/lib/game/pet.ts`
- `PetStage` (union of stage literals) — in `src/lib/game/pet.ts`
- `PetStatus` (union: `"alive" | "dead" | "tombstone"`) — in `src/lib/game/pet.ts`
- `Task`, `TaskStatus` — in `src/lib/game/tasks.ts`
- `ZombieState` — in `src/lib/game/zombies.ts`
- `GameEvent` — in `src/lib/game/events.ts`
- `Clock` interface — in `src/lib/game/clock.ts`
- `DECAY_RATES`, `MAX_HP`, `ZOMBIE_DRAIN_PER_HOUR` — in `src/lib/game/constants.ts`

Do not re-declare these types elsewhere. Import from `src/lib/game/` wherever they are needed.
