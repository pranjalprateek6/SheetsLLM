# SheetsLLM Design System

Personality: **calm, precise, trustworthy**. The product handles people's finance
and ops data. It should feel like an instrument someone reaches for every Monday
morning, not a demo.

`styles/globals.css` is the source of truth for every value below. If this file
and that one disagree, that file is right and this one is stale. Fix it.

## The organizing idea: two registers, one system

The split runs along authentication, not along which page was rebuilt last.

**Signed out (editorial).** Landing, pricing, the free `/tools` pages. More air,
a larger type scale, one gradient moment, scroll entrances. Its job is to explain
the wedge: reusable recipes, schema-only privacy, a real audit trail.

**Signed in (instrument).** Workspace, files, account. Dense, quiet, fast.
Separation comes from hairlines rather than shadowed cards. Numbers are mono and
tabular. Column headings and section labels are mono uppercase micro-labels at
10px. Violet appears on the primary action and on things that just changed, and
nowhere else.

Both registers use the same tokens. The difference is density and air, never a
second palette.

## Tokens

CSS custom properties in `styles/globals.css`, consumed through Tailwind and
shadcn conventions as `hsl(var(--token))`. Light is `:root`, dark is `.dark`,
and next-themes toggles the class. Both ship.

### Color

**Neutrals.** Light is warm paper (`--background: 40 20% 98%`) with a slightly
warmer raised surface (`--card: 40 25% 99%`) and near-black ink
(`--foreground: 240 6% 10%`). Dark is neutral charcoal with no navy cast
(`--background: 240 8% 4%`, `--card: 240 7% 7%`). The grays are close to
desaturated on purpose, so the violet reads as the only color in the chrome.

**Primary.** Violet `254 75% 63%` in light, `253 85% 65%` in dark, matching the
logo mark. It is a reserved signal, not a theme. `--primary-accent` is the
variant for violet *text and icons on neutral surfaces*; `--primary` is the solid
fill that white text sits on. The two pull in opposite directions and must stay
separate values, which is why dark sets the accent lighter (`253 85% 68%`).

**Control boundaries.** `--input` is `240 8% 60%` light and `240 8% 40%` dark.
Both were solved for 3:1 against their own surface, which is what WCAG 1.4.11
asks of a control's outer bound. `--border` is quieter (`240 9% 94%` light,
`240 8% 20%` dark) because it separates content rather than bounding a control.

**Semantic fills and semantic text are different steps.** `--success`,
`--warning` and `--destructive` are mixed for white text sitting on top of them,
so they are too light to *be* text, and lowering their opacity only makes it
worse. Every semantic string uses `--success-text`, `--warning-text` or
`--destructive-text`. Non-text indicators that sit on `--muted`, such as a meter
fill, also need the text step: the warning fill managed 1.9:1 on the track.

**Gradient family (marketing only).** Emerald to cyan to violet, via
`.text-gradient` and `.bg-gradient-brand`. Both carry a forced-colors fallback,
because Windows High Contrast strips background images and clipped text would
otherwise vanish.

### Charts

Eight fixed categorical slots, `--chart-1` through `--chart-8`, plus
`.chart-other` for the overflow. The rules:

- **Fixed order is the safety mechanism.** Assign slots in order and never cycle.
  A ninth series folds into "Other", it never gets an invented hue.
- **Dark is selected, not flipped.** The dark steps are the same hues re-stepped
  into the dark lightness band and re-validated against the dark surface. A
  straight reuse of the light values failed the band on four of the eight.
- **Color never carries identity alone.** Two or more series always get a legend,
  and four or fewer are also direct-labeled.
- Set `color` once via `.chart-sN` and let `fill`/`stroke` inherit it.

The palette was produced with the `dataviz` skill's validator against both
surfaces: lightness band, chroma floor, adjacent-pair CVD separation,
normal-vision floor, and contrast. Re-run it before changing any value. The
palette it replaced failed at ΔE 3.6 under protanopia against a floor of 6.

