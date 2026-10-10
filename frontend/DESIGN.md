# SheetsLLM Design System

Personality: **calm, precise, trustworthy**. The product handles people's finance
and ops data, for a broad audience that is not necessarily technical. It should
feel like the category standard. The public site follows linear.app's system
closely (studied component by component; captures and measurements live in
`review/linear/`, untracked): near-black pages, Inter at in-between weights,
pill calls to action, product pictures that fade into the dark, and quiet
pointer-driven illustrations. We take the system, never Linear's assets, copy
or code.

`styles/globals.css` is the source of truth for every value below. If this file
and that one disagree, that file is right and this one is stale. Fix it.

## The organizing idea: one world, two densities

Signed out (landing, `/product/*`, pricing, `/tools`, auth) and signed in
(workspace, files, recipes, account) share every token. The public site is
always dark (`forcedTheme` in `theme-provider.tsx`); the app defaults to dark
and keeps the reader's toggle.

- **Signed out** has air: a 64px hero, 48px two-line section heads with the copy
  on the right, py-20 to py-28 sections split by full-width hairlines, and live
  product fragments drawn in DOM instead of screenshots.
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

**Neutrals.** Dark, the default, is the reference's near-black: `#08090a` page,
`#0f1011` panels (`--card`), `#141516` popovers, `#1c1c1f` fills (`--muted`) and
`#23252a` hairlines. Text steps down in four: `--foreground` `#f7f8f8`, `--soft`
`#d0d6e0` for lead copy, `--muted-foreground` `#8a8f98`, and `--faint` `#62666d`,
which is decorative only (figure labels, separators; it is under 4.5:1). Light is
pure white with a barely-grey `--canvas` and near-black ink, for the app only.

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

**Inter** (variable, via `next/font/google`) for everything a person reads, at
the in-between weights the reference uses: Tailwind's `font-medium` is 510 and
`font-semibold` 590. **Geist Mono** only for what is literally code: SQL, column
types, inline code in Chef's answers, and the figure numbers (FIG 0.1).

Mono is not a costume. Labels, file names, counts and grid values are sans with
`tabular-nums`. There are no uppercase micro-labels.

| role | size / tracking |
| --- | --- |
| Hero | 42px, 64px from `sm`, 510, `-0.022em`, second line in muted ink |
| Statement | 28px, 48px from `sm`, 510, first sentence white, the rest muted |
| Section head | 34px, 48px from `sm`, 510, `-0.022em`, two lines |
| Prefooter | 40px, 72px from `sm`, 510, centered |
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

In the app the primary button is a raised violet fill. On the public site the
one primary call to action is the `inverse` light pill, beside a `glass` pill
(white at 5% with an inset hairline and a black outer ring); nav items are 13px
muted pills that brighten on a faint fill. Hovers run 100 to 160ms on
`cubic-bezier(.25,.46,.45,.94)`. Overlays are `bg-black/40` with a 2px blur.

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
- **Pictures and fades.** The hero's product frame stands whole in a lit panel
  (a grey wash rising to its foot) and never fades. Every picture below it sits
  on a spotlight stage whose edges fade into the page (`Stage` in
  `marketing/blocks.tsx`). There is no animated backdrop: the page is black.
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

- **Header.** 64px on the public site, translucent near-black with blur, the
  20px mark and name on the left. Signed out, the right side holds Product (a
  wide panel of the four product pages, two-line descriptions, a column of plain
  links and a footer strip; it opens on hover or click and closes on Escape),
  Pricing, Free tools, a divider, Sign in and the Get started light pill. Signed
  in, the location sits beside the mark (Files, Recipes, then the open file) and
  the account is an initial avatar.
- **Landing.** A two-line 64px headline over a row of subline and calls to
  action; then the whole product in one frame (sidebar, the open file looping
  its fixes, Chef), shown whole in a lit panel. Then a 48px statement, the
  figure row (FIG 0.1 to 0.3: isometric line drawings that open, replay and
  follow the cursor), one section per product page (two-line head, copy and
  Learn more, a composite picture on a spotlight stage, and a Features row whose
  items open a short detail), the 72px prefooter and the footer.
- **Product pages** (`/product/clean`, `chef`, `recipes`, `privacy`, data in
  `marketing/product-pages.ts`). A label and 64px headline at the bottom-left of
  a dark hero over a dimmed, blurred piece of the product; then blocks of head,
  picture and two captioned cells split by a hairline; then the four pages as
  cross-links, the prefooter and the footer.
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
- **Pricing.** A 56px centered head, two cards; Pro carries `border-primary`, a ring and `shadow-md`, and its call to action is the light pill. The shared footer closes it, as it closes the tools pages.
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
- **Animated page backdrops** (the dot ripple, beams, a drifting light). Tried and removed: the page is black, and motion belongs to the product pictures.
- **A fade on the hero frame.** The first picture is shown whole.
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
