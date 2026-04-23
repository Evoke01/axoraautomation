---
name: Axora
description: >
  Autonomous content distribution engine. Dark, high-contrast SaaS dashboard
  with a glass-morphism surface language, indigo/violet accent system, and
  motion-forward interactions. Built on Tailwind CSS v4 + Shadcn/ui + motion/react.

colors:
  # ── Core backgrounds
  background:
    default: "#030303"
    surface: "rgba(255, 255, 255, 0.03)"
    surface-hover: "rgba(255, 255, 255, 0.05)"
    surface-active: "rgba(255, 255, 255, 0.10)"
    sidebar: "rgba(9, 9, 11, 0.40)"
    card: "rgba(0, 0, 0, 0.20)"
    input: "#f3f3f5"
    loading: "#030303"

  # ── Foreground / text
  foreground:
    primary: "#ffffff"
    secondary: "#a1a1aa"
    muted: "#71717a"
    subtle: "#52525b"
    placeholder: "#3f3f46"

  # ── Borders
  border:
    default: "rgba(255, 255, 255, 0.10)"
    subtle: "rgba(255, 255, 255, 0.05)"
    micro: "rgba(255, 255, 255, 0.03)"
    focus: "rgba(255, 255, 255, 0.30)"
    sidebar-divider: "rgba(255, 255, 255, 0.05)"

  # ── Brand accent — indigo/violet
  accent:
    indigo: "#6366f1"
    indigo-dim: "rgba(99, 102, 241, 0.10)"
    indigo-glow: "rgba(99, 102, 241, 0.80)"
    violet: "#8b5cf6"
    violet-dim: "rgba(139, 92, 246, 0.10)"
    gradient-primary: "linear-gradient(135deg, #6366f1, #8b5cf6)"

  # ── Semantic status palette
  status:
    live:
      fg: "#34d399"
      bg: "rgba(52, 211, 153, 0.10)"
      border: "rgba(52, 211, 153, 0.20)"
      glow: "rgba(52, 211, 153, 0.80)"
    scheduled:
      fg: "#22d3ee"
      bg: "rgba(34, 211, 238, 0.10)"
      border: "rgba(34, 211, 238, 0.20)"
    processing:
      fg: "#a78bfa"
      bg: "rgba(167, 139, 250, 0.10)"
      border: "rgba(167, 139, 250, 0.20)"
    warning:
      fg: "#fbbf24"
      bg: "rgba(251, 191, 36, 0.10)"
      border: "rgba(251, 191, 36, 0.20)"
    error:
      fg: "#f87171"
      bg: "rgba(239, 68, 68, 0.10)"
      border: "rgba(239, 68, 68, 0.20)"
    pending:
      fg: "#71717a"
      bg: "#27272a"
      border: "#3f3f46"
    info:
      fg: "#a5f3fc"
      bg: "rgba(6, 182, 212, 0.10)"
      border: "rgba(6, 182, 212, 0.20)"

  # ── Platform brand colours (text tints only — never fills)
  platform:
    youtube: "#f87171"
    instagram: "#f472b6"
    tiktok: "#e4e4e7"
    linkedin: "#22d3ee"
    x: "#e4e4e7"

  # ── Chart series
  chart:
    views: "#06b6d4"
    engagement: "#8b5cf6"
    series-1: "#ef4444"
    series-2: "#10b981"
    series-3: "#f59e0b"
    series-4: "#14b8a6"

  # ── Light-mode overrides (shadcn/ui baseline, dark mode is primary)
  light:
    background: "#ffffff"
    foreground: "#030213"
    primary: "#030213"
    primary-foreground: "#ffffff"
    secondary: "oklch(0.95 0.0058 264.53)"
    muted: "#ececf0"
    muted-foreground: "#717182"
    accent: "#e9ebef"
    destructive: "#d4183d"
    border: "rgba(0, 0, 0, 0.10)"

typography:
  fonts:
    sans: "'Outfit', sans-serif"
    heading: "'Space Grotesk', sans-serif"
    brand: "'Rajdhani', sans-serif"
    mono: "ui-monospace, monospace"

  weights:
    normal: 400
    medium: 500
    semibold: 600
    bold: 700

  scale:
    micro: "10px"
    xs: "12px"
    sm: "14px"
    base: "16px"
    lg: "18px"
    xl: "20px"
    2xl: "24px"
    3xl: "30px"
    4xl: "36px"

  line-heights:
    tight: 1.1
    snug: 1.3
    normal: 1.5
    relaxed: 1.6
    loose: 1.7

  tracking:
    brand-tagline: "0.45em"
    label-upper: "0.30em"
    nav-item: "0.05em"
    heading-tight: "-0.02em"
    normal: "0"
    wide: "0.05em"

