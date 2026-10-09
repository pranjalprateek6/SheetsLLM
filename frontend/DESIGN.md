# SheetsLLM Design System

Personality: **calm, precise, trustworthy**. The product handles people's finance
and ops data, for a broad audience that is not necessarily technical. It should
feel like the category standard, held to the craft of Linear, Vercel, Notion and
Stripe: the file and what just changed in it are the only loud things on screen.

`styles/globals.css` is the source of truth for every value below. If this file
and that one disagree, that file is right and this one is stale. Fix it.

## The organizing idea: one world, two densities

Signed out (landing, pricing, `/tools`) and signed in (workspace, files,
recipes, account) share every token. The difference is density and air, never a
second palette or a second type family.

- **Signed out** has more air: a 60px hero, 40px section heads, py-20 to py-28
  rhythm, and live product fragments drawn in DOM instead of screenshots.
- **Signed in** is dense and quiet: 13 to 14px text, hairline separation, panels
  that sit on the page rather than float above it.

Violet is the only colour in the chrome. It marks the primary action, focus, and
what just changed, and nowhere else.

## Tokens

CSS custom properties in `styles/globals.css`, consumed through Tailwind and
shadcn conventions as `hsl(var(--token))`. Light is `:root`, dark is `.dark`,
and next-themes toggles the class. Both ship, and dark is selected rather than
flipped.

### Colour

**Neutrals: cool zinc.** Light is pure white (`--background: 0 0% 100%`) with a
barely-grey `--canvas` (`240 5% 98.5%`) for recessed bands, rails, footers and
empty states, and near-black ink (`240 10% 4%`). Dark is near-black with no blue
cast (`--background: 240 5% 5%`, `--canvas: 240 5% 4%`), and surfaces step up in
lightness: `--card 8%`, `--popover 10%`, `--muted 12%`.

**Primary: the violet of the mark.** `--primary` (`251 70% 57%` light,
`251 72% 60%` dark) is the fill white text sits on. `--primary-accent`
(`251 62% 52%` light, `251 90% 76%` dark) is violet *text and icons on neutral
surfaces*. They pull in opposite directions and must stay separate values.

**Boundaries.** `--input` (`240 5% 58%` light, `240 4% 40%` dark) bounds a
control at 3:1, the WCAG 1.4.11 floor. `--border` (`240 6% 90%` light,
`240 4% 16%` dark) is quieter because it separates content rather than bounding
a control.

**Semantic fills and semantic text are different steps.** `--success`,
`--warning` and `--destructive` are mixed for white text on top of them, so they
are too light to *be* text. Every semantic string uses `--success-text`,
`--warning-text` or `--destructive-text`, each 4.5:1 or better on white and on
`--muted`.

**No gradients.** `--gradient-*` and `.bg-gradient-brand` survive only as legacy
utilities set to flat violet. Nothing in the product uses them; do not start.

### Charts

Eight fixed categorical slots, `--chart-1` through `--chart-8`, plus
`.chart-other` for the overflow.

- **Fixed order is the safety mechanism.** Assign slots in order and never
  cycle. A ninth series folds into "Other"; it never gets an invented hue.
- **Dark is selected, not flipped.** Same hues, re-stepped into the dark
  lightness band and re-validated against the dark surface.
- **Colour never carries identity alone.** Two or more series get a legend, and
  four or fewer are also direct-labeled.
- Set `color` once via `.chart-sN` and let `fill`/`stroke` inherit it.

The palette was produced with the `dataviz` skill's validator against both
surfaces. Re-run it before changing any value.

### Typography

**Geist Sans** for everything a person reads, **Geist Mono** only for what is
literally code: SQL, column types (`VARCHAR`, `DOUBLE`), and inline code in
Chef's answers. Both come from the `geist` package (pinned 1.7.2) through
`next/font`, so they are self-hosted with no layout shift.

Mono is not a costume. Labels, file names, counts and grid values are sans with
`tabular-nums`, which Geist Sans supports. There are no uppercase micro-labels
and no eyebrows above headings.

| role | size / tracking |
| --- | --- |
| Hero | 44px, 60px from `sm`, weight 600, `-0.035em`, second line in muted ink |
| Section head | 30px, 40px from `sm`, `-0.025em` |
| Page title (app) | 24px, `-0.02em` |
| Lead | 17 to 18px, `leading-relaxed`, muted |
| Body | 14 to 15px |
| Dense UI | 13px (menus, grid cells, chat) |
| Caption | 11 to 12px |

Headings use `text-wrap: balance`, paragraphs `text-wrap: pretty`.

### Radius

`--radius: 0.5rem` (8px).

| class | value | use |
| --- | --- | --- |
| `rounded-md` | 6px | menu items, small chips, inline code |
| `rounded-lg` | 8px | controls: buttons, inputs, selects, tabs, menus |
| `rounded-xl` | 12px | panels: cards, tables, dialogs, product frames |
| `rounded-full` | pill | avatars, switches, meters |

### Elevation

Two-layer shadows: a tight contact shadow plus a soft ambient one, always offset
downward. Panels pair a hairline with `shadow-xs` or `shadow-sm`; menus,
dialogs and the landing's product frames use `shadow-md` or `shadow-lg`. Dark
cannot separate near-black surfaces with a black spread, so every dark level
also carries a faint light top rim.

The primary button is a raised fill: an inset top highlight plus a short
contact shadow. Overlays are `bg-black/40` with a 2px backdrop blur.

### The parts nobody draws

Caret is violet. Selection is 18% violet. `:focus-visible` is a 2px `--ring`
outline at 2px offset. Scrollbars are thin, transparent-tracked, and tinted
from the foreground. Links underline at a 3px offset.

### Motion

Duration, easing and distance tokens live at the bottom of `globals.css`.

