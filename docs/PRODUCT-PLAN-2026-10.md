# Product plan, October 2026: implementation and testing

Source: a ten-lens product review of the `feat/workspace-overhaul` UI (first run, recipe wedge, trust, direct manipulation, packaging, privacy, data quality, return trip, app shell, vocabulary). Each lens cited file and line; three single-source claims were verified against the code before being included here (default privacy mode sends sample rows; the SQL cache key has no user id; "Reset file" and "Reset all steps" call different handlers).

How to use this document: work top to bottom. Every item is sized to be one pull request. Each has the files it touches, whether it needs the backend, the tests that prove it, and what "done" means. Standing rules apply throughout: branch per item, PR, the owner tests locally, then merge; no em dashes in product copy; sentence case; plain verbs.

Constraints this plan is written around:

- Gemini is on a free tier of about 20 requests a day shared by everyone. Anything that removes an LLM call from a common path is worth more than its size suggests.
- Billing is not live. Every "Upgrade" today ends at a button that says "Coming soon".
- Backend changes are allowed but flagged, so the frontend-first phase can proceed on the items that need none.
- Recipes replay stored SQL with no AI call. That is the asset every phase builds on.

---

## Phase 0: prerequisites

Nothing below ships safely without these.

### 0.1 Land the open pull requests, in order

1. #49, the AI review workflow (registry facts). No local test needed.
2. #48, `next` 14.2.35. Owner test: sign in, upload, one transform, export.
3. #47, the workspace overhaul. After #48 merges: merge `main` into `feat/workspace-overhaul`, regenerate `package-lock.json`, rebuild, then the owner runs the full workspace script in section 9.3.

### 0.2 Frontend test harness

There is no frontend test tooling at all, and CI runs pytest only. Everything in phases 1 to 6 specifies frontend tests, so this comes first.

| piece | choice | why |
| --- | --- | --- |
| unit and component | vitest, @testing-library/react, jsdom, @testing-library/user-event | fastest to run, matches the Vite-style config Next tolerates, no Jest transform fight |
| API mocking in components | msw | the proxy routes under `app/api/*` are plain fetches; msw stubs them without touching code |
| end to end | Playwright (`@playwright/test`), chromium only | three golden paths against the local stack; the Playwright MCP is already configured on this machine |
| deterministic LLM for e2e | `LLM_PROVIDER=fake` in the backend, promoting `FakeLLM` from `backend/tests/test_routes.py:27` into `backend/app/llm/fake.py`, reading scripted replies from a JSON fixture | e2e must never spend a Gemini call or depend on one |

Tasks:

- `frontend/vitest.config.ts`, `frontend/test/setup.ts` (jest-dom matchers, msw server), `frontend/test/handlers.ts` (default handlers for `/api/files`, `/api/usage`, `/api/settings`, `/api/recipes`, `/api/insights/:id`, `/api/chat`).
- `frontend/e2e/` with a `playwright.config.ts` pointing at `http://localhost:3000`, `webServer` entries for backend (`ALLOW_ANONYMOUS=true LLM_PROVIDER=fake`) and frontend.
- Fixture CSVs under `frontend/e2e/fixtures/`: `orders_oct.csv` (1,000 rows, 12 duplicates, 23% null `Region`, mixed-case region values, two date formats) and `orders_nov.csv` (same shape, 40 new rows, column `Customer Email` renamed to `Email` to exercise drift).
- `package.json` scripts: `test`, `test:watch`, `e2e`, `typecheck`.
- `.github/workflows/tests.yml` gains a `frontend` job: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. The e2e job runs on `pull_request` too, chromium only, with the fake LLM.

Acceptance: a deliberately broken type fails the PR check; `npm test` runs one placeholder test; `npm run e2e` opens the landing page and asserts the h1.

Effort: 2 days. Backend: the fake provider, half a day.

### 0.3 Events for measurement

`backend/app/events.py` already has `record(user_id, event, **properties)` and three events (`paywall_hit`, `checkout_started`, `subscription_activated`). Add the names the phases below emit so the frontend proxies and backend routes agree from the start:

`upload_completed`, `insight_fix_applied`, `op_applied` (property `op`), `chat_sent` (property `kind`: transform, insight, clarification, error), `export_completed` (properties `steps`, `format`), `recipe_saved` (property `from`: export_strip, rail, drawer), `recipe_hint_shown`, `recipe_hint_applied`, `recipe_applied`, `recipe_incompatible`, `usage_cap_hit` (property `meter`), `llm_quota_hit`, `waitlist_joined`, `privacy_mode_changed`.