spacing:
  page-padding: "24px"
  page-padding-lg: "32px"
  sidebar-width: "256px"
  sidebar-width-xl: "288px"
  card-padding: "20px"
  section-gap: "24px"
  nav-item-px: "16px"
  nav-item-py: "12px"
  content-max-width: "1400px"
  settings-max-width: "768px"

radii:
  none: "0"
  sm: "6px"
  md: "8px"
  base: "10px"
  xl: "14px"
  2xl: "16px"
  3xl: "24px"
  full: "9999px"

  components:
    nav-item: "16px"
    card: "16px"
    badge: "6px"
    button-sm: "8px"
    button: "10px"
    upload-zone: "24px"
    avatar: "12px"
    progress-bar: "9999px"
    modal: "16px"
    tag: "6px"

elevation:
  none: "none"
  sm: "0 1px 3px rgba(0,0,0,0.30)"
  base: "0 4px 16px rgba(0,0,0,0.30)"
  md: "0 8px 32px rgba(0,0,0,0.30)"
  lg: "0 20px 60px rgba(0,0,0,0.50)"
  glow-indigo: "0 0 8px rgba(99,102,241,0.80)"
  glow-emerald: "0 0 8px rgba(52,211,153,0.80)"
  glow-cyan: "0 0 6px rgba(34,211,238,0.60)"
  glow-amber: "0 0 6px rgba(251,191,36,0.60)"

motion:
  duration:
    instant: "100ms"
    fast: "200ms"
    base: "300ms"
    slow: "500ms"
    very-slow: "1000ms"
    shimmer: "2500ms"
    dot-pulse: "2000ms"

  easing:
    default: "ease-out"
    ease-in-out: "easeInOut"
    linear: "linear"
    spring: "damping=25, stiffness=200"

  patterns:
    page-enter:
      initial: "opacity:0, y:8"
      animate: "opacity:1, y:0"
      duration: "300ms"
    row-expand:
      initial: "opacity:0, height:0"
      animate: "opacity:1, height:auto"
    logo-shimmer:
      keyframe: "left: -100% to 200%"
      duration: "2500ms"
      repeat: "Infinity"
      repeat-delay: "500ms"
      transform: "skewX(-12deg)"
    loading-dots:
      keyframe: "scale:[1,1.3,1], opacity:[0.3,0.8,0.3]"
      stagger-delay: "400ms"
      duration: "2000ms"
    mobile-drawer:
      type: "spring"
      damping: 25
      stiffness: 200
    sidebar-active-pill:
      type: "framer-motion layoutId shared layout"
      layoutId: "sidebar-active-pill"
    status-dot-live:
      type: "css animate-pulse"
      duration: "2000ms"

effects:
  blur:
    xs: "4px"
    sm: "8px"
    md: "12px"
    lg: "24px"
    xl: "64px"
    decorative: "120px"

  grid-overlay:
    image: >
      linear-gradient(to right, rgba(128,128,128,0.07) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(128,128,128,0.07) 1px, transparent 1px)
    size: "40px 40px"
    opacity: 0.20

  gradients:
    page-radial: "radial-gradient(circle at center, rgba(99,102,241,0.10) 0%, transparent 60%)"
    vignette: "radial-gradient(ellipse 80% 80% at 50% 50%, rgba(0,0,0,0.88) 0%, transparent 100%)"
    chart-views: "linear-gradient(to bottom, rgba(6,182,212,0.30), rgba(6,182,212,0))"
    chart-engagement: "linear-gradient(to bottom, rgba(139,92,246,0.24), rgba(139,92,246,0))"
    progress: "linear-gradient(to right, #34d399, #22d3ee)"
    sidebar-progress: "linear-gradient(to right, #6366f1, #8b5cf6)"
    shimmer: "linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)"
    logo-text: "linear-gradient(to bottom, #ffffff, rgba(255,255,255,0.40))"
---

# Axora Design System

## Identity

Axora presents itself as autonomous infrastructure, not a creator tool. The visual language reflects this: near-black voids, precise monochromatic surfaces, glowing accents that feel less like decoration and more like live system indicators. Every design decision reinforces the message that something powerful is running in the background — efficient, invisible, capable.

---

## Colour Philosophy

