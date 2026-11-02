---
inclusion: fileMatch
fileMatchPattern:
  [
    "src/components/**",
    "src/app/**/*.tsx",
    "tailwind.config.ts",
    "src/app/globals.css",
  ]
---

# Haunted Pet To-Do — Visual Style Steering

## Design Language

Pixel-art game UI with a CRT monitor aesthetic. Every element should feel like it's running on a haunted 1990s computer. The palette is deliberately limited, animations are snappy and stepped, and the scanline overlay ties everything together.

---

## Color Palette

Use only these colors. Define them as Tailwind CSS custom properties in `tailwind.config.ts` and as CSS custom properties in `globals.css`. Do not hardcode hex values in component files — reference the token names.

| Token name | Hex | Role |
|---|---|---|
| `--color-bg-void` | `#0d0a1a` | Page background (deep dark purple-black) |
| `--color-bg-panel` | `#1a1530` | Card / panel background |
| `--color-bg-panel-raised` | `#231d3e` | Elevated panel, modal background |
| `--color-ghost-white` | `#e8e0f0` | Primary text, ghost sprite highlight |
| `--color-ghost-dim` | `#a098b8` | Secondary text, disabled states |
| `--color-pumpkin` | `#e8730a` | Accent — buttons, active states, HP bar (healthy) |
| `--color-pumpkin-dark` | `#a34f00` | Button pressed / hover darken |
| `--color-slime` | `#4caf50` | Task complete, Hunger bar, positive feedback |
| `--color-slime-dark` | `#2e7d32` | Slime hover/pressed |
| `--color-blood` | `#c0392b` | Damage, overdue indicator, HP bar (critical) |
| `--color-blood-dark` | `#922b21` | Deep damage pulse |
| `--color-mood-purple` | `#9b59b6` | Mood bar fill |
| `--color-bone` | `#f5e6c8` | Tombstone text, epitaph |
| `--color-scanline` | `rgba(0,0,0,0.18)` | CRT scanline stripe color |
| `--color-vignette-start` | `rgba(0,0,0,0)` | Vignette gradient inner |
| `--color-vignette-end` | `rgba(0,0,0,0.72)` | Vignette gradient outer |

**Never use Tailwind's default color palette** (no `blue-500`, `red-600`, etc.) in this project. Only the tokens above.

---

## Typography

| Use | Font | Notes |
|---|---|---|
| All UI text | **Press Start 2P** (Google Fonts) | The canonical pixel font; load via `next/font/google` |
| Epitaph text | **Press Start 2P** at 8px / `text-[8px]` | Smaller size for tombstone flavour |
| Stat numbers | **Press Start 2P** at 10px | HP / Hunger / Mood values |

- Line height for Press Start 2P: `leading-relaxed` (it needs room — the font has no descenders but feels cramped at tight leading).
- Do not use any other fonts. No system fonts except as a fallback stack after Press Start 2P.
- Minimum rendered font size: 8px. Never smaller.
- Text contrast: all text on dark backgrounds must pass WCAG AA (4.5:1). Ghost-white `#e8e0f0` on void `#0d0a1a` = ~14:1 ✅.

---

## Pixel Art Sprites

### Sizing and Rendering

All sprites are integer-scaled PNGs. Never use fractional scales.

| Sprite category | Source size | Display size | Tailwind class |
|---|---|---|---|
| Egg | 16×16 px | 64×64 px (4×) | `w-16 h-16` |
| Hatchling | 16×16 px | 64×64 px (4×) | `w-16 h-16` |
| Adult / Evolved | 24×24 px | 96×96 px (4×) | `w-24 h-24` |
| Tombstone | 24×32 px | 96×128 px (4×) | `w-24 h-32` |
| Zombie | 16×16 px | 48×48 px (3×) | `w-12 h-12` |

Apply `image-rendering: pixelated` to every `<img>` or `<canvas>` that displays a sprite:

```css
/* globals.css */
.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges; /* Firefox fallback */
}
```