Test: `backend/tests/test_events.py` already fakes the insert; extend it with a parametrised test that every name above is a valid identifier and that `record` never raises.

Effort: half a day.

---

## Phase 1: promises the code does not keep

Ten defects. Each is a strict improvement regardless of product direction. Ship them as five PRs, grouped by the file they share.

### PR 1a: privacy default and cache key (backend, highest stakes)

**A1. The default sends sample rows.** `backend/app/engine.py:355-361` sends five distinct values per column, `:377` five full rows at upload, `:387/:416` three rows after each step; `migrations/005_create_user_settings.sql:11` defaults `privacy_mode` to false. The landing page (`app/page.tsx:31, :110, :213-249`) and README line 42 promise schema only.

Decision taken here: flip the default to strict (schema only) for new users and for any user who has never explicitly set the mode. Existing explicit settings are kept. The copy rewrite and the in-product chip are phase 4; this PR only makes the default true to the promise.

- Backend: `db.get_privacy_mode` returns true when no row exists; migration `009_privacy_default_on.sql` sets the column default to true. Do not rewrite existing rows.
- Tests (pytest): `test_privacy.py` gains `test_default_is_strict_when_unset`, `test_explicit_off_is_respected`, `test_prompt_has_no_sample_rows_when_strict` (assert the user message passed to `FakeLLM.generate_sql` contains no cell values from the fixture), `test_prompt_has_samples_when_off`.
- Acceptance: a fresh user's first chat prompt contains column names and types and nothing from the file.
- Risk: SQL quality drops without samples (the model loses hints like date formats). Mitigation is phase 3's deterministic ops, and phase 4's "Standardise date" picker which needs no samples. Watch `chat_sent kind=error` for two weeks after shipping.

**A2. Cross-user SQL reuse.** `backend/app/cache.py:24-27` keys on instruction plus schema fingerprint, process-global, 24 hour TTL. Generated SQL can contain literals taken from a user's sample rows.

- Backend: key becomes `sha256(user_id:instruction:schema_hash)`.
- Tests: `test_llm_retry.py` or a new `test_cache.py`: `test_same_instruction_different_user_misses`, `test_same_user_hits`.
- Acceptance: two users with identical schemas and instructions each cost one `FakeLLM` call.

Effort: 1 day. Backend only.

### PR 1b: the insights pipeline (frontend, with a one-line backend check)

**A3. Upload insights never reach the screen.** `backend/app/routes/insights.py:67` returns `{file_id, insights: {suggestions: [{text, instruction}]}}`; `ChatPanel.tsx:120-124` reads `data.suggestions` and `:290-298` renders strings. `workspace/page.tsx:375-392` drops the `insights` the upload response already carries.

- Frontend: read `insights.suggestions`; render `text`; keep `instruction` for the click. Pass the upload response's `insights` into state so the first render needs no refetch. "Suggest next steps" refetches `/api/insights/{id}` and replaces, never appends.
- Tests (vitest, msw): `ChatPanel.suggestions.test.tsx`: renders three chips from the nested shape; clicking a chip sends `instruction` not `text`; empty suggestions hide the button's result area and show "Nothing to suggest yet" rather than nothing.
- Acceptance: uploading `orders_oct.csv` in e2e shows "Remove 12 duplicate rows" within two seconds.

Note: in this PR a chip still sends a sentence to Chef and costs an LLM call. Phase 3 turns the same chips into zero-call fixes. Ship 1b anyway; a visible suggestion beats an invisible one.

**A5. Stop aborts only the browser.** `ChatPanel.tsx:193` says "may still finish on the server"; `app/api/chat/route.ts` forwards no signal; `chat.py:247-272` saves the step; nothing refreshes.

- Frontend: on abort, after 1.5 s, fetch `/api/files/{id}/history`; if the step count grew, call `refreshSteps` and `previewHandler`, and show the change bar with Undo and the text "That finished on the server after you stopped it".
- Tests: `ChatPanel.stop.test.tsx` with msw: abort then history reports one more step; assert the grid refresh callback fires and the bar text appears. Second case: history unchanged, no bar.
- Acceptance: e2e, stop a fake-LLM transform with an artificial 2 s delay, export, the file contains the new column.

Effort: 1 day. Backend: none (the proxy could forward `AbortSignal` later; not required for correctness).

### PR 1c: recipe hint and the open file in the URL (frontend)

**A4. The recipe hint is dead state.** `workspace/page.tsx:120, 178-196` fetches `/api/recipes` on a fresh open and stores `recipeHint`; no JSX reads it.