The palette is a dark monochromatic base with a single chromatic accent family and a strict semantic status system.

**Base surfaces** sit on `#030303` — near-pitch-black, not true black. All surfaces above it are built with white opacity layers: `rgba(255,255,255,0.03)` for the lowest-elevation panels, `rgba(255,255,255,0.10)` for active or focused states. This creates depth without introducing extra hues.

**Borders** follow the same logic — `rgba(255,255,255,0.10)` as standard, `rgba(255,255,255,0.05)` for interior dividers, `rgba(255,255,255,0.03)` for the most subtle separations. The effect is a frosted-glass stack of planes, each separated by luminosity alone.

**The accent system** centres on indigo (`#6366f1`) and violet (`#8b5cf6`). They appear as icon tints on active nav items, the sidebar storage progress bar, and the ambient glow that pulses behind the loading screen wordmark. The gradient `from-indigo-500 to-violet-500` is reserved exclusively for progress indicators and branded motion elements — never as a fill on text or interactive controls.

**Status colours** are applied strictly by semantic function:

| Status | Colour | Hex | Use |
|---|---|---|---|
| Live / published | emerald-400 | `#34d399` | Animated dot, approve button, upload progress gradient |
| Scheduled | cyan-400 | `#22d3ee` | Badge, drag-over upload ring |
| Processing | violet-400 | `#a78bfa` | Badge, spinning icon tint |
| Needs review | amber-400 | `#fbbf24` | Badge, warning icon |
| Error / destructive | red-400 | `#f87171` | Error banners |
| Pending / neutral | zinc-500 | `#71717a` | Default unresolved state |

Platform brand colours (`text-red-400` for YouTube, `text-pink-400` for Instagram, `text-cyan-400` for LinkedIn) are applied only to the platform label text — never as background fills.

---

## Typography

Three typefaces carry different registers of the interface.

**Outfit** (sans) is the body workhorse — clean, geometric, slightly rounded. It runs at weights 300–500 across all body copy, descriptions, labels, and most UI text. Its warmth softens the dark aesthetic without undermining the product's seriousness.

**Space Grotesk** (heading) handles all semantic headings (h1–h4) and section titles. It has a slight technical character — angular terminals, uneven optical corrections — that reads as "engineered" rather than "designed". It is always used at `font-weight: 500`, never bold, keeping headings refined.

**Rajdhani** (brand) appears only on the sidebar nav labels and the logo tagline — always uppercase, always wide-tracked (`tracking-[0.45em]` on the tagline "Autonomous engine", `tracking-[0.05em]` on nav item labels). It gives the navigation a military systems quality that reinforces the "engine" metaphor.

**Micro labels** — section dividers like "Connected platforms" or "Automation mode" — render `text-xs` (12px), `uppercase`, `tracking-wider` (approximately 0.05em), `font-medium`, `text-zinc-500`. They act as low-hierarchy dividers in negative space, not structural headings.

---

## Surface Language: Layered Glass Morphism

The primary surface pattern is controlled glass morphism. Cards and panels use `backdrop-blur-xl` (24px). The sidebar and mobile drawer use `backdrop-blur-3xl` (64px). The blur radius is intentionally generous — content behind panels should bleed through softly, maintaining spatial context.

Elevation is expressed through three mechanisms rather than traditional drop shadows:

1. **Opacity layers** — higher surfaces use higher white opacity (`0.03` → `0.05` → `0.10`)
2. **Border luminosity** — `rgba(255,255,255,0.10)` borders glow against dark backgrounds
3. **Coloured point glows** — status-coloured `box-shadow` values (`0 0 8px rgba(52,211,153,0.80)`) on the live status dot and active accent elements

The 40px grid crosshatch overlay (7% white opacity `rgba(128,128,128,0.07)`) appears on the loading screen and on dark background surfaces. It references engineering graph paper — precision, measurement — and is the only decorative texture in the entire system.

---

## Motion System

All animation runs through `motion/react` (Framer Motion). Motion is purposeful, not decorative.

**Entrance animations** use `initial: { opacity: 0, y: 8 }` → `animate: { opacity: 1, y: 0 }` across metric cards and post list items — a gentle 8px upward drift that communicates content arriving without demanding attention.

**The sidebar active pill** uses Framer Motion's `layoutId="sidebar-active-pill"` shared layout animation to physically move the background highlight between nav items as the user switches views. Navigation feels spatially grounded rather than just a colour swap.