- Hover 150ms, UI state 250ms, entrances 400 to 500ms.
- Default easing `--ease-smooth-out: cubic-bezier(0.22, 1, 0.36, 1)`. No bounce
  or elastic curves.
- No section entrance animations on the landing. What moves is the product:
  the hero and every section fragment loop their real flow like a muted video,
  with a ghost cursor that moves, presses and opens menus (`marketing/ghost.tsx`).
  Each loop plays only while on screen; reduced motion shows the last frame.
- **The dot ripple.** The hero and each section visual stand on a field of dots
  at the intersections of a 32px grid (`marketing/GridBackdrop.tsx`, one canvas
  each, masked to fade out). Slow rings spread from random points and brighten
  the dots they pass in violet, like a change moving through a sheet. Base dots
  are `--muted-foreground` at 38%; colours follow the theme; it pauses offscreen
  and is still under reduced motion. Chosen over beams, a drifting spotlight and
  filling cells.
- Dropdowns and modals animate through `data-state` keyframes, because Radix
  only keeps a closing surface mounted while a CSS *animation* runs.
- Nothing loops except an explicit loading state (WCAG 2.2.2).

One motion is load-bearing: `.cell-changed` washes a changed cell in violet and
settles. Under reduced motion it becomes a static tint, because the information
still has to arrive.

## Scanning rules

Nobody reads a screen; people arrive with one question and hunt for the answer.
Every layout decision serves that hunt.

- **Edges.** Text holds a hard left edge and numbers a hard right edge, like a
  receipt. Every element sits on at least two edges; when one is missing, make
  it with a single line rather than a new container.
- **Measure.** Prose never runs the full width of the screen. Settings and
  reading surfaces cap at a readable column.
- **Differentiate, don't pad.** Density is fine when content is grouped and
  varied (sections, avatars, chips, type marks). More whitespace is not the fix
  for an undifferentiated list.
- **Show, don't tell.** Prefer an instantly recognisable icon, chip or position
  over another label or tooltip.
- **Emphasis is relative.** Default states are quiet and grey; only a value that
  differs from its default earns colour. Strict privacy (the default) is a grey
  chip; sending sample rows (the exception) is amber.
- **Lines before cards.** No borders on borders or stacked radii. Settings are
  rows separated by one hairline each, with the label on the left edge and the
  control on the right (see Account).

## Component layer

shadcn/ui primitives, vendored into `components/ui/*` and restyled with the
tokens above. Controls are `h-9` (`h-8` small, `h-11` large) at `rounded-lg`.
Inputs focus with a violet border plus a 3px `primary/20` ring. Tooltips are
inverted (foreground on background). Badges are `rounded-md`, 11px, and tinted
rather than filled.

- **`table`** heads are 12px sans in muted ink. Only the files list uses it; the
  workspace grid is a hand-rolled virtualised table that matches it by hand.
- **`button`** animates `transform`, not `scale`, because Tailwind v3 compiles
  `scale-[…]` into `transform`.
- **`ChatText`** renders Chef's light markdown (paragraphs, lists, bold, inline
  code) as React elements, never as HTML.

## Surface guidelines

- **Header.** Translucent background with blur and saturation, a 22px mark.
  Signed out, the menu is centered on the page axis. Signed in, the location
  sits beside the mark (Files, Recipes, then the open file) and the account is an
  initial avatar.
- **Landing.** Split hero: the headline in two weights on the left and the live
  workspace frame on the right. Then a three-fact proof strip, four alternating
  sections each anchored on a DOM fragment of the real UI, the free tools as one
  hairline grid, a closing call to action, and a four-column footer.
- **Files.** A real data table in a 12px panel: names in sans medium, the format
  as a small bordered type mark, right-aligned tabular numbers, one violet
  action.
- **Workspace.** Full bleed. Step rail on `--canvas`, toolbar, column health
  strip, grid, Chef on the right. In chat, you speak in a quiet muted bubble;
  Chef answers in plain text beside its mark; only a change to the file or an
  error earns a container.
- **Tools.** Left-aligned title and lead, the tool in a 12px panel, how-it-works
  as three ruled steps, the recipe call to action on `--canvas`. The index is a
  list, not a wall of icon tiles.
- **Pricing.** Two cards; Pro carries `border-primary`, a ring and `shadow-md`.
- **Account.** Hairline-separated rows, label and description on the left edge, controls on the right; no cards.

## Accessibility bar

- 4.5:1 for body text, 3:1 for large text and non-text UI boundaries (1.4.11).
- 24x24 CSS px minimum for pointer targets (2.5.8).
- Visible focus on every interactive element.
- Icon-only buttons carry `aria-label`; the skip link is the first focusable
  element.
- Decorative product fragments on the landing are `aria-hidden`; the hero frame
  is a `<figure>` with a screen-reader caption.
- Reduced-motion fallbacks preserve information; they do not just remove it.

## Rejected, do not reintroduce

- **Gradient text, glass panels, glows, and ambient gradient washes.**
- **Eyebrows or kickers above headings, and mono uppercase micro-labels.**
- **Same-size icon cards as page structure.**
- **An identical entrance animation on every section.**
- **The previous world:** warm paper neutrals, Archivo and JetBrains Mono, 6px
  radius, the emerald-cyan-violet gradient.
- **Colour as the only carrier of series identity, and any dual-axis chart.**

## Research notes

- Semantic background/foreground CSS-variable pairs are shadcn's documented
  convention. This repo is on Tailwind v3.4, where `hsl(var(--token))` is right;
  OKLCH plus `@theme inline` is v4 only.
- Product-as-hero, with fragments built from DOM, follows the reference set.
- CVD simulation for the palette validator uses Machado, Oliveira and Fernandes
  (2009); ΔE is measured in OKLab times 100.
