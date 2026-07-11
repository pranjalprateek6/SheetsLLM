# SheetsLLM — AI-Powered Spreadsheet Transformation

> Transform your spreadsheets using natural language. No formulas, no code, just plain English.

## 🎯 Overview

**SheetsLLM** is a full-stack web application that transforms CSV/XLSX/JSON/Parquet files using natural language. Type an instruction like *"keep rows where age > 28"* or *"create a column landing cost x MRP"* and an LLM translates it into a **DuckDB SQL** query that runs against your data — with a live preview, full step-by-step history, undo/revert, and a conversational assistant (**SAGE**) that can both transform data and answer questions about it.

### How it's different from the usual "LLM + pandas" demo

- **SQL, not generated code** — the LLM emits a single `SELECT` statement, validated against a strict allowlist before execution. No arbitrary code ever runs.
- **Immutable source data** — uploads are converted once to Parquet and never mutated. Every transformation is stored as a SQL step and **replayed as a CTE chain**, so undo/reset/revert are just "truncate the step list and re-run".
- **Real persistence & multi-user** — Supabase Postgres for metadata, Supabase Storage for Parquet objects, Supabase Auth (JWT) for users. Files survive restarts and are isolated per user.
- **Provider-agnostic LLM layer** — switch between OpenAI and Google Gemini with one env var.

---

## ✨ Features

| Area | What you get |
|---|---|
| **Upload** | CSV, XLSX/XLS (multi-sheet with selector), TSV, JSON/JSONL, Parquet — converted to ZSTD Parquet. Magic-byte validation, VBA-macro rejection, column sanitization |
| **Transform** | Natural language → validated DuckDB SQL: filter, sort, select/drop/rename, computed columns, group-by aggregates, dedupe, null handling, pivots… anything expressible as a `SELECT` |
| **SAGE chat** | Conversational panel with three response modes: **transform** (runs SQL), **insight** (answers questions about the data), **clarification** (asks back when ambiguous, with suggestion buttons) |
| **Insights** | Auto-generated data quality report on upload: null percentages, duplicate rows, numeric min/max/avg/median, one-click fix suggestions |
| **Charts** | Built-in bar/line/pie builder (pure SVG, no chart library) with aggregation modes and PNG export |
| **History** | Every step recorded with its SQL; step-by-step **undo**, full **reset**, and **revert to any step**. Audit log of every action |
| **Files** | Dashboard with rename, duplicate, delete, download (CSV/TSV/JSON/Parquet), pagination, search & sort |
| **Async jobs** | Transforms on >100k-row files run as background jobs with progress polling |
| **UX** | Dark glass-morphism UI, virtualized data grid (sortable/resizable/copy-cell), ⌘K command palette, keyboard shortcuts, onboarding tour |

---

## 🏗️ Architecture

```
┌───────────────────────────────────────────────────────────┐
│                   Frontend — Next.js 14                    │
│  Pages: / · /auth · /dashboard · /workspace                │
│  Components: DataGrid · ChatPanel · ChartPanel ·           │
│              InsightsCard · HistoryDrawer · CommandPalette │
│                                                            │
│  app/api/* route handlers (thin proxies, forward JWT) ─────┼──┐
│  Supabase JS: email/password auth, session management      │  │
└────────────────────────────────────────────────────────────┘  │
                                                    HTTP/JSON   │
┌───────────────────────────────────────────────────────────────▼┐
│                     Backend — FastAPI                           │
│                                                                 │
│  Middleware: CORS → security headers → per-route timeouts →     │
│              request-id → Supabase JWT auth                     │
│                                                                 │
│  ┌───────────┐  ┌──────────────┐  ┌───────────────────────┐    │
│  │ LLM layer │  │ SQL validator │  │ DuckDB engine         │    │
│  │ OpenAI /  │─▶│ SELECT-only,  │─▶│ Parquet views, CTE    │    │
│  │ Gemini    │  │ EXPLAIN check │  │ replay, schema stats  │    │
│  └───────────┘  └──────────────┘  └───────────────────────┘    │
│        ▲                                       │                │
│   24h SQL cache                     30-min local Parquet cache  │
└────────────┬──────────────────────────────────┬────────────────┘
             │                                  │
   ┌─────────▼──────────┐            ┌──────────▼─────────┐
   │  Supabase Postgres │            │  Supabase Storage  │
   │  files             │            │  {user}/{file}/    │
   │  transformations   │            │  original.parquet  │
   │  audit_log         │            └────────────────────┘
   │  chat_messages     │
   └────────────────────┘
```