**The loading screen shimmer** is the most theatrical animation: a `skewX(-12deg)` gradient band sweeps across the "AXORA" wordmark every 2.5 seconds. It evokes a laser scan or light glint — technology running, not idle.

**Loading dots**: four indigo orbs pulse with a 400ms stagger, `scale: [1, 1.3, 1]`, `opacity: [0.3, 0.8, 0.3]`. The combined rhythm reads as a system heartbeat.

**The mobile sidebar** uses a spring transition (`damping: 25, stiffness: 200`) — the panel feels physically attached rather than just CSS-transitioned.

**Row expansion** in the Queue uses `AnimatePresence` with `height: 0 → auto` and `opacity: 0 → 1`. Requires `overflow: hidden` on the parent to prevent layout bleed during the height transition.

Hover transitions run at `300ms ease-out`. Colour and opacity micro-interactions (border, background on hover) run at `200ms`. The rule: the faster the expected response, the shorter the transition.

---

## Layout System

Top-level layout is a two-column horizontal flex: sticky sidebar (256px desktop, 288px xl) + scrollable content column. The sidebar is `position: sticky; height: 100vh` and never scrolls independently.

Content area uses `max-width: 1400px` with `p-6` (24px, mobile) scaling to `p-8` (32px, lg+). The settings view is constrained further at `max-w-3xl` (768px) for readability.

Internal dashboard grids use a `1 → 2 → 3` column responsive progression: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` with `gap-4` (16px).

All dashboard cards share one structural class: `rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl`. This consistency makes the dashboard grid read as a cohesive module system rather than individually designed components.

---

## Component Patterns

**Cards**: `rounded-2xl` (16px), `border border-white/10`, `bg-white/[0.03]`, `p-5`, `backdrop-blur-xl`. Hover state upgrades background to `bg-white/[0.05]`. No explicit box-shadow — elevation is implied by the backdrop blur and border.

**Badges / status tags**: `rounded-md` (6px), `px-2.5 py-1`, `text-xs font-medium`, `border`. Colour from the semantic status triplet (fg/bg/border). Icons from lucide-react at 11px, `strokeWidth={1.5}`.

**Filter tabs**: `rounded-lg` (8px), `px-3 py-1.5`, `text-xs font-medium`. Active: `bg-white/10 text-white border-white/20`. Inactive: `border-white/10 text-zinc-400`. No `ring` on focus — the opacity difference carries the active state.

**Buttons**:
- Primary action (connect, approve): `bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg`
- Secondary (disconnect, generic): `bg-white/10 text-zinc-400 border border-white/10 rounded-lg`
- Ghost (filter): `border-white/10 text-zinc-400 hover:bg-white/5 rounded-lg`

**Upload zone**: `border-2 border-dashed rounded-3xl`. Three states — idle (dashed white border), drag-over (solid cyan ring, gradient bg), uploading (emerald ring, gradient bg, step log). The transition between states uses `AnimatePresence mode="wait"`.

**Nav items**: `rounded-2xl` (16px), `px-4 py-3`. Active state has a gradient overlay (`from-indigo-500/10 via-violet-500/5 to-transparent`), white text, indigo icon tint, and a 6px indigo indicator dot with glow. The `layoutId` animated background pill moves between items on navigation.

**Status dots**: `w-2 h-2` (8px), `rounded-full`. Live dot adds `animate-pulse` and `shadow-[0_0_6px_rgba(52,211,153,0.80)]`. This glow is the visual signature of the live state.

---

## Iconography

All icons from `lucide-react`. Size tiers: `16px` inline/metadata, `18–19px` nav, `20px` page actions, `36px` upload zone illustration.

Stroke width adjusts with context: `strokeWidth={2}` default, `strokeWidth={2.5}` on active nav items. This adds perceptible weight to the selected state beyond colour alone.

`RefreshCw` and `Loader2` are used for loading and processing states via `animate-spin`. `CheckCircle2` marks completed upload steps. `AlertTriangle` marks account warnings.

---

## Design Intent

Axora is an engine, not an app. The design communicates this through restraint: minimal colour, dark voids, precise grid, and glowing system indicators that resemble live telemetry rather than UI decoration. When the emerald dot pulses, it is not decorative — it reads as "system active". When the shimmer crosses the logo, it reads as "process running".

The product personality is confidence, not friendliness. The typography is uppercase and tracked. The sidebar is not a menu — it is a control panel. The upload zone is not a form — it is an intake terminal that logs its own processing steps in real time.

Every new component added to this system should answer one question: does it feel like a system that knows what it is doing, or does it feel like software trying to look impressive?
