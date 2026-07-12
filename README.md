<div align="center">

<img src="frontend/public/logo.svg" alt="SheetsLLM" width="72" height="72" />

# SheetsLLM

**Clean the same spreadsheet once. Never again.**

Describe your cleanup in plain English, save it as a recipe, and re-run it on every new export in one click. Your data never goes to the AI.

[**Open the app**](https://sheets-llm.vercel.app) &nbsp;·&nbsp; [Pricing](https://sheets-llm.vercel.app/pricing) &nbsp;·&nbsp; [Free tools](https://sheets-llm.vercel.app/tools)

</div>

---

## The problem it solves

Every month the same messy export lands on your desk, and you spend the same 30 to 40 minutes fixing it by hand: trimming whitespace, standardizing dates, removing duplicates, totaling by region. SheetsLLM lets you describe that cleanup once in plain English. It turns your words into a validated database query, runs it on your file, and shows the result live. Save the steps as a **recipe**, and next month's file becomes a single click with no AI call and no drift.

## Features

- **Plain-English cleanups.** Upload a file and type what you want. "Remove rows with missing region", "standardize the dates to ISO", "total revenue by region". SheetsLLM writes and runs the query for you.
- **Reusable recipes.** Save any chain of steps once. Re-apply it to future uploads in one click. The steps run exactly the same every time, with no AI involved on replay, so results never drift.
- **Sage, your data chat.** A conversational assistant that transforms your file, answers questions about it, or asks for clarification when a request is ambiguous.
- **Live preview with full history.** Every step is recorded with the exact query it ran and the row counts before and after. Undo a step, reset everything, or revert to any point. Your original file is never touched.
- **Automatic insights.** On every upload you get a data-quality read: null percentages, duplicate rows, and numeric summaries, with one-click fixes.
- **Built-in charts.** Bar, line, and pie charts with aggregation and PNG export, right next to your data.
- **Every format in and out.** Import CSV, Excel (single or multi-sheet), TSV, JSON, and Parquet. Export to CSV, Excel, TSV, JSON, or Parquet.
- **Handles real files.** Up to one million rows per file, with large transforms processed in the background so the app stays responsive.

## How it works

1. **Upload any export.** CSV, Excel, JSON, or Parquet. The schema is detected instantly and you see a preview in seconds.
2. **Describe the cleanup.** Type it in plain English. Sage writes a validated, read-only query and shows you the result live before anything is saved.
3. **Save it as a recipe.** Next month's file re-applies every step in one click, deterministically, with no AI call at all.

## Privacy and security

Privacy is the core of the product, not an afterthought.

- **Your rows never go to the AI.** Only a small schema summary (column names, types, and aggregate stats) is sent to generate a query. Your actual data stays in our sandbox.
- **Strict privacy mode.** Turn it on and not even sample values leave: the AI works from column names and types alone. It is a guarantee you can show an auditor.
- **Your data never trains any AI model.**
- **Read-only queries only.** The AI can produce a single read query, checked against a strict allowlist before it runs. It can never modify, delete, or reach outside your file.
- **Immutable originals.** Your uploaded file is stored once and never changed. Every transformation is a separate, reversible step.
- **Isolated per account.** Files, history, and recipes are private to your account and survive restarts.

## Pricing

Start free. Upgrade when the cleanups become a routine.

| | **Free** | **Pro** |
| --- | --- | --- |
| Price | Rs 0 / month | Rs 499 / month |
| Uploads | 50 / month | 1,000 / month |
| AI transforms | 200 / month | 5,000 / month |
| Chat messages | 200 / month | 5,000 / month |
| Rows per file | 1M | 1M |
| Saved recipes | 1 | Unlimited |
| History, undo and revert | Yes | Yes |
| Strict privacy mode | Yes | Yes |
| Insights and charts | Yes | Yes |
| Support | Community | Priority email |

No credit card to start, and you can cancel anytime in one click. Your files, recipes, and history are never deleted when you move between plans.

## Free tools

A set of fast, private, in-browser utilities that need no signup and never upload your file:

- **CSV Duplicate Remover:** match on the whole row or specific columns.
- **JSON to CSV Converter:** nested objects flatten to dot-path columns.
- **CSV Splitter:** break a large CSV into smaller files that open cleanly in Excel.
- **CSV Cleaner:** trim whitespace and drop empty rows and columns.

Try them at [sheets-llm.vercel.app/tools](https://sheets-llm.vercel.app/tools).

## Tech stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS.
- **Backend:** FastAPI on Python, with DuckDB doing the query work.
- **Platform:** Supabase for authentication, database, and file storage. Frontend on Vercel, backend on Render.
- **AI:** provider-agnostic, running on Google Gemini by default.

## Run it locally

You need Python 3.12, Node.js 18 or newer, a free Supabase project, and a Gemini key.

```bash
# Backend
cd backend
uv venv --python 3.12 .venv
uv pip install -r requirements.txt --python .venv/Scripts/python.exe   # Windows
uvicorn app.main:app --reload --port 8000

# Frontend (in a second terminal)
cd frontend
npm install
npm run dev
```

Create `backend/.env` with your Supabase project URL and keys, your Gemini key, and `LLM_PROVIDER=gemini`. Create `frontend/.env` with `BACKEND_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Run the SQL migrations in `backend/migrations/` against your Supabase project, then open http://localhost:3000, create an account, and upload a file.

A `docker compose up --build` is also available and starts both services together.

## Contact

Questions or feedback: use the in-app Feedback button, email pranjalprateek9@gmail.com, or open an issue.
