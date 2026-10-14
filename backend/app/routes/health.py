"""GET /health — the backend, the database and the AI provider, in one line."""

from __future__ import annotations

import time

from fastapi import APIRouter

from app.config import GEMINI_MODEL, LLM_PROVIDER, OPENAI_MODEL
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


INCIDENT_EVENTS = {"llm_quota_hit": "quota", "llm_unavailable": "unavailable"}


def _recent_incidents(now) -> dict:
    """The last day's AI trouble from the events table, which survives the
    instance sleeping, unlike the in-memory state: how many times, and
    the latest. Empty when the table cannot be read."""
    import datetime as _dt

    from app import db, metrics

    try:
        rows = db.list_events((now - _dt.timedelta(hours=24)).isoformat(), list(INCIDENT_EVENTS), limit=500)
    except Exception:
        return {"count": 0, "last_at": None, "last_kind": None}
    # The anonymous account is local development and the end-to-end tests
    rows = [r for r in rows if r.get("user_id") != "anonymous"]
    if not rows:
        return {"count": 0, "last_at": None, "last_kind": None}
    last = max(rows, key=metrics.event_time)
    return {"count": len(rows), "last_at": metrics.event_time(last).isoformat(), "last_kind": INCIDENT_EVENTS.get(last.get("event"))}


@router.get("/health")
def health():
    import datetime as _dt

    model = GEMINI_MODEL if LLM_PROVIDER == "gemini" else OPENAI_MODEL
    db_ok, db_ms = _database_ok()
    now = _dt.datetime.now(_dt.timezone.utc)
    ai = llm_health.state(now)
    incidents = _recent_incidents(now) if db_ok else {"count": 0, "last_at": None, "last_kind": None}
    # A fresh instance remembers nothing; an incident in the last few minutes still counts
    if ai["ok"] and incidents["last_at"] and not ai["last_ok"]:
        at = _dt.datetime.fromisoformat(incidents["last_at"])
        if (now - at).total_seconds() <= llm_health.STALE_AFTER_SECONDS:
            ai = {**ai, "ok": False, "kind": incidents["last_kind"], "since": incidents["last_at"]}
    return {
        "ok": True,
        "model": model,
        "database": {"ok": db_ok, "ms": db_ms},
        "ai": {**ai, "incidents_24h": incidents["count"], "last_incident_at": incidents["last_at"]},
    }
