"""GET /admin/metrics: the plan's decision numbers, for the owner only."""

from __future__ import annotations

import datetime as dt
import json
import logging

from fastapi import APIRouter, Request, Response

from app import db, metrics
from app.config import ADMIN_EMAILS

logger = logging.getLogger("sheetsllm.routes.admin")
router = APIRouter()

_EVENT_NAMES = [
    "chat_sent", "recipe_applied", "recipe_incompatible", "upload_completed",
    "op_applied", "insight_fix_applied", "recipe_saved", "export_completed",
    "llm_quota_hit", "usage_cap_hit", "waitlist_joined", "privacy_mode_changed",
]
_LIMIT = 20000


def is_admin(request: Request) -> bool:
    email = (getattr(request.state, "email", "") or "").strip().lower()
    return bool(email) and email in ADMIN_EMAILS


@router.get("/admin/metrics")
def admin_metrics(request: Request):
    if not is_admin(request):
        return Response(
            json.dumps({"code": "FORBIDDEN", "message": "This page is for the account owner."}),
            status_code=403, media_type="application/json",
        )
    now = dt.datetime.now(dt.timezone.utc)
    since = (now - dt.timedelta(days=60)).isoformat()
    try:
        rows = db.list_events(since, _EVENT_NAMES, limit=_LIMIT)
    except Exception as exc:
        logger.error("metrics: events unavailable: %s", exc)
        return Response(
            json.dumps({"code": "EVENTS_UNAVAILABLE", "message": "The events table couldn't be read."}),
            status_code=503, media_type="application/json",
        )
    try:
        recipes_saved = db.count_recipes()
    except Exception:
        recipes_saved = 0
    sample_ids = [
        str((r.get("properties") or {}).get("file_id")) for r in rows
        if r.get("event") == "upload_completed" and (r.get("properties") or {}).get("sample")
    ]
    try:
        sample_steps = db.step_counts(sample_ids)
    except Exception:
        sample_steps = {}

    counts: dict[str, int] = {}
    for r in rows:
        if metrics.event_time(r) >= now - dt.timedelta(days=30):
            counts[r["event"]] = counts.get(r["event"], 0) + 1
    return {
        "generated_at": now.isoformat(),
        "truncated": len(rows) >= _LIMIT,
        "privacy_watch": metrics.privacy_watch(rows, now),
        "gates": metrics.gates(rows, now, recipes_saved=recipes_saved, sample_step_counts=sample_steps),
        "counts_30d": dict(sorted(counts.items())),
    }
