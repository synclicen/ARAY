# ARAY Branding

> **ARAY** — Are you Ready? and....Yapping!
>
> Yap. Snap. Repeat.

This document defines the ARAY brand system: colors, typography, logo, voice, and component styling. Every visual element in the application must derive from these tokens. **Do not hardcode colors in components.**

## Brand Personality

ARAY is a friend who invites you to have fun — confident, friendly, premium, youthful. The tone is playful but never childish. Think "luxury event technology" + "social fun", not "consumer camera app".

| Trait | Expression |
|---|---|
| Fun | Microcopy, animation timing, celebration moments |
| Elegant | Restrained color use, generous whitespace, premium typography |
| Premium | Gold accents used sparingly, dark surfaces, soft shadows |
| Social | Result screen emphasizes sharing, "Look at you!" celebration |
| Interactive | Hover states, countdown animations, capture feedback |
| Playful | "Yap" branding, emoji-free but warm copy |
| Modern | Inter typeface, glassmorphism, gradients |
| Energetic | Glow effects, motion on key actions |

## Color System

### Primary — Purple Haze

Purple Haze is the dominant brand color. Use it for ~60% of the interface.

| Token | Hex | Usage |
|---|---|---|
| `purple-haze-50` | `#F4F0FA` | Lightest tint — backgrounds, hover washes |
| `purple-haze-100` | `#E6DCF2` | Light accents |
| `purple-haze-200` | `#CDB8E4` | Logo gradient start |
| `purple-haze-300` | `#B493D6` | Active states |
| `purple-haze-400` | `#9B6FC8` | Hover on primary |
| `purple-haze-500` | `#7B61A8` | **Primary brand color** |
| `purple-haze-600` | `#654E8E` | Pressed states |
| `purple-haze-700` | `#4F3C74` | Card backgrounds (gradient end) |
| `purple-haze-800` | `#392B5A` | Elevated surfaces |
| `purple-haze-900` | `#241A40` | Sidebar background |
| `purple-haze-950` | `#120D24` | Splash gradient end |

### Accent — Gold

Gold is the luxury accent. Use it for ~15% of the interface — never as a background, only for CTAs, highlights, and premium indicators.

| Token | Hex | Usage |
|---|---|---|
| `gold-50` | `#FBF6E6` | Lightest gold tint |
| `gold-100` | `#F6ECC2` | |
| `gold-200` | `#EDD985` | |
| `gold-300` | `#E4C647` | Hover on gold CTA |
| `gold-400` | `#D4AF37` | **Primary accent** — CTA buttons, active badges |
| `gold-500` | `#B8932B` | Pressed state |
| `gold-600` | `#8C701F` | |
| `gold-700` | `#5F4C14` | |
| `gold-800` | `#322808` | |
| `gold-900` | `#1A1404` | Gold text on dark |

### Secondary — Silver

Silver is the metallic secondary. Use it for ~25% of the interface — borders, secondary buttons, separators, subtle details.

| Token | Hex | Usage |
|---|---|---|
| `silver-50` | `#F8F8FA` | |
| `silver-100` | `#EDEDF1` | Body text on dark |
| `silver-200` | `#DCDCE3` | Primary text |
| `silver-300` | `#C0C0C8` | Borders, dividers |
| `silver-400` | `#A8A8B2` | Secondary text |
| `silver-500` | `#909099` | Muted text |
| `silver-600` | `#74747C` | Placeholder text |
| `silver-700` | `#56565C` | Disabled states |
| `silver-800` | `#38383C` | |
| `silver-900` | `#1E1E22` | Progress track background |

### Surface (Dark Premium)

| Token | Hex | Usage |
|---|---|---|
| `surface.base` | `#0F0B1A` | App background |
| `surface.raised` | `#1A1330` | Sidebar, cards |
| `surface.elevated` | `#241A40` | Modals, dropdowns |
| `surface.overlay` | `#2E2150` | Active card highlights |

### Status

| Token | Hex | Usage |
|---|---|---|
| `status.success` | `#5FCF80` | Synced, healthy, printed |
| `status.warning` | `#E4C647` | Storage < 50GB, pending |
| `status.danger` | `#E45A5A` | Failed, critical storage |
| `status.info` | `#7B61A8` | Informational badges |

### Color Balance Rule

> **Purple Haze ≈ 60% · Silver ≈ 25% · Gold ≈ 15%**