```tsx
// In every sprite component
<img className="pixel-art w-24 h-24" src={spriteSrc} alt={altText} />
```

### Animation Frames

Sprite animations use CSS `steps()` or Framer Motion `variants` with `type: "tween"` and `ease: "linear"` combined with a stepped keyframe. No easing curves on sprites — stepped only.

---

## CRT Overlay (`CrtOverlay.tsx`)

The `CrtOverlay` is a fixed, pointer-events-none `<div>` that sits above all content (z-index: 50). It renders two layers:

1. **Scanlines**: a repeating linear gradient with 2px on / 2px off stripes using `--color-scanline`.
2. **Vignette**: a radial gradient from transparent center to `--color-vignette-end` at edges.

```css
/* Scanlines */
background-image: repeating-linear-gradient(
  to bottom,
  transparent 0px,
  transparent 2px,
  var(--color-scanline) 2px,
  var(--color-scanline) 4px
);

/* Vignette (separate element or pseudo) */
background: radial-gradient(
  ellipse at center,
  var(--color-vignette-start) 55%,
  var(--color-vignette-end) 100%
);
```

**`prefers-reduced-motion` rule**: when the user has `prefers-reduced-motion: reduce`, hide the scanline layer entirely. The vignette may remain. Use Framer Motion's `useReducedMotion()` or a CSS media query — never force animated overlays on motion-sensitive users.

```tsx
// CrtOverlay.tsx
const reducedMotion = useReducedMotion();
// Omit scanlines div when reducedMotion is true
```

---

## Framer Motion Animation Rules

| Property | Value | Reason |
|---|---|---|
| Transition type | `"tween"` | Predictable, game-like |
| Easing | `"easeOut"` or `[0.0, 0.0, 0.2, 1.0]` | Snappy, not springy |
| Duration (micro) | `0.08s` | Button press, state flash |
| Duration (short) | `0.15s` | Sprite swap, toast appear |
| Duration (medium) | `0.3s` | Panel slide, zombie enter |
| Duration (long) | `0.6s` | Pet evolution, egg hatch |
| Spring physics | ❌ Forbidden | Feels floaty; breaks the retro game aesthetic |
| Keyframe sprites | `steps(N, end)` | Pixel sprite frame cycling |

Every `<motion.*>` component must check `useReducedMotion()` and fall back to an instant (duration: 0) or opacity-only transition when true.

```tsx
const reduced = useReducedMotion();
const transition = reduced ? { duration: 0 } : { type: "tween", duration: 0.3, ease: "easeOut" };
```

### Key Animation Definitions

| Event | Animation |
|---|---|
| Zombie spawn | Slide in from right edge, 0.3s easeOut |
| Zombie walk | Looping translateX, stepped sprite frames |
| Pet hurt | Flash blood-red overlay on pet sprite, 0.08s, 2 pulses |
| Pet evolve | Scale 1→1.4→1 + color flash pumpkin→ghost-white, 0.6s |
| Egg hatch | Shake → crack → dissolve, 0.8s total |
| Task complete | Strikethrough + slime-green flash on row, 0.15s |
| Tombstone appear | Fade in from opacity 0, slide up 8px, 0.3s |
| Speech bubble | Pop in with scale 0.8→1, 0.15s easeOut |

---

## Zombie Visuals

- Zombies occupy the `ZombieLayer` — an absolutely positioned full-viewport overlay (`position: fixed; inset: 0; pointer-events: none; z-index: 40`).
- Each zombie is keyed by the overdue task's `id` so React doesn't remount on re-renders.
- Zombies walk from right to left at a random y-position in the lower 30% of the screen.
- Walking speed is `48px/s` (CSS `animation: zombieWalk linear infinite`).
- Zombie sprite cycles through `zombie_walk_0.png` → `zombie_walk_1.png` → `zombie_walk_2.png` → loop.
- On death (task completed or pet reborn), the zombie plays a brief dissolve animation (opacity 1→0, 0.3s) then unmounts.