- Frontend: render it in the change-bar slot (`page.tsx:923`) when `steps.length === 0` and a recipe exists: "Apply '{name}' ({n} steps)?" with Apply and Not now. Apply calls `/api/recipes/{id}/apply` and lands in the grid with the bar reading "Recipe applied: {n} steps". Not now hides it for this file (localStorage keyed by fileId). Emit `recipe_hint_shown` and `recipe_hint_applied`.
- Ranking: if `GET /recipes` returns `required_columns` (phase 2 backend change), prefer the recipe with the highest overlap with `schema.columns`; until then, the most recently created.
- Tests: `WorkspaceRecipeHint.test.tsx`: shows on zero steps with a recipe; hidden with zero recipes; hidden after a step exists; Apply posts to the apply route and refreshes.

**A10. The open file is never in the URL.** `page.tsx:69-70, 288-290` reads `?file_id`; nothing writes it.

- Frontend: `router.replace('/workspace?file_id=' + id, { scroll: false })` after upload and after `loadFileById`. Refresh restores the file; the "clear your current work" dialog on "Upload a new file" is no longer needed because the current file is persisted, so it becomes a plain navigation.
- Tests: `useSearchParams` round trip in a component test with a mocked router; e2e: upload, reload, the same file is open.

Effort: 1 day. Backend: none.

### PR 1d: meters, caps and the reset verbs (frontend, with backend metering)

**A6. "AI transforms" can never move.** `chat.py:182` records `chat_requests` only; the frontend never calls `/api/transform`. `pricing/page.tsx:19-20, 39-40` sells two allowances; `UsageCard.tsx:28-32` draws three bars.

- Backend: `chat.py` records `transforms=1` and `rows_processed` when it persists a step (`:246-288`). Keep both columns; the UI shows one.
- Frontend: UsageCard shows two meters, "Uploads" and "AI requests" (the sum is wrong; use `chat_requests` as the AI meter until phase 6 merges the backend counters). Pricing lists "200 AI requests a month". Remove the `transforms` row from COMPARISON and the `?reason=transforms` branch.
- Tests: pytest `test_usage.py::test_chat_transform_records_transforms_and_rows`; vitest `UsageCard.test.tsx` snapshot of two meters and the 80% nudge text.

**A9. Recipe cap copy.** `config.py:52` is a total; `account/page.tsx:165` says "per month". Fix the copy to "1 saved recipe" and add a "Recipes 1 / 1" line to UsageCard. The behaviour decision (replace at the wall, waitlist) is phase 6.

**A7. "Reset file" versus "Reset all steps".** `CommandPalette.tsx:127` calls `handleResetClick` (clears the workspace); `ChatPanel.tsx:254` calls `handleReset` (removes steps, keeps the file).

- Frontend: palette item becomes "Close file"; chat rail button becomes "Go back to the original file"; both dialogs name the outcome ("Back at the original file", "File closed").
- Tests: `CommandPalette.test.tsx` asserts the item label and that it calls the close handler; `ChatPanel.test.tsx` asserts the aria-label.

Effort: 1.5 days. Backend: half a day.

### PR 1e: export naming and the download proxy (frontend)

**A8. Exports are misnamed.** `workspace/page.tsx:437` names every export `{stem}_transformed` even at zero steps; `dashboard/page.tsx:195` returns cleaned bytes under the raw name; `app/api/download/route.ts:13-23` hardcodes `export.csv` and `text/csv` for every format.

