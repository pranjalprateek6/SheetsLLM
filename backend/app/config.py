import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from backend/ directory reliably
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH)
load_dotenv()  # fallback to working-directory .env

# ── LLM ──────────────────────────────────────────────────────────────
LLM_PROVIDER: str = (os.getenv("LLM_PROVIDER") or "openai").strip().lower()
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-lite")

# ── Supabase ─────────────────────────────────────────────────────────
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")

# ── Storage ──────────────────────────────────────────────────────────
SUPABASE_BUCKET: str = os.getenv("SUPABASE_BUCKET", "sheetsllm-files")

# ── Limits ───────────────────────────────────────────────────────────
MAX_ROWS: int = int(os.getenv("MAX_ROWS", "1000000"))
MAX_PREVIEW_ROWS: int = int(os.getenv("MAX_PREVIEW_ROWS", "500"))
MAX_UPLOAD_MB: int = int(os.getenv("MAX_UPLOAD_MB", "400"))
UPLOAD_MAX_BYTES: int = MAX_UPLOAD_MB * 1024 * 1024
# A workbook costs far more to read than a CSV of the same size. Read a row
# at a time (engine._workbook_to_csv), a text-heavy sheet over a 100 MB idle
# server peaked at 243 MB for 12.4 MB of .xlsx, 279 MB for 24.7 MB (45 s) and
# 401 MB for 49.5 MB (88 s). 25 MB leaves room inside the 512 MB instance.
MAX_EXCEL_MB: int = int(os.getenv("MAX_EXCEL_MB", "25"))
EXCEL_MAX_BYTES: int = MAX_EXCEL_MB * 1024 * 1024
MAX_INSTRUCTION_LENGTH: int = int(os.getenv("MAX_INSTRUCTION_LENGTH", "2000"))
MAX_COLUMNS: int = int(os.getenv("MAX_COLUMNS", "500"))

# ── DuckDB ───────────────────────────────────────────────────────────
DUCKDB_THREADS: int = int(os.getenv("DUCKDB_THREADS", "2"))
# The limit bounds DuckDB's buffer pool only: a query also allocates outside
# it, and the server idles at about 100 MB. At 512MB (the whole instance) a
# 5M-row dedupe peaked at 630 MB and an export at 669 MB; at 200MB they spill
# to disk and peak at 321 and 347 MB, a few seconds slower.
DUCKDB_MEMORY_LIMIT: str = os.getenv("DUCKDB_MEMORY_LIMIT", "200MB")
# How much a query may spill to disk before it fails
DUCKDB_MAX_TEMP_SIZE: str = os.getenv("DUCKDB_MAX_TEMP_SIZE", "4GB")
# Queries running at once. Each may use its memory limit and more, so two
# heavy ones together would outgrow a 512 MB instance; the rest wait.
DUCKDB_QUERIES_AT_ONCE: int = int(os.getenv("DUCKDB_QUERIES_AT_ONCE", "1"))
# How long a query waits for its turn before saying the server is busy
DUCKDB_QUEUE_WAIT_SECONDS: int = int(os.getenv("DUCKDB_QUEUE_WAIT_SECONDS", "60"))
DUCKDB_QUERY_TIMEOUT: int = int(os.getenv("DUCKDB_QUERY_TIMEOUT", "30"))
# Materialize a chain checkpoint every N steps so replays stay bounded
# instead of re-running the whole chain from base (0 disables).
CHECKPOINT_EVERY_N_STEPS: int = int(os.getenv("CHECKPOINT_EVERY_N_STEPS", "10"))

# ── Admin ────────────────────────────────────────────────────────────
# Who may read /admin/metrics: comma-separated sign-in emails. Unset means
# nobody, so the numbers are never public by accident.
ADMIN_EMAILS: frozenset[str] = frozenset(
    e.strip().lower() for e in (os.getenv("ADMIN_EMAILS") or "").split(",") if e.strip()
)

# ── Privacy ──────────────────────────────────────────────────────────
# What a user who never chose a privacy mode gets. "strict" (the default)
# sends the LLM the schema only, which is what the landing page promises;
# "off" also sends sample values and rows. An explicit choice always wins.
PRIVACY_DEFAULT_STRICT: bool = (
    (os.getenv("PRIVACY_DEFAULT") or "strict").strip().lower() != "off"
)

# ── Usage limits (0 = unlimited) ────────────────────────────────────
# Free-tier caps act as a circuit breaker so one user cannot exhaust the
# shared LLM quota. Pro caps are generous headroom, not a real ceiling.
FREE_MAX_UPLOADS_PER_MONTH: int = int(os.getenv("FREE_MAX_UPLOADS_PER_MONTH", "50"))
FREE_MAX_CHAT_PER_MONTH: int = int(os.getenv("FREE_MAX_CHAT_PER_MONTH", "200"))
PRO_MAX_UPLOADS_PER_MONTH: int = int(os.getenv("PRO_MAX_UPLOADS_PER_MONTH", "1000"))
PRO_MAX_CHAT_PER_MONTH: int = int(os.getenv("PRO_MAX_CHAT_PER_MONTH", "5000"))
# Total saved recipes (not monthly). 0 = unlimited. Recipes are the Pro hook.
FREE_MAX_RECIPES: int = int(os.getenv("FREE_MAX_RECIPES", "3"))
PRO_MAX_RECIPES: int = int(os.getenv("PRO_MAX_RECIPES", "0"))

# ── Razorpay billing ────────────────────────────────────────────────
RAZORPAY_KEY_ID: str = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET: str = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET: str = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
RAZORPAY_PLAN_ID: str = os.getenv("RAZORPAY_PLAN_ID", "")   # the Pro monthly plan
# Monthly-billed subscription total cycle count (Razorpay requires a bound;
# ~10 years, the customer can cancel any time).
RAZORPAY_TOTAL_COUNT: int = int(os.getenv("RAZORPAY_TOTAL_COUNT", "120"))

# ── Environment ──────────────────────────────────────────────────────
# Render sets RENDER=true on every service; ENV=production works anywhere.
IS_PRODUCTION: bool = bool(os.getenv("RENDER")) or (
    os.getenv("ENV", "").strip().lower() == "production"
)

# ── Auth ─────────────────────────────────────────────────────────────
# When true, requests that fail JWT verification proceed as user "anonymous"
# (local dev convenience). Default false: unauthenticated requests get 401.
ALLOW_ANONYMOUS: bool = (
    os.getenv("ALLOW_ANONYMOUS", "false").strip().lower() in ("1", "true", "yes")
)

# Signs share links. Optional: without it one is derived from the service
# key, so links stay valid across restarts of the same deployment.
SHARE_SECRET: str = os.getenv("SHARE_SECRET", "")

# ── Reminders between months ─────────────────────────────────────────
# A recipe that has not run for this many days is due
REMINDER_DAYS: int = int(os.getenv("REMINDER_DAYS", "28"))
# The daily pass is called by the database's scheduler with this header
CRON_SECRET: str = os.getenv("CRON_SECRET", "")
# Email goes through Resend when both are set; otherwise reminders stay in-app
RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
REMINDER_FROM: str = os.getenv("REMINDER_FROM", "")
# Where the links in an email point
PUBLIC_APP_URL: str = os.getenv("PUBLIC_APP_URL", "https://sheets-llm.vercel.app").rstrip("/")

# ── CORS ─────────────────────────────────────────────────────────────
ALLOWED_ORIGINS: list[str] = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]
