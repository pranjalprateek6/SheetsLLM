# SheetsLLM

Transform spreadsheets using natural language. Upload a CSV, XLSX, JSON, or Parquet file, describe the change in plain English — "keep rows where age > 28", "create a column landing cost x MRP" — and SheetsLLM translates the instruction into a validated DuckDB SQL query, executes it against your data, and shows a live preview with full step-by-step history, undo, and revert.

**Live app:** [sheets-llm.vercel.app](https://sheets-llm.vercel.app) · **API:** [sheetsllm.onrender.com](https://sheetsllm.onrender.com)

## Design principles

- **SQL, not generated code.** The LLM emits a single `SELECT` statement that is validated against a strict allowlist before execution. Arbitrary code never runs; mutating statements, statement chaining, and DuckDB's file/external-access functions are all rejected.
- **Immutable source data.** Uploads are converted once to Parquet and never modified. Each transformation is stored as a SQL step and replayed as a CTE chain, so undo, reset, and revert are metadata operations.
- **Persistent and multi-user.** Supabase provides Postgres (metadata), object storage (Parquet), and JWT authentication. Files survive restarts and are isolated per user.
- **Provider-agnostic LLM layer.** OpenAI and Google Gemini sit behind a single adapter; switching providers is one environment variable.

## Features

| Area | Capabilities |
| --- | --- |
| Upload | CSV, XLSX/XLS (multi-sheet with selector), TSV, JSON/JSONL, Parquet. Magic-byte validation, VBA-macro rejection, column sanitization, row/column caps |
| Transform | Natural language to validated DuckDB SQL: filter, sort, select, rename, computed columns, aggregation, deduplication, null handling, pivots |
| Chat (SAGE) | Conversational assistant with three response modes: transform (runs SQL), insight (answers questions about the data), clarification (asks back when ambiguous) |
| Insights | Automatic data-quality report: null percentages, duplicate rows, numeric statistics, one-click fix suggestions |
| Charts | Built-in bar, line, and pie builder with aggregation modes and PNG export |
| History | Every step recorded with its SQL; undo, reset, revert to any step; per-file audit log |
| Files | Dashboard with rename, duplicate, delete, download (CSV/TSV/JSON/Parquet), search and sort |
| Scale | Transforms on files above 100k rows run as background jobs with progress polling |

## Architecture

```
Browser
  │
  ▼
Next.js 14 (Vercel)
  pages: / · /auth · /dashboard · /workspace
  app/api/* route handlers — server-side proxies that forward the Supabase JWT
  │
  ▼
FastAPI (Render)
  middleware: CORS → security headers → per-route timeouts → request id → JWT auth
  LLM adapter (OpenAI | Gemini) → SQL validator → DuckDB engine
  caches: generated SQL (24 h) · local Parquet copies (30 min)
  │
  ├── Supabase Postgres   files · transformations · audit_log · chat_messages
  └── Supabase Storage    {user_id}/{file_id}/original.parquet
```

### Transformation model

1. Upload converts the file once to Parquet (ZSTD). The object is never modified afterwards.
2. Each instruction produces one SQL step (`SELECT ... FROM data`), stored with a step number.
3. Reads replay the stack as a CTE chain:

```sql
WITH step_1 AS (SELECT * FROM data WHERE age > 28),
     step_2 AS (SELECT name, age, city FROM step_1 ORDER BY age DESC)
SELECT * FROM step_2
```

4. Undo deletes the last step, reset deletes all steps, revert deletes everything after step N. The chain is then replayed.

### SQL safety pipeline

```
instruction → LLM (temperature 0)
  → strip code fences and semicolons
  → must start with SELECT or WITH
  → keyword denylist (DROP, INSERT, COPY, ATTACH, PRAGMA, ...)
  → function denylist (read_*, *_scan, glob, sniff_csv)
  → no statement chaining
  → DuckDB EXPLAIN dry run
  → execute (thread-pool timeout, memory-capped connection)
  → on error: one LLM retry with the DuckDB error as context
```

## Technology

**Frontend** — Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Framer Motion, TanStack Virtual, Supabase JS.

**Backend** — FastAPI on Python 3.12, DuckDB, PyArrow, Supabase (Postgres, Storage, Auth), httpx.

**LLM** — OpenAI or Google Gemini, selected via `LLM_PROVIDER`.

## Getting started

### Prerequisites

- Python 3.12 (easiest via [uv](https://docs.astral.sh/uv/))
- Node.js 18+
- A Supabase project (free tier is sufficient)
- An OpenAI or Gemini API key

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run `backend/migrations/001_create_tables.sql` in the SQL editor.
3. Create a private storage bucket named `sheetsllm-files`.
4. Note the project URL, anon key, and service_role key (Project Settings → API).

### 2. Backend

```bash
cd backend
uv venv --python 3.12 .venv
uv pip install -r requirements.txt --python .venv/Scripts/python.exe   # Windows
# uv pip install -r requirements.txt --python .venv/bin/python        # macOS/Linux
```

Create `backend/.env`:

```bash
# LLM
LLM_PROVIDER=gemini                 # "openai" or "gemini"
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash

# Supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>
SUPABASE_ANON_KEY=<anon key>
SUPABASE_BUCKET=sheetsllm-files

# Auth: keep unset (or false) in production. When true, requests that fail
# JWT verification proceed as the shared "anonymous" user (local dev only).
ALLOW_ANONYMOUS=true

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

Run:

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

Open http://localhost:3000, create an account at `/auth`, upload a file, and run an instruction.

### Docker

```bash
docker compose up --build
```

Starts the backend (port 8000) and frontend (port 3000); the frontend waits for the backend health check.

## Deployment

Production runs the frontend on Vercel and the backend on Render, connected to Supabase.

| Component | Platform | Required environment variables |
| --- | --- | --- |
| Frontend | Vercel (root directory `frontend`) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `BACKEND_URL` |
| Backend | Render (Python web service) | `LLM_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ALLOWED_ORIGINS` |

`NEXT_PUBLIC_*` values are inlined at build time — redeploy the frontend after changing them. Do not set `ALLOW_ANONYMOUS` in production; without it, unauthenticated requests receive 401.

### CI/CD

Two GitHub Actions workflows:

- **AI Code Review** (`pr-review.yml`) — reviews every pull request for security, correctness, and quality issues and posts findings with suggested fixes as a single PR comment. Advisory; does not block merges. Requires the `GEMINI_API_KEY` repository secret.
- **Deploy** (`deploy.yml`) — manual deploys from the Actions tab. Select a branch, choose the target (`both`, `frontend`, `backend`) and Vercel environment (`production`, `preview`), and run. Requires `RENDER_DEPLOY_HOOK_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` repository secrets.

The `main` branch is protected: changes land through pull requests, force pushes and deletion are blocked.

## API reference

All routes except `/health` require `Authorization: Bearer <supabase-jwt>`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness and active LLM provider/model |
| POST | `/upload` | Raw bytes with `X-Filename` header (`?sheet_name=` for multi-sheet XLSX); returns file id, schema, preview, insights |
| GET | `/files` | Paginated file list |
| GET | `/files/{id}` | File metadata and transformation steps |
| PATCH | `/files/{id}` | Rename |
| DELETE | `/files/{id}` | Delete file, storage object, and steps |
| POST | `/files/{id}/duplicate` | Copy file (storage and metadata) |
| GET | `/files/{id}/history` | Transformation steps |
| POST | `/files/{id}/revert/{step}` | Revert to step N and replay |
| POST | `/transform` | `{file_id, instruction}`; returns SQL and preview, a job id for large files, or a clarification |
| POST | `/chat` | `{file_id, message}`; returns transform, insight, or clarification |
| GET | `/chat/{id}` | Chat history |
| GET | `/insights/{id}` | Data-quality insights reflecting applied steps |
| GET | `/jobs/{id}` | Background job status, progress, result |
| POST | `/undo` | Remove the last step and replay |
| POST | `/reset` | Remove all steps |
| GET | `/download?file_id=&format=` | Export result as csv, tsv, json, or parquet |
| GET | `/audit/{id}` | Paginated audit trail |

The Next.js `app/api/*` routes are same-origin proxies that forward the Supabase session token to the backend.

## Security model

- SELECT-only SQL: keyword and function denylists, no statement chaining, EXPLAIN dry run; DuckDB runs in memory with thread and memory caps and a query timeout.
- Supabase JWTs verified server-side on every request; the `ALLOW_ANONYMOUS` development fallback is off by default.
- Tenancy: every database query filters by `user_id`; storage keys are namespaced `{user_id}/{file_id}/`.
- Uploads: magic-byte checks, macro-enabled workbook rejection, column-name sanitization, size and column caps.
- Abuse controls: per-user sliding-window rate limit on LLM-backed endpoints; standard security headers on all responses.

Known gaps, tracked for follow-up: no Postgres row-level security yet (isolation is application-level); no automated test suite.

## Project structure

```
backend/
  app/
    main.py            FastAPI app and middleware stack
    config.py          environment-driven configuration
    auth.py            Supabase JWT verification
    engine.py          DuckDB: execution, CTE replay, schema, conversion
    sql_validator.py   SELECT-only enforcement
    db.py              Supabase Postgres CRUD
    storage.py         Supabase Storage (Parquet objects)
    cache.py           SQL cache (24 h) and local Parquet cache (30 min)
    security.py        file validation, rate limiting, sanitization
    insights.py        data-quality analysis
    jobs.py            in-memory background job store
    llm/               provider adapter, OpenAI/Gemini clients, prompts
    routes/            one module per endpoint group
  migrations/001_create_tables.sql

frontend/
  app/                 pages: /, /auth, /dashboard, /workspace
    api/               proxy route handlers
  components/          DataGrid, ChatPanel, ChartPanel, InsightsCard, ...
  contexts/            AuthContext
  lib/                 Supabase client, authenticated fetch, helpers

.github/workflows/     pr-review.yml, deploy.yml
docker-compose.yml
```

## Roadmap

- Postgres row-level security policies (defense in depth for tenancy)
- Automated tests, starting with the SQL validator and CTE replay
- Multi-file joins, saved transformation templates, scheduled transforms
- Rename the legacy `r2_key` column (storage moved from Cloudflare R2 to Supabase)

## Contact

Questions or feedback: pranjalprateek9@gmail.com, or open an issue.