---

## Tombstone Visuals

- Full-screen overlay with semi-transparent `--color-bg-void` at 90% opacity behind the tombstone.
- Tombstone image: `tombstone.png` centered, displayed at source 4× scale.
- Epitaph rendered in `--color-bone` using Press Start 2P at 8px, centered on the tombstone image using absolute positioning.
- A "New Egg" button (`PixelButton`) appears below the tombstone after the epitaph is fully displayed (delay 1.5s).

---

## Sound Effects

| Event | File | Max length |
|---|---|---|
| Task completed | `task_complete.ogg` | 0.5s |
| Zombie spawns | `zombie_spawn.ogg` | 0.8s |
| Pet takes damage | `pet_hurt.ogg` | 0.3s |
| Pet dies | `pet_death.ogg` | 1.5s |
| Egg hatches | `pet_hatch.ogg` | 1.0s |
| Pet evolves | `pet_evolve.ogg` | 1.2s |

Rules:
- All audio is **muted by default** until the first user interaction (pointer or key event). This satisfies browser autoplay policies.
- `SoundProvider` manages a single `AudioContext`; all sounds play through it.
- A `MuteToggle` button (speaker icon, pixel-art style) is always visible in the top-right corner. It persists the mute preference in `localStorage`.
- Sound files are 8-bit / chiptune style. No orchestral or realistic sounds.
- Do not use the HTML `<audio>` tag directly in components; always go through `SoundProvider`.

---

## UI Components

### PixelButton
- Border: 2px solid `--color-ghost-white`; 1px inset shadow `--color-ghost-dim`.
- On press: translate Y+1px, border becomes `--color-ghost-dim`.
- Focus ring: 2px solid `--color-pumpkin`, offset 2px. Never `outline: none`.
- Text: Press Start 2P, uppercase, 10px.

### StatBar (HP / Hunger / Mood)
- Container: fixed-width bar with `--color-bg-panel` background, 2px border.
- Fill color: `--color-pumpkin` for HP (healthy), `--color-blood` when HP < 25%; `--color-slime` for Hunger; `--color-mood-purple` for Mood.
- Animated fill with `width` transition 0.15s easeOut (skip if `prefers-reduced-motion`).
- Label and numeric value shown alongside (not inside) the bar so color is not the sole indicator.

### Toast
- Appears bottom-center, slides up 12px, 0.15s easeOut.
- Dark panel background `--color-bg-panel-raised`, ghost-white text, pixel border.
- Auto-dismisses after 4s unless it's a pet-death toast (which requires user action).

---

## Accessibility Checklist for UI Reviewers

Apply this checklist to every PR that touches `src/components/**`, `src/app/**/*.tsx`, or styles:

- [ ] All interactive elements are reachable by keyboard (Tab order is logical).
- [ ] All interactive elements have a visible focus ring using `--color-pumpkin` outline.
- [ ] No `outline: none` or `outline: 0` without a custom focus-visible replacement.
- [ ] Color is never the sole differentiator (labels, icons, or text always accompany color-coded states).
- [ ] All `<img>` sprite elements have descriptive `alt` text (e.g., `alt="Ghost pet — adult stage, hungry"`).
- [ ] CRT scanline animation is suppressed under `prefers-reduced-motion: reduce`.
- [ ] Zombie walk animation stops (or becomes static) under `prefers-reduced-motion: reduce`.
- [ ] All Framer Motion components use the `reduced ? { duration: 0 } : …` pattern.
- [ ] Sound is off by default; `MuteToggle` is visible on every page.
- [ ] `MuteToggle` has an `aria-label` that reflects current state: `"Mute sound"` / `"Unmute sound"`.
- [ ] Tombstone epitaph text has sufficient contrast: `--color-bone` on tombstone image background.
- [ ] Press Start 2P is loaded via `next/font/google` and has a legible fallback in the font stack.
- [ ] No text is rendered smaller than 8px.
- [ ] StatBars include a text label and numeric value alongside the colored bar.