### The transformation model (the interesting part)

1. Upload converts the file **once** to Parquet — this object is never modified again.
2. Each instruction produces one SQL step (`SELECT … FROM data`), stored in the `transformations` table with a step number.
3. Reads replay the whole stack as a CTE chain:

```sql
WITH step_1 AS (SELECT * FROM data WHERE age > 28),
     step_2 AS (SELECT name, age, city FROM step_1 ORDER BY age DESC)
SELECT * FROM step_2
```

4. **Undo** deletes the last step. **Reset** deletes all steps. **Revert** deletes everything after step *N*. Then the chain is simply replayed.

### Safety pipeline for LLM-generated SQL

```
instruction ─▶ LLM (temp 0) ─▶ strip fences/semicolons
           ─▶ must start with SELECT/WITH
           ─▶ keyword denylist (DROP/INSERT/COPY/ATTACH/PRAGMA/…)
           ─▶ no statement chaining
           ─▶ DuckDB EXPLAIN dry-run
           ─▶ execute (thread-pool timeout, memory-capped connection)
           ─▶ on error: one LLM retry with the DuckDB error as context
```

---

## 🛠️ Tech Stack

**Frontend** — Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · Framer Motion · TanStack Virtual · Supabase JS · Lucide

**Backend** — FastAPI · Python 3.12 · DuckDB · PyArrow · Supabase (Postgres + Storage + Auth) · httpx · pandas/openpyxl (XLSX ingestion only)

**LLM** — OpenAI (`gpt-4o-mini`-class) or Google Gemini (`gemini-3.5-flash`), selected via `LLM_PROVIDER`

---

## 🚀 Setup

### Prerequisites

