"""GET /health — the backend, the database and the AI provider, in one line."""

from __future__ import annotations

import time

from fastapi import APIRouter

from app.config import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    LLM_PROVIDER,
    OPENAI_API_KEY,
    OPENAI_MODEL,
)
from app.llm import health as llm_health

router = APIRouter()


def _probe_database() -> None:
    from app import db

    db.get_client().table("user_settings").select("user_id").limit(1).execute()


def _database_ok() -> tuple[bool, int | None]:
    """Whether one small read answers, and how long it took."""
    started = time.perf_counter()
    try:
        _probe_database()
    except Exception:
        return False, None
    return True, int((time.perf_counter() - started) * 1000)


@router.get("/health")
def health():
    if LLM_PROVIDER == "gemini":
        model, has_key = GEMINI_MODEL, bool(GEMINI_API_KEY)
    else:
        model, has_key = OPENAI_MODEL, bool(OPENAI_API_KEY)
    db_ok, db_ms = _database_ok()
    return {
        "ok": True,
        "provider": LLM_PROVIDER,
        "model": model,
        "has_key": has_key,
        "database": {"ok": db_ok, "ms": db_ms},
        "ai": llm_health.state(),
    }
