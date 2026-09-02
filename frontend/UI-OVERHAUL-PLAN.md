# Full UI/UX Overhaul Plan

Status: draft for review. Written 2026-09-02, after the v4 workspace implementation.

## The headline finding

This is **not a rewrite**. An audit of every route and component found the codebase
is roughly 98% tokenized already: a repo-wide scan for literal Tailwind palette
classes (`bg-white`, `text-gray-500`, `border-zinc-200`) returned three hits, all
of them the stock shadcn modal scrim. Semantic tokens are used consistently, and
`.dark` is fully defined.

Two consequences:

1. The v4 token change already propagated to every page, because tokens are
   global. The whole app is on the near-white / charcoal palette today.
2. What is missing app-wide is the **design language**, not the colors: glass
   chrome, the ambient layer, motion tokens, and the state/accessibility polish.

So the overhaul is propagation plus a small number of genuine defects, not a
teardown. The plan is sized accordingly.

## Guiding principles

Carried from `DESIGN.md`, extended by v4:

1. **Two registers, one token system.** Marketing surfaces get expressive
   gradients and entrance motion. App surfaces stay quiet, dense, fast.
2. **Glass organizes chrome, never data.** Exactly two frosted layers per screen,
   over an ambient glow that gives them something to refract. Grids and cards
   stay opaque.
3. **Color is information.** Violet marks primary actions and moments of change.
   Success and warning encode state. Everything else is neutral.
4. **Motion is meaning.** transitions.dev tokens: 250ms open, 150ms close,
   `--ease-smooth-out`. Nothing loops except explicit loading states.
5. **Change must be visible.** Every transform announces what it did, and the
   announcement is quieter than the data it describes.

## Phase 0: land what exists (blocker)

The v4 workspace work sits on `feat/workspace-overhaul`, unmerged and untested
locally. Everything below builds on those tokens, so this lands first.

- You test the branch: workspace grid, glass chrome, Chef panel, dark mode.
- PR, review, merge.

Nothing else starts until this is in `main`.

## Phase 1: make the design system honest

`DESIGN.md` is currently **stale and actively misleading**. It documents the
pre-v4 tokens (tinted cool-gray canvas `220 27% 97%`, indigo primary
`243 75% 59%`) that no longer exist in the code, and states dark mode is
"deferred (not linked in UI yet)" when there is a working theme toggle in the
header.

- Rewrite the Color section to the v4 palette actually in `globals.css`.
- Document the glass system: `.ws-ambient`, `.ws-glass`, `.ws-glass-panel`, the
  two-layer rule, and why data surfaces stay opaque.
- Document the motion tokens from the transitions.dev install, replacing the
  older ad-hoc duration guidance.
- Correct the dark-mode status.

Cheap, and it stops the next six phases from drifting.

**PR:** `docs(design): update DESIGN.md to the v4 system`

## Phase 2: ChartPanel (the one real rewrite)

`components/ChartPanel.tsx` is the only file that fails in dark mode, and it also
carries the worst accessibility and responsive bugs in the app. One file, three
classes of defect:

- **Dark mode.** `ChartPanel.tsx:10-13` hardcodes 15 hex swatches chosen for a
  white canvas; the darker entries lose separation on charcoal.
  `ChartPanel.tsx:186` strokes every pie slice with `rgba(0,0,0,0.1)`, invisible
  on dark, so adjacent slices merge. Move the ramp into tokens.
- **Accessibility.** `ChartPanel.tsx:220` has three icon-only chart-type buttons
  with no `aria-label`. Lines 227-246 have three `<label>` elements with no
  `htmlFor` against three `<select>` elements with no `id`, so the X / Y / Agg
  controls are entirely unlabeled to assistive tech.
- **Responsive.** `ChartPanel.tsx:261` is a fixed `width={760} height={400}` SVG
  with a correct `viewBox` but no `max-w-full`. One-line fix.

Deliberately **not** changing: `ChartPanel.tsx:91` (`ctx.fillStyle = "#ffffff"`)
in the PNG export. The serialized SVG loads detached, so `currentColor` falls
back to black, and a white canvas is correct. Making this token-aware without
also inlining the resolved text color would produce black-on-black exports.

**PR:** `fix(ui): ChartPanel dark mode, labels, and responsive sizing`

## Phase 3: app shell and dashboard

The dashboard is the second most-used surface after the workspace and the audit's
reference implementation for state coverage. It earns the v4 language.

- Apply the ambient plus glass treatment to the dashboard shell, matching the
  workspace so the two feel like one product.
- `Header.tsx:127`: the desktop nav is `absolute left-1/2 -translate-x-1/2`,
  removed from flow, so between roughly 768px and 900px it can overlap the logo
  or the user menu. Reserve space instead.