Never use all three colors heavily on a single component. A gold button on a purple card with a silver border is acceptable; a gold gradient card with purple text on silver background is visual chaos.

## Typography

### Primary typeface

**Inter** — modern, premium, neutral. Loaded via system fallback (no web font fetch in Phase 1 for offline-first; Phase 2 will bundle Inter as a woff2 asset).

```css
font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

### Scale

| Token | Size | Usage |
|---|---|---|
| `xs` | 0.75rem (12px) | Badges, meta text |
| `sm` | 0.875rem (14px) | Body small, button text |
| `base` | 1rem (16px) | Body default |
| `lg` | 1.125rem (18px) | Lead text |
| `xl` | 1.25rem (20px) | Card titles |
| `2xl` | 1.5rem (24px) | Section headers |
| `3xl` | 1.875rem (30px) | Page titles |
| `4xl` | 2.25rem (36px) | Hero subtitles |
| `5xl` | 3rem (48px) | Booth greeting |
| `6xl` | 4rem (64px) | Countdown digits (small) |
| `7xl` | 5rem (80px) | Countdown digits (large) |

### Weights

| Token | Weight | Usage |
|---|---|---|
| `regular` | 400 | Body text |
| `medium` | 500 | Badges, captions |
| `semibold` | 600 | CTAs, button labels |
| `bold` | 700 | Section headers, card titles |
| `extrabold` | 800 | Logo, page titles, countdown |

### Letter spacing

| Token | Value | Usage |
|---|---|---|
| `tight` | -0.02em | Large headings |
| `normal` | 0 | Body |
| `wide` | 0.05em | Badges |
| `wider` | 0.1em | Buttons |
| `widest` | 0.2em | Uppercase labels |

## Logo

### Construction

The ARAY logo is a wordmark — four uppercase letters "ARAY" set in Inter Extrabold with tight letter-spacing (`-0.04em`) and a tri-color gradient fill (purple → gold → silver).

```css
.aray-gradient-text {
  background: linear-gradient(135deg, #CDB8E4 0%, #D4AF37 50%, #C0C0C8 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

### Variants

| Variant | When to use |
|---|---|
| Full (logo + tagline) | Splash, first-run welcome, about page |
| Logo only | Sidebar (collapsed), header, modal headers |
| Small | Footer, modals, empty states |

### Sizes

| Size | Logo font-size | Tagline font-size |
|---|---|---|
| `sm` | 1.5rem (24px) | 0.75rem (12px) |
| `md` | 2.25rem (36px) | 0.875rem (14px) |
| `lg` | 3rem (48px) | 1rem (16px) |
| `xl` | 5rem (80px) | 1.125rem (18px) |

### Clear space

Maintain at least 1x the cap height of "A" as clear space on all sides. Never place the logo on a busy background — always on `surface.base` or a `purple-haze-950` gradient.

### Future icon logo

Phase 2 will commission a custom icon mark (likely a stylized "A" or camera shutter abstraction). The wordmark will remain the primary logo; the icon will be used for:

- App icon (Windows .ico, macOS .icns)
- Taskbar / Start Menu
- Installer
- Favicon
- Loading spinner

## Microcopy

ARAY's voice is warm, confident, and brief. Use these phrases sparingly — never all at once.

### Greeting & countdown

- "Are you ready?"
- "Let's yap!"
- "Ready? Smile!"
- "Your moment is loading..."
- "Say cheese!"
- "Strike a pose."
- "Don't blink."

### Capture feedback

- "YAP!" (during flash)
- "That was cute."
- "One more?"
- "Memory unlocked."
- "Look at you!" (result screen headline)

### Sync & storage

- "Your yap is safe."
- "Your memories are ready."
- "ARAY needs a little more space before we make another memory." (storage critical)
- "Your camera took a little break. Please reconnect it." (camera error)

### Brand motto

> **Yap. Snap. Repeat.**

Use as a footer tagline, header accent, or empty-state filler. Never as a button label.

### Anti-patterns

Do NOT use:

- "Electron demo"
- "PhotoBooth App"
- "Demo Booth"
- "Unhandled IPC exception"
- "Error: null"
- Any error message that exposes internal state (paths, stack traces, SQL)

## UI Components

All components live in `src/renderer/src/components/ui/` and are exported from `index.ts`.

### ArayButton

| Variant | Use case |
|---|---|
| `primary` | Default actions (purple gradient) |
| `gold` | Primary CTAs ("LET'S YAP!", "Start Booth") |
| `silver` | Secondary actions ("New Event", "Refresh") |
| `ghost` | Tertiary actions ("Cancel", "Skip") |
| `danger` | Destructive actions ("Delete", "Disconnect") |

Sizes: `sm`, `md` (default), `lg`, `xl` (booth CTA).

### ArayCard

Translucent dark surface with silver border. Variants:
- Default — standard card
- `hover` — interactive card (border + glow on hover)
- `glow` — always glowing (active selection)

### ArayBadge

| Variant | Use case |
|---|---|
| `purple` | ARAY-branded tags |
| `gold` | Premium indicators, active event |
| `silver` | Neutral labels |
| `success` | Synced, healthy, printed |
| `warning` | Pending, low storage |
| `danger` | Failed, critical |
| `info` | Informational |

### ArayProgress

Linear progress bar with three color variants: `purple` (default), `gold` (warning/critical), `silver` (neutral). Optional `showLabel` prop renders percentage below.

### AraySyncStatus

Compact pill showing sync status with icon + label. Variants auto-derived from `SyncStatus` enum:
- `LOCAL_ONLY` → silver check
- `PENDING` → yellow clock
- `UPLOADING` → blue spinner
- `SYNCED` → green cloud
- `FAILED` → red alert
- `RETRYING` → yellow spinner
- `OFFLINE` → gray cloud-off

### ArayLogo

Wordmark with optional tagline and animation. See Logo section above.

### AraySplash

Full-screen loading state with logo + animated message. Used during app boot before settings load.

## Animation

ARAY uses **Framer Motion** for animations. Principles:

1. **Fast by default** — 200-300ms transitions. Never longer than 500ms for non-cinematic UI.
2. **Easing** — `cubic-bezier(0.16, 1, 0.3, 1)` for entrance, `ease-out` for hover.
3. **Purposeful** — every animation communicates state change. No decorative motion.
4. **Respect reduced motion** — Phase 2 will add `prefers-reduced-motion` support.

### Animation catalog

| Animation | Trigger | Duration |
|---|---|---|
| Logo fade-in | Splash, first-run | 600ms |
| Page transition | Route change | 250ms |
| Modal scale-in | Open dialog | 200ms spring |
| Countdown digit | Each second | 500ms scale + fade |
| Flash overlay | Capture moment | 220ms |
| Result headline | Result screen | spring (stiffness 200, damping 12) |
| Card hover | Mouse enter | 200ms translateY -2px |
| Button glow-pulse | Active CTA | 2.4s infinite |

## Iconography

ARAY uses **Lucide Icons** — clean, consistent, MIT-licensed. All icons are 1.5px stroke, 24×24 viewBox, rendered at 16px (small) or 20px (large) in UI.

Common icons:
- `Camera` — booth, capture
- `Images` — gallery
- `CalendarDays` — events
- `Cloud` / `CloudOff` — sync status
- `Printer` — print queue
- `Settings` — config
- `Sparkles` — premium indicator, "Are you ready?"
- `RefreshCw` — sync, retry
- `Check` / `CheckCircle2` — success
- `AlertTriangle` — warning
- `X` — close, cancel

Do NOT mix icon libraries. If Lucide lacks an icon, commission a custom SVG that matches the 1.5px stroke style.

## Empty States

Every empty state includes:

1. **Dimmed ARAY logo** (size `sm`, no tagline, opacity 50%)
2. **Headline** — what's empty (e.g., "No events yet")
3. **Subtext** — empathetic, on-brand (e.g., "Create your first event to get started.")
4. **CTA button** — primary action to fill the empty state

Example (Dashboard with no events):

```jsx
<div className="text-center py-12">
  <ArayLogo size="sm" showTagline={false} className="mb-3 opacity-50" />
  <p className="text-silver-400 text-sm">No events yet. Let's make your first one!</p>
  <ArayButton variant="primary" className="mt-4" icon={<Plus />}>
    Create Event
  </ArayButton>
</div>
```

## Asset Organization

```
src/renderer/src/assets/
├── logo/                    ← SVG variants (Phase 2)
├── icons/                   ← Custom SVG icons (Phase 2)
├── backgrounds/             ← Splash gradient textures (Phase 2)
├── sounds/                  ← Capture click, countdown beep (Phase 2)
├── animations/              ← Lottie JSON files (Phase 2)
└── templates/               ← Default template preview images (Phase 2)
```

All assets are bundled with the app (no CDN fetches). This keeps ARAY fully offline-capable.