- Frontend: one helper `exportFileName(stem, steps, format, date)` returning `{stem}.{ext}` at zero steps and `{stem}_cleaned_{n}steps_{YYYY-MM-DD}.{ext}` otherwise, used by both surfaces. The proxy forwards the backend's `Content-Disposition` and `Content-Type`.
- Tests: `exportFileName.test.ts` (zero steps, six steps, each format's extension, date formatting); a route test for the proxy asserting header passthrough with msw's node server; e2e downloads a Parquet export and checks the suffix and media type.

Effort: half a day. Backend: none.

---

## Phase 2: recipes as the spine

Five lenses converged here. The product's retention bet is invisible at the moment it is earned.

### 2.1 Vocabulary change in the rail and drawer (frontend)

- `PipelineSpine.tsx:114` header reads "Steps" until a step exists, then "Recipe · {n} steps". A "Save recipe" row sits under "Next step" once `steps.length >= 1`. `RecipesDrawer.tsx:232, :258` drop the word "chain": "Save these {n} steps as a recipe".
- Tests: `PipelineSpine.test.tsx` header text at 0, 1 and 4 steps; save row visible from 1 step.

### 2.2 The closing strip on Export (frontend)

- After a 2xx download with `steps.length > 0` and no recipe saved from this chain, replace the change bar with: "Exported {name}. Save these {n} steps as a recipe so next month is one click." Name field prefilled `{stem} cleanup`, Save posts to `/api/recipes`, marks `ONBOARDING_FLAGS.recipe`, emits `recipe_saved from=export_strip`. Once per file (localStorage on fileId). Not now dismisses.
- Tests: `ExportClosingStrip.test.tsx`: appears after download with steps; absent at zero steps; absent after a save; Save posts the right payload; dismissal persists across remount.
- e2e golden path 1 ends here: upload, two fixes, export, save recipe.

### 2.3 Next month opens on the recipe (frontend, small backend)

- Upload phase (`page.tsx:650-755`): when `GET /recipes` is non-empty, a "Re-run" card above the samples: recipe name, step count, source file name. Dropping a file on the card uploads, applies, and lands in the grid with "Recipe applied: {n} steps". `rememberLastFile` fires on upload and open, not only on rename.
- Backend: `list_recipes` returns `source_file_name` and `required_columns` (the recipe already stores `source_file_id` and the SQL; derive required columns at save time and store them).
- Tests: pytest `test_recipes.py::test_list_includes_source_name_and_required_columns`; vitest card renders from the list shape and the drop handler calls upload then apply in order; e2e golden path 2: drop `orders_nov.csv` on the card, grid shows the chain applied, export.

### 2.4 Recipes in the nav and a Recipes page (frontend)

- `Header.tsx:24-28` signed-in nav becomes Files, Recipes, and the current file name when one is open. Pricing stays reachable from UsageCard, the account page and the 402 wall.
- `/recipes` lists recipes with their steps (read from `GET /recipes/{id}`), "Apply to…" opens a file picker backed by `/api/files`, and "Run on a new file" opens `/workspace?recipe_id=` which pre-arms the Re-run card.
- Files rows gain "{n} steps · {recipe name}" once the backend returns `step_count` and `recipe_name` (2.5).
- Tests: `Header.test.tsx` nav items signed in and out; `RecipesPage.test.tsx` list, apply picker, empty state; e2e: nav to Recipes, apply to an existing file.

### 2.5 Files rows that say what state a file is in (backend, then frontend)

- Backend: `list_files` adds `step_count`, `last_exported_at`, `recipe_name`, `original_row_count`; default sort `updated_at desc`. Do it as one query with subqueries, not N+1; add an index on `transformations(file_id)` if missing.
- Tests: pytest `test_files.py::test_list_has_state_fields`, a timing assertion that listing 50 files makes one DB round trip (count the fake table's calls).
- Frontend: dashboard rows show "9,412 rows (uploaded 10,000) · 6 steps · Monthly orders · exported Sep 3".

Effort for phase 2: 5 days frontend, 1.5 days backend. Risk: nav churn for existing users; mitigate with the file-name crumb so "where am I" stays answered.

---

## Phase 3: clicks before Chef

Every data change today costs a Gemini call. The backend already validates and replays arbitrary SELECTs and recipes snapshot SQL only, so deterministic operations can enter the same step chain.

### 3.1 The structured-op endpoint (backend)

`POST /transform/op` with `{file_id, op, column?, args?}`. Server-side SQL templates, never client SQL:

| op | SQL shape | args |
| --- | --- | --- |
| trim | `SELECT * REPLACE (TRIM("c") AS "c") FROM data` | column |
| drop_column | `SELECT * EXCLUDE ("c") FROM data` | column |
| rename | `SELECT * EXCLUDE ("c"), "c" AS "new" FROM data` | column, new_name |
| fill_nulls | `SELECT * REPLACE (COALESCE("c", ?) AS "c")` | column, value |
| drop_empty_rows | `WHERE "c" IS NOT NULL AND "c" <> ''` | column |
| dedupe | `SELECT DISTINCT ON ("a","b") *` or `SELECT DISTINCT *` | columns or all |
| cast | `TRY_CAST("c" AS type)` | column, type in {INTEGER, DOUBLE, DATE, VARCHAR} |
| standardise_date | `TRY_STRPTIME("c", fmt)::DATE` | column, format from an allow-list |
| sort | `ORDER BY "c" asc or desc` | column, direction |
| contains_any | `WHERE "a" ILIKE '%x%' OR "b" ILIKE '%x%'` | needle, columns |

Each op: validate the column exists in the current schema, build SQL, run `validate_sql`, replay, save a step with a human instruction ("Trim whitespace in Email"), record `transforms=1` and `rows_processed`, emit `op_applied op=trim`. Never `chat_requests`. Identifiers are quoted by the server; values are parameters, not interpolation.

Tests (pytest, `test_ops.py`): one test per op against a DuckDB fixture asserting rows before and after; `test_unknown_column_400`; `test_unknown_op_400`; `test_value_with_quote_is_parameterised` (fill with `O'Brien`); `test_format_not_in_allowlist_400`; `test_op_step_is_in_history_and_undoable`; `test_recipe_with_op_steps_replays_without_llm` (FakeLLM call count stays 0).

### 3.2 Column header menu (frontend)

`DataGrid.tsx:370-395` gains: Trim whitespace, Rename…, Drop column, Fill empty cells…, Cast to…, Remove duplicate rows (this column), Drop rows where empty, Standardise dates… (date columns only), Sort all rows ascending/descending. Existing "Sort ascending" becomes "Sort preview only" (phase 5 labels it). "Ask Chef about this column" stays last.

Tests: `DataGrid.columnMenu.test.tsx`: items present by dtype; each item posts the right `{op, column}`; Rename and Fill open an inline field and post on Enter; Escape cancels.

### 3.3 Health strip and insights strip become fixes (frontend)

- Clicking a health segment with nulls opens a popover: "Region · 23% missing" with Drop empty rows, Fill with…, Drop column, each calling 3.1.
- The insights chips from PR 1b become buttons: "Remove 12 duplicate rows" calls `dedupe all`; "Drop 230 rows where Region is empty" calls `drop_empty_rows`; emit `insight_fix_applied`. Suggestions that have no deterministic op keep sending to Chef and say so ("asks Chef").
- Health recomputes after every step: call `/api/insights/{id}` after `previewHandler`, merge `null_columns` into `schema`, animate the fill. Debounce 500 ms. If the replay is slow on large files, move null counts into the transform response (backend, optional).

Tests: `ColumnHealth.popover.test.tsx`; `InsightsStrip.test.tsx` deterministic versus Chef-routed chips; e2e golden path 1 now uses two one-click fixes and makes zero fake-LLM calls (assert on the fake provider's call log endpoint, `GET /__fake_llm/calls`, test-only).

### 3.4 Intercept known verbs before sending (frontend)

In `ChatPanel.tsx:130-153`, a small matcher for trim, dedupe, rename, drop, sort plus a column name from `schema.columns` shows a chip above the input: "Apply without AI: Trim Email". Enter still sends to Chef; clicking the chip calls the op. Starter prompts change to Chef-only work ("Add column Profit = Revenue - Cost", "Flag rows where Status is Paid but Amount is 0").

Tests: `verbMatcher.test.ts` table-driven (20 phrasings, expected op or null, including near misses like "trim the fat"); `ChatPanel.intercept.test.tsx` chip appears and calls the op; Enter still posts to chat.

Effort for phase 3: 3 days backend, 4 days frontend. Risk: template bugs ship as steps; every op is undoable and runs through the same validator as LLM SQL, so the blast radius is one step.

---

## Phase 4: privacy made legible

### 4.1 Mode chip in the chat input (frontend)

Above the textarea (`ChatPanel.tsx:442-477`): "Schema only" or "Schema + sample rows", clickable to flip, fetched on workspace mount from `/api/settings`. The welcome state says it in one line. The mobile nav gets the toggle too. Emit `privacy_mode_changed`.

Tests: `PrivacyChip.test.tsx` initial state from settings; flip posts PATCH and updates optimistically; failure reverts and toasts.

### 4.2 "Sent to Chef" receipt per step (backend, then frontend)

- Backend: `/chat` and `/transform` return and store per step `{mode, columns_sent, sample_rows_sent, values_per_column, source: llm | cache | recipe}`. Store counts and the column list, not the sample text. History returns it.
- Frontend: beside "SQL" in the chat bubble and the history drawer, a "Sent" toggle rendering the schema block and "5 sample rows" or "no sample rows"; cache and recipe steps render "No AI call".
- Tests: pytest `test_privacy.py::test_step_records_what_was_sent` for both modes and for a cache hit; vitest `SentDisclosure.test.tsx`.

### 4.3 Honest copy (frontend)

Landing `app/page.tsx:31, :110, :213-249`, README line 42, the header and account descriptions: "column names, types, and a handful of sample rows; strict mode removes the samples", and since phase 1 made strict the default, lead with that. Strict-mode insight bubbles carry "From column names and types only".

Tests: copy is covered by the e2e landing assertion; add a lint-style test `copy.test.ts` that greps rendered marketing strings for "never goes to the AI" and fails if present without the qualifier.

Effort: 1 day frontend, 1.5 days backend.

---

## Phase 5: honest grid, honest export

### 5.1 Label the preview sort (frontend)

`DataGrid.tsx:178-193, 381-385, 499-500`: menu items read "Sort preview ↑ / ↓"; when sorted and `totalRows > rows.length`, the status bar reads "Preview sorted by Amount ↓ (500 of 48,000)" with a "Sort all rows" link calling the `sort` op from phase 3.

Tests: `DataGrid.sort.test.tsx` labels; status bar text with and without `totalRows`.

### 5.2 Export says what it exports (frontend, small backend)

On Export menu open, fetch history and render a header: "Step 6 of 6 · 9,412 rows × 14 cols · +Profit −Notes". If the server's step count differs from local `steps`, show "The server has 7 steps. Reload to see them." and disable the formats. Ctrl+S opens the menu rather than downloading. Files page "Download as…" shows "{rows} rows · {n} steps".

Backend: history includes the original row count and per-step `columns_added` and `columns_removed` (derive from stored `columns_after` deltas; the first step compares against the file's base columns).

Tests: pytest `test_files.py::test_history_has_deltas`; vitest `ExportMenu.test.tsx` header, mismatch state disables items, Ctrl+S opens; e2e: export header matches the rail.

### 5.3 Redo and before/after in history (backend, then frontend)

- Backend: `POST /files/{id}/steps` takes `{instruction, sql}`, runs `validate_sql` exactly as recipe apply does, replays, saves. No LLM.
- Frontend: after Undo, the toast "Step 6 undone" has a Redo action that re-posts the stored SQL from `msg.metadata.sql`. Every undo entry point (change bar, Ctrl+Z, chat header, palette) goes through the same path; until Redo exists, all four confirm. History drawer shows "10,000 → 9,412 (−588) · +Profit" per step. After undo or revert the change bar reads "Back at step 5 · 9,412 rows × 14 cols".
- Tests: pytest `test_steps.py::test_post_step_validates_and_replays`, `test_post_step_rejects_non_select`; vitest `UndoRedo.test.tsx`; e2e: transform, undo, redo, the column is back and the fake LLM was called once.

Effort: 2 days frontend, 1.5 days backend.

---

## Phase 6: failure with a next step, one metered word, no dead ends

### 6.1 Error dictionary keyed by code (frontend, tiny backend)

`ChatPanel.tsx:178-186` renders `data.message` verbatim. Replace with a dictionary:

| code | what the user reads | action |
| --- | --- | --- |
| USAGE_LIMIT_EXCEEDED | "You've used this month's 200 AI requests. They reset on 1 November." | Upgrade (phase 6.3) |
| LLM_QUOTA | "Chef is out of AI capacity for today. Your recipes and one-click fixes still work." | Open recipes |
| RATE_LIMITED | "Too many requests. Try again in 20 seconds." | countdown, re-enable Send |
| INVALID_SQL | "I couldn't write a safe query for that. Try naming the column." | Edit and retry |
| EXECUTION_FAILED | "That query didn't run. Details below." | Edit and retry, Details |
| LLM_FAILED | "Chef didn't answer. Try again." | Retry |
| RECIPE_INCOMPATIBLE | "This file is missing columns the recipe needs: {list}." | Map columns (phase 7) |

Backend: classify Gemini 429 and RESOURCE_EXHAUSTED as `LLM_QUOTA`; the usage payload adds `action`, `used`, `limit`, `resets_at`; the two silent branches in `chat.py:177-179, :213-218` persist an assistant error row. Every error bubble keeps the typed instruction ("Edit and retry" restores it). Success reads "Done. 4,982 → 4,120 rows", not an echo of the instruction.

Tests: pytest `test_llm_retry.py::test_quota_maps_to_LLM_QUOTA`, `test_error_rows_persisted`; vitest `ErrorBubble.test.tsx` table-driven over the codes, "Edit and retry" restores the text; e2e golden path 3: the fake LLM returns a quota error, the bubble says recipes still work and the Open recipes button works.

### 6.2 One meter (backend, then frontend)

Backend: `usage` exposes `ai_requests` as `chat_requests` (the only counter that fires) and keeps `transforms` for the ledger. Frontend: UsageCard, pricing, account say "AI requests". The command bar shows "AI requests 143 / 200" once past 80%. Deep link `?reason=ai_requests`.

Tests: pytest `test_usage.py`; vitest `UsageCard.test.tsx` one AI meter; `CommandBarMeter.test.tsx` hidden below 80%.

### 6.3 No dead ends while billing is off (frontend, small backend)

When `billing_configured` is false: every Upgrade CTA becomes "Join the Pro waitlist" posting `waitlist_joined` with the `reason`; the pricing page hides the "Instantly" timeline and the cancel copy; the recipe wall offers "Replace '{name}' with these steps" (DELETE then POST) beside the waitlist button; the drawer passes `?reason=recipes`.

Tests: vitest `PricingPage.test.tsx` configured versus unconfigured; `RecipeWall.test.tsx` replace flow posts delete then create; pytest `test_billing.py::test_waitlist_event_recorded`.

Effort for phase 6: 2.5 days frontend, 1.5 days backend.

---

## Cross-cutting: the glossary

Applied in every PR above, then one sweep PR at the end.

| use | replaces |
| --- | --- |
| file | dataset, upload (as a noun) |
| step | transform, transformation, change |
| recipe | chain |
| undo | (remove the last step only) |
| go back to step N / the original file | revert, reset |
| export | download |
| AI request | AI transform, chat message |
| Chef | Sage |

Voice: an error states what happened, then what to do, in these words, never the engine's. A confirmation names the outcome ("Back at step 2"), not the verb. No em dashes. Sentence case.

Sweep test: `copy.test.ts` greps `frontend/app` and `frontend/components` for `transformation`, `chain`, `revert`, `Download as`, `Sage`, and fails on any hit outside an allow-list.

---

## Phase 7: bigger bets

Each has a go/no-go gate measured from the events in 0.3 after phases 1 to 6 have been live for 30 days.

| bet | gate to start | effort |
| --- | --- | --- |
| Column mapping on recipe drift: on `RECIPE_INCOMPATIBLE`, source-to-target dropdowns prefilled by case-insensitive match, re-apply with `column_map`, backend rewrites quoted identifiers inside `validate_sql`, offer "Save as new version" | `recipe_incompatible` > 10% of `recipe_applied` | 4 days, mostly backend |
| 28-day pull: email "Your {recipe} is ready for this month's export" linking to `/workspace?recipe_id=`, opt-out in Account | at least 20 recipes saved and a 30-day return rate below 40% | 3 days plus a provider |
| Sample datasets that demonstrate the wedge: regenerate `sales.csv` with the hero's defects, three cleanup prompts that produce steps, a seeded recipe that applies with no AI call | `upload_completed` for samples with zero subsequent steps above 50% | 2 days |
| Fold History into the rail (step click expands SQL and rows, separate "Go back here"), Schema into a header popover | after phase 5, when the drawer's remaining job is SQL only | 2 days |
| Column-question answers in strict mode from `insights.py` stats with no LLM call | `chat_sent kind=insight` above 30% of requests | 1.5 days backend |

---

## 9. Testing strategy

### 9.1 The pyramid for this repo

| layer | tool | what it proves | runs |
| --- | --- | --- | --- |
| backend unit | pytest, existing 139 tests, `FakeLLM`, `_reset_rate_limiter` | SQL templates, validators, metering, cache keys, privacy payloads | every PR |
| frontend unit | vitest | pure logic: `csv-tools`, `exportFileName`, `verbMatcher`, chart label thinning, filename split | every PR |
| component | vitest, testing-library, msw | state machines: chat errors, export menu, closing strip, usage meters, menus | every PR |
| end to end | Playwright, chromium, fake LLM | the three golden paths, against the real backend with `ALLOW_ANONYMOUS=true` | every PR, chromium only |
| manual | the owner, before merge | what automation cannot judge: does it feel right, real Gemini once | every PR, by rule |

### 9.2 The three golden paths (e2e)

1. **First month.** Open `/workspace`, drop `orders_oct.csv`, the insights strip shows duplicates and the empty Region; click both fixes (zero LLM calls); ask Chef for "Add column Margin = MRP - Landing Cost" (one fake call); export; the closing strip appears; save as "Orders cleanup". Assert: rail reads "Recipe · 3 steps", the file name has `3steps`, `recipe_saved` was recorded.
2. **Next month.** Open `/workspace`, the Re-run card shows "Orders cleanup"; drop `orders_nov.csv` on it; the bar reads "Recipe applied: 3 steps"; export. Assert: zero fake-LLM calls. Variant: `orders_nov_drift.csv` with `Email` renamed; assert the `RECIPE_INCOMPATIBLE` message names `Customer Email` and keeps the typed state.
3. **The bad day.** With the fake LLM scripted to return a quota error, send a message; assert the bubble text, the Open recipes button, Send disabled, the instruction preserved by "Edit and retry". With the fake scripted to return `DROP TABLE`, assert the INVALID_SQL bubble and that no step was created.

### 9.3 The owner's manual script before merging #47 and every phase PR

Run in a signed-in browser against the local stack with the real Gemini, once, at the end:

1. Upload a real export you use. Confirm the insights strip names something true about it.
2. One click fix, one Chef transform, one undo, one redo.
3. Open History: every step shows before → after and, from phase 4, "Sent".
4. Sort a column: the label says preview; sort all rows from the menu; export; open the file; it is sorted.
5. Export: the header matches the rail; the filename carries the step count and date.
6. Save the recipe from the closing strip. Reload. Upload the same file again; apply the hint; export.
7. Toggle the privacy chip; send one message in each mode; open "Sent" on both.
8. Dark mode and a phone-width window once each.
9. Open the command palette: "Close file" closes; nothing says "Reset".

Anything that surprises you is a bug, not a preference.

### 9.4 Test data

- `orders_oct.csv`, `orders_nov.csv`, `orders_nov_drift.csv` as in 0.2, generated by a script committed under `frontend/e2e/fixtures/generate.py` so they can be regenerated with a different seed.
- The fake LLM fixture `backend/app/llm/fake_replies.json`: a map from instruction substring to reply, with `__quota__` and `__invalid__` sentinels.

---

## 10. Sequence, estimates, dependencies

| order | PR | depends on | frontend | backend |
| --- | --- | --- | --- | --- |
| 0 | #49, #48, #47 merged | | | |
| 1 | 0.2 test harness and CI gate | #48 (lockfile) | 2 d | 0.5 d |
| 2 | 0.3 events | | | 0.5 d |
| 3 | 1a privacy default, cache key | | | 1 d |
| 4 | 1b insights pipeline, stop reconcile | 1 | 1 d | |
| 5 | 1c recipe hint, file in URL | 1 | 1 d | |
| 6 | 1d meters, caps, reset verbs | 1 | 1 d | 0.5 d |
| 7 | 1e export naming, proxy | 1 | 0.5 d | |
| 8 | 2.1 and 2.2 rail vocabulary, closing strip | 5 | 1.5 d | |
| 9 | 2.3 and 2.5 Re-run card, file state | 8 | 2 d | 1.5 d |
| 10 | 2.4 nav and Recipes page | 9 | 1.5 d | |
| 11 | 3.1 structured ops | 3 | | 3 d |
| 12 | 3.2 and 3.3 header menu, health and insights fixes | 11, 4 | 3 d | |
| 13 | 3.4 verb intercept | 12 | 1 d | |
| 14 | 4.1 and 4.3 privacy chip, honest copy | 3 | 1 d | |
| 15 | 4.2 sent receipts | 14 | 0.5 d | 1.5 d |
| 16 | 5.1 and 5.2 preview sort label, export header | 11 | 1 d | 0.5 d |
| 17 | 5.3 redo, history deltas | 16 | 1 d | 1 d |
| 18 | 6.1 error dictionary | 2 | 1.5 d | 0.5 d |
| 19 | 6.2 and 6.3 one meter, waitlist, replace at wall | 6, 18 | 1 d | 1 d |
| 20 | glossary sweep | all | 0.5 d | |

Totals: about 21 frontend days and 12 backend days of focused work, or roughly seven weeks for one person at the pace this repo has moved. Items 3 to 7 are independent of each other and can run in parallel once the harness exists.

---

## 11. Risks and rollback

| risk | signal | rollback |
| --- | --- | --- |
| Strict-by-default degrades SQL quality | `chat_sent kind=error` rises after 1a | the chip in 4.1 makes "sample rows" one click; the default can revert to off per environment via `PRIVACY_DEFAULT` |
| Structured-op templates produce wrong rows | a pytest per op; `op_applied` followed by undo within 10 s | every op is one undoable step; disable an op by name server-side without a deploy via config |
| Nav change disorients returning users | support messages; `recipe_applied` does not rise after phase 2 | the file-name crumb and the Re-run card are the recovery; Pricing can return to the nav in one line |
| Health recompute slows large files | p95 of `/api/insights` after each step | debounce; move null counts into the transform response; cap at 100k rows |
| Waitlist converts nudges into silence rather than signal | `waitlist_joined` near zero while `paywall_hit` is not | restore "Coming soon" with a date, keep the Replace affordance |

What this plan does not include: the Next 15 and React 19 migration (its own plan, needed to clear the residual advisories from #48), untracking `backend/audits/**`, and pinning backend requirements. Those are hygiene, scheduled separately.