- `UsageCard.tsx:162`: add `flex-wrap`; long nudge copy against a
  `whitespace-nowrap` button squeezes badly on narrow viewports.
- Account page: align card treatment with the dashboard.

**PR:** `style(ui): v4 language across dashboard, header, and account`

## Phase 4: accessibility and state coverage sweep

Small, high-value, mechanical. Each item is one to three lines.

Labels (7 controls):
- `dashboard/page.tsx:280` inline rename input, `:320` search input
- `RecipesDrawer.tsx:256` recipe-name input
- `JsonToCsvTool.tsx:84` textarea
- `ChatPanel.tsx:446` Chef composer
- plus the ChartPanel controls, if Phase 2 has not already landed

`RecipesDrawer.tsx:350` already does this correctly. Copy that pattern.

Missing states:
- `SchemaPanel.tsx:43-68` has **no empty state**; with zero columns it renders
  "0 columns" over a blank list.
- `pricing/page.tsx:243` pops the plan badge in once `/api/billing/status`
  resolves, briefly showing the signed-out CTA. `account/page.tsx:136-140`
  already skeletons this correctly. Copy it.
- `FeedbackWidget.tsx:49,56` surfaces errors only via toast, easy to miss while
  the modal is open. Add an inline error.
- `ErrorBoundary.tsx:47-53` is the one component bypassing the design system,
  using a raw `<button>` with hand-rolled classes. Swap in `Button`.

**PR:** `fix(a11y): label controls, add missing empty and error states`

## Phase 5: marketing surfaces

Landing, pricing, and the four tools pages are the expressive register. They are
also where new users form their first impression, so they get the ambient
treatment the workspace now has, tuned brighter.

- Landing hero: ambient glow behind the fold, glass on the floating product
  mockup, keeping `HeroDemo` as real DOM rather than a screenshot.
- Pricing: card hierarchy pass, plus the Phase 4 skeleton fix.
- Tools pages share `ToolShell`, so one component upgrade covers all four.
- Normalize the two typographic affordances doing an icon's job:
  `pricing/page.tsx:455` and `ToolShell.tsx:75` use a literal `+` rotated 45
  degrees as a disclosure toggle, inheriting font metrics instead of using
  `ChevronDown`.

**PR:** `style(ui): v4 marketing register for landing, pricing, and tools`

## Phase 6: motion unification

Last, because it is polish on top of settled layouts.

- Run the `transitions-polish` skill audit (`transitions review`) across the app
  to find ad-hoc durations and easings that should reference motion tokens.
- Nine files import framer-motion, all via the legacy `"framer-motion"`
  specifier rather than `"motion/react"`. Decide whether to migrate; it is
  cosmetic today but relevant if the dependency is ever updated.
- Extend the icon-swap and dropdown/modal transitions already installed to any
  surface added in Phases 3 through 5.

**PR:** `style(ui): unify motion against the transitions.dev token scale`

## Explicitly not in scope

- **Rewriting components that are already correct.** The audit found dashboard,
  HistoryDrawer, RecipesDrawer, UsageCard, and `auth/reset` all have complete
  loading, empty, and error states. Leave them alone.
- **The Google brand icon** (`auth/page.tsx:20-23`). Those hex fills are mandated
  by Google and must stay hardcoded.
- **The OG image** (`app/opengraph-image.tsx`). Build-time, always light by
  design.
- **The modal scrim** (`bg-black/80` in dialog, alert-dialog, sheet). Stock
  shadcn, acceptable in both themes. Revisit only if the dark scrim reads heavy.
- **Emoji cleanup.** A Unicode scan found zero emoji used as UI icons. Iconography
  is already 100% lucide plus the three custom animated SVGs.

## UX track, separate from the visual work

These are product changes, not restyling, and most need backend support. Listed
so they are not lost, not scheduled here:

- Try-before-signup anonymous sandbox. Flagged repeatedly as the highest-value
  post-launch item.
- Staged accept/reject transforms, so a step can be previewed before it applies.
- Cell-level diffs, which would let the grid flash individual changed cells
  rather than tinting whole columns.
- `step_count` in the files list API, to show pipeline depth on dashboard cards.

## Open questions

1. Should the marketing register get the ambient glow at all, or stay flat white
   so the app feels like the richer surface by contrast?
2. Dark mode on marketing pages: currently supported by tokens, but never
   art-directed. Worth a pass, or lock marketing to light?
3. Phase ordering: Phase 2 (ChartPanel) is the only genuine bug cluster. Happy to
   pull it ahead of Phase 1 if you would rather fix before documenting.
