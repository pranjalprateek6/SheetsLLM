# SheetsLLM Design System (v2 — light-first overhaul)

Personality: **calm, precise, trustworthy**. The product handles people's finance/ops
data; the design must feel like Stripe-grade infrastructure, not a hacker tool.
Marketing surfaces earn expressive gradients and motion; app surfaces stay quiet,
dense, and fast.

## Principles

1. **Message before pixels.** Every surface sells the wedge: reusable recipes,
   schema-only privacy, audit trail. Never "AI spreadsheet tool."
2. **The product is the hero art.** Marketing mockups are real DOM built from real
   components (Stripe/Cluely/Linear pattern), never screenshots.
3. **Two registers, one system.** Marketing pages: editorial type scale, gradients,
   scroll motion. App pages: compact scale, hairline borders, minimal motion.
   Same tokens everywhere.
4. **Light is less forgiving.** Elevation comes from layered soft shadows plus
   1px borders — never shadow alone, never border alone for raised surfaces.
5. **Motion is meaning.** Animate entrances and state changes once, 200–500ms,
   ease-out. Nothing loops except explicit loading states. Respect
   `prefers-reduced-motion`.

## Tokens

All tokens are CSS custom properties in `styles/globals.css`, consumed via
Tailwind + shadcn conventions (`hsl(var(--...))`). Light is the default `:root`;
`.dark` is defined but deferred (not linked in UI yet).

### Color

