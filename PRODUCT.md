# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who are handed messy spreadsheets and have to make them usable:

- Ops and finance people who get the same export every month (orders, payroll, CRM dumps) and clean it the same way each time. This is the recurring case the product is built around.
- Analysts and small-business owners doing one-off cleanups: a CSV from a vendor, a list to dedupe before a mailing, a report to tidy before sharing.

They are not engineers. They know their data and their spreadsheet tools, and they want the file fixed and back in Excel, not a new tool to learn.

## Product Purpose

SheetsLLM turns a messy spreadsheet into a clean one by plain-English instruction, and remembers the cleanup. Every change is a step you can see, undo, redo or go back to, with the exact SQL behind it. A finished cleanup saves as a recipe, and next month's file runs through the same steps in one click with no AI call. Success: the second month takes seconds instead of the half hour the first one took.

## Positioning

- **Recipes:** the cleanup is captured once as deterministic steps and replayed on the next file. A chat-with-your-spreadsheet tool answers again every time; this one remembers.
- **Privacy by default:** strict mode is on from the start, so the AI is sent column names and types, never a value from the file. Turning sample rows on is the user's choice, and every step records exactly what it sent.
- **Fixes that need no AI:** trims, dedupes, renames, fills, sorts and type changes are one click and cost no AI request. Chef (the AI) is for the requests only language can express.
- **A real audit trail:** every step keeps its instruction, its SQL, and rows and columns before and after.

## Operating Context

- Files arrive as CSV, XLSX, JSON, TSV or Parquet, up to about 1M rows; the original is never modified.
- The workspace is a grid of the file with a steps rail on the left and Chef (chat) on the right. Steps come from Chef, the column menu, the health strip over the grid, insight chips, or a recipe.
- Exports go back out as CSV, Excel, JSON, TSV or Parquet, named for the steps applied.
- Typical rhythm: upload, a handful of fixes, export, save a recipe; then monthly, drop the new export on the recipe.
- Free tools pages (CSV cleaner, dedupe, splitter, JSON to CSV) run entirely in the browser and act as the front door.

## Capabilities and Constraints

- Plans: Free (50 uploads and 200 AI requests a month, 1 saved recipe) and Pro (1,000 uploads, 5,000 AI requests, unlimited recipes). Billing is Razorpay and is not configured yet, so upgrade paths lead to a Pro waitlist.
- AI is Gemini on a small free-tier quota; product decisions favor fewer AI calls.
- Light and dark themes both ship.
- Vocabulary is fixed: file, step, recipe, undo, go back, export, AI request, Chef. Never transformation, chain, revert, or download (as a verb for exporting).

## Brand Commitments

- Name: SheetsLLM. The AI assistant is called Chef.
- Logo mark: `frontend/public/logo.svg` (the violet mark). The mark is kept; the surrounding visual world is open to redesign.
- Voice: plain, specific, calm. An error says what happened, then what to do. Confirmations name the outcome ("Back at step 2").
- Copy rules: no em dashes in product copy; sentence case.
- Visual direction (chosen 2026-10-09, after two direction rounds): the category standard, executed at full craft. SheetsLLM should sit alongside Linear, Vercel, Notion and Stripe; their craft level is the quality bar. Conventions are embraced on purpose, not reinvented.
- Must not read as generic AI SaaS (purple gradients, glass cards, glowing blobs) or as playful (cute illustration, bouncy motion, emoji). It handles people's business data and has to look like it deserves to.

## Evidence on Hand

- Sample files in `frontend/public/samples/` (sales, employees, survey) and the e2e fixtures generator (`frontend/e2e/fixtures/generate.mjs`: orders with 12 duplicates and 215 empty Region cells).
- No customers, testimonials, logos, usage numbers or press exist. None may be invented.
- A founder note component exists (`frontend/components/FounderNote.tsx`).

## Product Principles

1. The file is the hero. The interface exists to show the data and what changed in it.
2. Remember the work. Anything done once should be repeatable without thinking or paying for AI again.
3. Show, then explain. Every step, every AI call and every export says plainly what it did.
4. Trust before delight. Calm, precise and honest beats clever.

## Accessibility & Inclusion

WCAG 2.2 AA: text contrast, 3:1 control boundaries, 24px minimum targets, visible focus, reduced-motion branches for every animation, and charts that never carry meaning by color alone.