### Typography

Two families through `next/font` (self-hosted, no CLS):

- **Sans: Archivo** (`--font-sans`). Chosen over Inter for its higher x-height,
  which is what holds up at the 11 to 13px label sizes this UI is mostly made of.
  Display headings are the same family at `tracking-tight`.
- **Mono: JetBrains Mono** (`--font-mono`). Data cells, column names, file names,
  numbers in tables, SQL, and the 10px uppercase micro-labels. In the app
  register mono is a semantic choice: it marks a string as *data* rather than
  prose.

Editorial scale: 56/64 hero, 40/48 h2, 24/32 h3, 18/28 lead, 16/24 body.
Instrument scale: 20/28 page title, 14/20 default, 13/18 dense, 12/16 caption,
11px and 10px for mono labels and gutters.

### Space, radius, elevation

Space is the Tailwind 4px scale. Editorial section rhythm is py-24/32; app
gutters are px-3 in chrome bars and px-4/6 in page containers.

**Radius is `--radius: 0.375rem` (6px), and only three Tailwind steps derive
from it:**

| class | value | use |
| --- | --- | --- |
| `rounded-sm` | 2px | `--radius` minus 4 |
| `rounded-md` | 4px | `--radius` minus 2. App panels, cards, chat bubbles |
| `rounded-lg` | 6px | `--radius` itself. Editorial panels, inputs, buttons |
| `rounded-full` | pill | badges, meters, avatars |

`rounded-xl` and larger are **off-system**. They are Tailwind's untouched
defaults (12px, 16px, 24px) and do not track `--radius`, so reaching for one
silently opts that element out of the scale. The only remaining exceptions are
the marketing product shots, which simulate a browser window.

**Elevation is for things that genuinely float** (menus, dialogs, product shots).
A flat surface is separated by a hairline, not a glow: `border` alone, no
`shadow-xs` under it. Light uses a flat black spread. Dark cannot separate
near-black surfaces with a black spread, so each dark level also carries a light
top rim (`inset 0 1px 0 hsl(0 0% 100% / …)`).

### Motion

Duration, easing, distance, scale and blur tokens come from the transitions.dev
scale and live at the bottom of `globals.css`. Every `t-*` pattern reads from
them rather than hardcoding a curve.

- Hover 150ms, UI state 250ms, entrances 400 to 500ms.
- Default easing `--ease-smooth-out: cubic-bezier(0.22, 1, 0.36, 1)`.
- Dropdowns and modals animate through `data-state` keyframes rather than
  transitions, because Radix only keeps a closing surface mounted while a CSS
  *animation* runs.
- Nothing loops except an explicit loading state (WCAG 2.2.2).
- Every pattern has a `prefers-reduced-motion` branch. Framer Motion's
  `reducedMotion="user"` is not enough on its own: it only suppresses
  positional keys, so a shimmer driven by `background-position` keeps moving and
  needs its own `useReducedMotion()` fallback.

One motion is load-bearing: `.cell-changed` washes a changed cell in violet for
1.4s and settles. It exists so a transform is visible without diffing two
screenshots. Under reduced motion it becomes a static tint rather than nothing,
because the information still has to arrive.

## Component layer

shadcn/ui primitives, vendored into `components/ui/*` and restyled with the
tokens above: `button`, `card`, `dialog`, `alert-dialog`, `sheet`,
`dropdown-menu`, `command` (cmdk), `sonner`, `input`, `textarea`, `label`,
`select`, `switch`, `table`, `tabs`, `badge`, `skeleton`, `tooltip`, `progress`,
`separator`, `avatar`.

Two of them carry decisions worth knowing:

- **`table`** is the instrument register in primitive form: 9px-tall mono
  uppercase heads, `px-3 py-2` cells, `border-border/60` row rules. Only the
  files list uses it. The workspace grid is a hand-rolled virtualised table that
  matches it by hand.