- **Python 3.12** (easiest via [uv](https://docs.astral.sh/uv/), which can download it for you)
- **Node.js 18+**
- A **Supabase project** (free tier works)
- An **OpenAI or Gemini API key**

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run `backend/migrations/001_create_tables.sql` in the SQL editor (creates `files`, `transformations`, `audit_log`, `chat_messages`).
3. Create a **private** storage bucket named `sheetsllm-files`.
4. Grab from Project Settings → API: the **URL**, **anon key**, and **service_role key**.

### 2. Backend

```bash
cd backend

# with uv (recommended)
uv venv --python 3.12 .venv
uv pip install -r requirements.txt --python .venv/Scripts/python.exe   # Windows
# uv pip install -r requirements.txt --python .venv/bin/python        # macOS/Linux

# or classic
python -m venv .venv && .venv/Scripts/activate && pip install -r requirements.txt
```

Create `backend/.env`:

```bash
# LLM — pick one provider
LLM_PROVIDER=gemini                 # "openai" or "gemini"
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-3.5-flash

# Supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>
SUPABASE_ANON_KEY=<anon key>
SUPABASE_BUCKET=sheetsllm-files

# Auth — leave unset (or false) in production!
# true = requests with missing/invalid JWTs proceed as user "anonymous"
ALLOW_ANONYMOUS=true                # local dev convenience only

# Optional limits (defaults shown)
MAX_ROWS=1000000
MAX_PREVIEW_ROWS=500
MAX_UPLOAD_MB=400
MAX_INSTRUCTION_LENGTH=2000
MAX_COLUMNS=500
DUCKDB_THREADS=2
DUCKDB_MEMORY_LIMIT=512MB
DUCKDB_QUERY_TIMEOUT=30
ALLOWED_ORIGINS=http://localhost:3000
```

Run it:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```bash
BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

```bash
npm run dev
```

Open **http://localhost:3000**, sign up at `/auth`, upload a file, and try *"show the top 10 rows by revenue"*.

### Docker

```bash
docker compose up --build
```

Brings up backend (:8000) and frontend (:3000); backend health-gated.

---

## 📡 API Reference (FastAPI, all JSON)

All routes except `/health` require `Authorization: Bearer <supabase-jwt>` (unless `ALLOW_ANONYMOUS=true`).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness + active LLM provider/model |
| `POST` | `/upload` | Raw bytes + `X-Filename` header (+ `?sheet_name=` for multi-sheet XLSX) → file_id, schema, preview, insights |
| `GET` | `/files` | Paginated file list |
| `GET` | `/files/{id}` | File metadata + transformation steps |
| `PATCH` | `/files/{id}` | Rename |
| `DELETE` | `/files/{id}` | Delete file + storage object + steps |
| `POST` | `/files/{id}/duplicate` | Copy file (storage + metadata) |
| `GET` | `/files/{id}/history` | Transformation steps |
| `POST` | `/files/{id}/revert/{step}` | Revert to step N, replay |
| `POST` | `/transform` | `{file_id, instruction}` → SQL + preview (or `{job_id}` for large files, or a clarification) |
| `POST` | `/chat` | `{file_id, message}` → transform / insight / clarification |
| `GET` | `/chat/{id}` | Chat history |
| `GET` | `/insights/{id}` | Data-quality insights (reflects applied steps) |
| `GET` | `/jobs/{id}` | Poll async job status/progress/result |
| `POST` | `/undo` | Remove last step, replay |
| `POST` | `/reset` | Remove all steps |
| `GET` | `/download?file_id=&format=` | Export result — csv, tsv, json, parquet |
| `GET` | `/audit/{id}` | Paginated audit trail |

The Next.js `app/api/*` routes are thin same-origin proxies that forward the Supabase session token to the backend.

---

## 🔐 Security Model

- **SELECT-only SQL** — denylist of mutating/system keywords, no semicolons, `EXPLAIN` dry-run before execution; DuckDB runs in-memory with thread/memory caps and a query timeout.
- **Auth** — Supabase JWTs verified server-side on every request. The `ALLOW_ANONYMOUS` dev fallback is **off by default**; without it, unauthenticated requests get a strict 401.
- **Tenancy** — every DB query filters by `user_id`; storage keys are namespaced `{user_id}/{file_id}/`.
- **Uploads** — magic-byte checks (rejects executables/mismatched extensions), `.xlsm`/VBA-macro rejection, column-name sanitization, size/column caps.
- **Abuse** — per-user sliding-window rate limit (30 req/min) on LLM-backed endpoints; security headers (HSTS, nosniff, frame-deny) on all responses.

**Known gaps (tracked for follow-up):** no Postgres RLS policies yet (isolation is application-level); DuckDB file-reading functions (`read_csv`, `read_text`, …) are not yet blocked by the validator; no automated test suite.

---

## 📁 Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + middleware stack
│   │   ├── config.py          # env-driven configuration
│   │   ├── auth.py            # Supabase JWT verification
│   │   ├── engine.py          # DuckDB: execution, CTE replay, schema, conversion
│   │   ├── sql_validator.py   # SELECT-only enforcement
│   │   ├── db.py              # Supabase Postgres CRUD
│   │   ├── storage.py         # Supabase Storage (Parquet objects)
│   │   ├── cache.py           # SQL cache (24h) + local Parquet cache (30m)
│   │   ├── security.py        # file validation, rate limiting, sanitization
│   │   ├── insights.py        # data-quality analysis
│   │   ├── jobs.py            # in-memory async job store
│   │   ├── llm/               # adapter + OpenAI/Gemini clients + prompts
│   │   └── routes/            # one module per endpoint group
│   └── migrations/001_create_tables.sql
│
├── frontend/
│   ├── app/                   # pages: /, /auth, /dashboard, /workspace
│   │   └── api/               # proxy route handlers
│   ├── components/            # DataGrid, ChatPanel, ChartPanel, …
│   ├── contexts/AuthContext.tsx
│   └── lib/                   # supabase client, fetch-with-auth, helpers
│
└── docker-compose.yml
```

---

## 🔮 Roadmap

- Postgres RLS policies (defense-in-depth for tenancy)
- Block DuckDB file-access functions in the SQL validator
- Automated tests (validator + CTE replay first)
- Multi-file joins · saved transformation templates · scheduled transforms
- Rename the vestigial `r2_key` column (storage moved from Cloudflare R2 to Supabase)

---

## 📞 Contact

Questions or feedback: pranjalprateek9@gmail.com — or open an issue.
