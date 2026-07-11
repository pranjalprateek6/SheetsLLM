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
MAX_INSTRUCTION_LENGTH: int = int(os.getenv("MAX_INSTRUCTION_LENGTH", "2000"))
MAX_COLUMNS: int = int(os.getenv("MAX_COLUMNS", "500"))

# ── DuckDB ───────────────────────────────────────────────────────────
DUCKDB_THREADS: int = int(os.getenv("DUCKDB_THREADS", "2"))
DUCKDB_MEMORY_LIMIT: str = os.getenv("DUCKDB_MEMORY_LIMIT", "512MB")
DUCKDB_QUERY_TIMEOUT: int = int(os.getenv("DUCKDB_QUERY_TIMEOUT", "30"))

# ── Usage limits (0 = unlimited) ────────────────────────────────────
# Free-tier caps act as a circuit breaker so one user cannot exhaust the
# shared LLM quota. Pro caps are generous headroom, not a real ceiling.
FREE_MAX_UPLOADS_PER_MONTH: int = int(os.getenv("FREE_MAX_UPLOADS_PER_MONTH", "50"))
FREE_MAX_TRANSFORMS_PER_MONTH: int = int(os.getenv("FREE_MAX_TRANSFORMS_PER_MONTH", "200"))
FREE_MAX_CHAT_PER_MONTH: int = int(os.getenv("FREE_MAX_CHAT_PER_MONTH", "200"))
PRO_MAX_UPLOADS_PER_MONTH: int = int(os.getenv("PRO_MAX_UPLOADS_PER_MONTH", "1000"))
PRO_MAX_TRANSFORMS_PER_MONTH: int = int(os.getenv("PRO_MAX_TRANSFORMS_PER_MONTH", "5000"))
PRO_MAX_CHAT_PER_MONTH: int = int(os.getenv("PRO_MAX_CHAT_PER_MONTH", "5000"))
# Total saved recipes (not monthly). 0 = unlimited. Recipes are the Pro hook.
FREE_MAX_RECIPES: int = int(os.getenv("FREE_MAX_RECIPES", "1"))
PRO_MAX_RECIPES: int = int(os.getenv("PRO_MAX_RECIPES", "0"))

# ── Razorpay billing ────────────────────────────────────────────────
RAZORPAY_KEY_ID: str = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET: str = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET: str = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
RAZORPAY_PLAN_ID: str = os.getenv("RAZORPAY_PLAN_ID", "")   # the Pro monthly plan
# Monthly-billed subscription total cycle count (Razorpay requires a bound;
# ~10 years, the customer can cancel any time).
RAZORPAY_TOTAL_COUNT: int = int(os.getenv("RAZORPAY_TOTAL_COUNT", "120"))

# ── Auth ─────────────────────────────────────────────────────────────
# When true, requests that fail JWT verification proceed as user "anonymous"
# (local dev convenience). Default false: unauthenticated requests get 401.
ALLOW_ANONYMOUS: bool = (
    os.getenv("ALLOW_ANONYMOUS", "false").strip().lower() in ("1", "true", "yes")
)

# ── CORS ─────────────────────────────────────────────────────────────
ALLOWED_ORIGINS: list[str] = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]