- **`button`** animates `transform`, not `scale`. Tailwind v3 compiles
  `scale-[0.96]` to `transform: … scaleX(var(--tw-scale-x))`, so a transition
  naming the `scale` property animates nothing.

Shared app pieces that are not shadcn: `ColumnHealth` (the per-column
completeness strip above the grid), `PipelineSpine` (the step rail),
`CsvDropzone` and `ProgressBar` (shared by the four `/tools` pages).

## Surface guidelines

- **Landing.** Hero is one declarative sentence about recurring cleanup plus a
  live product mockup built from real DOM, never a screenshot. Then the trust
  band, how-it-works, the recipe re-run demo, the schema-only privacy diagram,
  and the final CTA. One gradient moment, in the hero.
- **Workspace, no file.** Opens with the same `WORKSPACE / No file open` status
  bar the loaded state uses, so both phases of the page share a left edge with
  the full-width header. Upload zone, samples, and starter instructions on one
  calm screen. No modal tour.
- **Workspace, loaded.** Full bleed. Step rail on the left, command bar across
  the top, column health strip under it, grid, chat on the right. The grid keeps
  a sticky header, a mono gutter, visible row hover, and right-aligned numerics.
- **Files.** A real data table: mono names, right-aligned tabular size, rows and
  columns, the format as a type mark rather than a pill, and one violet action.
- **Pricing.** Two cards. Pro is emphasised with `border-primary` plus a ring,
  not elevation, because it is not floating.
- **Auth and account.** A single card and mono section labels respectively;
  minimal fields, privacy reassurance in the microcopy.

## Accessibility bar

- 4.5:1 for body text, 3:1 for large text and for non-text UI boundaries (1.4.11).
  Micro-labels count as text: a 10px mono format mark at 3.3:1 is a defect, not a
  decoration.
- 24x24 CSS px minimum for pointer targets (2.5.8).
- Visible focus on every interactive element, via `--ring`.
- Icon-only buttons carry `aria-label`; the skip link is the first focusable
  element on the page.
- Status messages get `role="status"`, errors get `role="alert"`, long jobs get
  `role="progressbar"`. A progress bar is deliberately *not* a live region:
  assistive tech polls it, whereas a status role would read out every slice.
- Reduced-motion fallbacks preserve information, they do not just remove motion.

## Rejected, do not reintroduce

- **Glassmorphism and ambient gradient washes.** Tried and removed. They sit
  between the reader and the numbers.
- **Indigo `243 75% 59%` and cool-tinted gray `220 27% 97%`.** The v2 palette.
  Replaced by the logo violet on warm paper.
- **Inter.** Replaced by Archivo for x-height at label sizes.
- **A shadow under a flat bordered panel.** Pick one.
- **`rounded-xl` and larger on app or marketing panels.** Off the radius scale.
- **Color as the only carrier of series identity, and any dual-axis chart.**

## Research notes

Verified and followed:

- Semantic background/foreground CSS-variable pairs are shadcn's documented
  convention. The OKLCH plus `@theme inline` format is Tailwind v4 only; this
  repo is on v3.4, where `hsl(var(--token))` is correct.
- Product-as-hero: Linear's marketing anchors every section on real product UI,
  which is why HeroDemo and ProductShot are built from DOM.
- Onboarding: sample data plus inline contextual guidance beats a front-loaded
  modal tour for multi-path products. Checklists work best at 3 to 5 activation
  milestones with pre-filled progress (endowed progress effect, Nunes and Dreze
  2006), which is what GettingStarted does.
- CVD simulation for the palette validator uses Machado, Oliveira and Fernandes
  (2009); ΔE is measured in OKLab times 100.

Checked and refuted, do not reintroduce as fact:

- Stripe's text color being #0A2540; Linear's exact letter-spacing scale;
  "Linear uses a single accent color"; "interactive onboarding lifts activation
  ~50%"; "compositor-safe motion cannot hurt Core Web Vitals".
- "SVG presentation attributes do not resolve `var()`". They do, in every
  browser this app targets.