- **Neutrals**: slate-tinted grays (Stripe-like coolness, never pure #000/#fff).
  `--background` near-white `0 0% 100%`, `--foreground` deep slate `224 25% 12%`,
  `--muted`, `--muted-foreground`, `--border` (~92% lightness hairlines),
  `--card`, `--input`, `--ring`.
- **Primary (brand)**: indigo `243 75% 59%` (#635BFF-adjacent "trust blurple") for
  actions, links, focus rings.
- **Gradient family (marketing accents only)**: emerald → cyan → indigo
  (`--gradient-from: 160 84% 39%`, `--gradient-via: 189 94% 43%`,
  `--gradient-to: 243 75% 59%`). Nods to spreadsheets (green) and the legacy cyan.
- **Semantic**: `--destructive` red 0 72% 51%, `--success` emerald 160 84% 33%,
  `--warning` amber 38 92% 50%.
- Data-viz categorical ramp (charts): indigo, cyan, emerald, amber, rose, slate.

### Typography

Two families via `next/font` (self-hosted, zero CLS):

- **Sans — Inter** (`--font-sans`): everything. Display headlines use the same
  family at `tracking-tight`, weights 600–700, sizes from the marketing scale.
  One family for UI + display keeps bundle small and rhythm consistent.
- **Mono — JetBrains Mono** (`--font-mono`): data cells, SQL, schema chips,
  numbers-in-tables. Never for UI labels or headings.

Marketing scale: 56/64 (hero), 40/48 (h2), 24/32 (h3), 18/28 (lead), 16/24 (body).
App scale: 20/28 (page title), 14/20 (default), 13/18 (dense), 12/16 (caption).

### Space, radius, shadow, motion

- **Space**: Tailwind default 4px scale. Section rhythm on marketing: py-24/32.
  App page gutters: px-6, content max-w-6xl.
- **Radius**: `--radius: 0.625rem` (10px) base → shadcn sm/md/lg derive from it.
  Marketing cards/mockups: rounded-2xl (16px). Pills: rounded-full.
- **Shadows** (light-mode elevation, always paired with a border):
  - `--shadow-xs`: 0 1px 2px rgb(15 23 42 / 0.04)
  - `--shadow-sm`: 0 1px 2px rgb(15 23 42 / 0.06), 0 2px 8px rgb(15 23 42 / 0.04)
  - `--shadow-md`: 0 2px 4px rgb(15 23 42 / 0.06), 0 8px 24px rgb(15 23 42 / 0.08)
  - `--shadow-lg`: 0 4px 8px rgb(15 23 42 / 0.06), 0 20px 48px rgb(15 23 42 / 0.12)
- **Motion**: durations 150 (hover), 250 (UI state), 500 (marketing entrance);
  easing `cubic-bezier(0.22, 1, 0.36, 1)`. Framer Motion only on marketing pages
  (`whileInView` entrances, hero mockup sequence); app surfaces use CSS
  transitions.

## Component layer

shadcn/ui primitives (vendored, restyled with the tokens above), replacing the
hand-rolled `components/ui/*`:

| Need | Primitive | Replaces |
| --- | --- | --- |
| Buttons (default/secondary/ghost/destructive/link, sm/default/lg) | `button` | `.btn-accent`, ad-hoc buttons |
| Cards | `card` | `.card` utility |
| Dialogs/confirmations | `dialog`, `alert-dialog` | ConfirmDialog |
| Side drawers (history, recipes) | `sheet` | HistoryDrawer/RecipesDrawer shells |
| Menus (file actions, profile) | `dropdown-menu` | inline icon rows |
| Command palette | `command` (cmdk) | CommandPalette |
| Toasts | `sonner` | ToastProvider |
| Forms | `input`, `textarea`, `label`, `select`, `switch` | Input/Textarea |
| Data chrome | `table`, `tabs`, `badge`, `skeleton`, `tooltip`, `progress`, `separator`, `avatar` | various |

## Surface guidelines

- **Landing**: hero = one declarative sentence about recurring cleanup + live
  product mockup (messy rows → instruction → clean table → "recipe saved") that
  animates once; trust band (privacy/audit/reproducibility); how-it-works in 3
  steps; recipe re-run demo section; privacy section (schema-only diagram);
  social-proof/stat placeholders; final CTA. White background, one gradient
  moment in the hero, generous whitespace.
- **Onboarding/workspace empty state**: inline (no modal tour). Upload zone +
  sample datasets + suggested first instructions in one calm screen.
- **Workspace**: light app chrome; grid gets row hover, tabular-nums, sticky
  header; Sage panel becomes a clean copilot side panel with suggestion chips.
- **Dashboard**: files as a proper table/grid toggle with dropdown actions,
  usage meters in quiet cards.
- **Pricing**: two cards, Pro highlighted (ring + badge), feature comparison,
  FAQ, trust footnote. Annual toggle deferred until a real annual plan exists.
- **Auth/profile**: centered single card, minimal fields, privacy reassurance
  microcopy.

## Accessibility bar

WCAG AA contrast on all text (slate-600 minimum on white for secondary text),
visible focus rings (`--ring`), full keyboard paths through dialogs/menus
(Radix gives this), `aria-label` on icon-only buttons, reduced-motion fallbacks.

## Research notes (verified 2026-07, adversarially fact-checked)

Findings this system deliberately follows:

- **Token architecture**: semantic background/foreground CSS-variable pairs are
  shadcn's documented convention — adopted wholesale. (The OKLCH + `@theme
  inline` format applies to Tailwind v4 only; this repo is on v3.4, where
  `hsl(var(--token))` is the correct form.)
- **Cool-tinted neutrals**: verified against Stripe's production CSS (#fff
  cards, #F6F9FC subsurfaces, all grays blue-tinted). Our 220-hue slate ramp
  matches that finding.
- **Product-as-hero**: Linear's marketing pages anchor every section on real
  product UI, not illustration — hence the DOM-built HeroDemo and mockup cards.
- **Motion**: `whileInView` uses a pooled IntersectionObserver; keep scroll
  animation to transform/opacity. "Compositor-safe motion can't hurt Core Web
  Vitals" was REFUTED — measure before adding more.
- **Onboarding**: sample data + inline contextual guidance beat front-loaded
  modal tours for multi-path products; checklists work best with 3-5
  activation-milestone items and pre-filled progress (endowed progress
  effect, Nunes & Dreze 2006). Hence GettingStarted replaces the modal tour.

Claims checked and REFUTED — do not reintroduce:
- Stripe's text color being #0A2540; Linear's exact letter-spacing scale;
  "Linear uses a single accent color"; "interactive onboarding lifts
  activation ~50%".

Visual reference library for surfaces without verified patterns (pricing,
settings, tables): saasui.design /pattern/{onboarding,settings,empty-state,
table,dashboard,pricing,billing}.
