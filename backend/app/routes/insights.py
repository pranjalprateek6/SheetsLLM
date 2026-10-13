"""GET /insights/{file_id} — Auto-generated data insights."""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time

from fastapi import APIRouter, Request, Response

from app import db
from app.cache import get_local_parquet
from app.insights import generate_insights

logger = logging.getLogger("sheetsllm.routes.insights")

router = APIRouter()

# The chat panel asks again after every step and on "Check again", and the
# answer only changes when the steps do. Kept a few minutes per file state.
_CACHE_SECONDS = 300
_CACHE_MAX = 200
_cache: dict[str, tuple[float, dict]] = {}
_cache_lock = threading.Lock()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


def _state_key(file_id: str, r2_key: str, steps: list[dict]) -> str:
    """One key per file state: the file and the SQL of every step so far."""
    chain = "\n".join(str(s.get("sql_query", "")) for s in steps)
    return f"{file_id}:{hashlib.sha256((r2_key + chain).encode('utf-8')).hexdigest()[:24]}"


def _cached(key: str) -> dict | None:
    with _cache_lock:
        hit = _cache.get(key)
        if hit and hit[0] > time.monotonic():
            return hit[1]
        _cache.pop(key, None)
        return None


def _remember(key: str, insights: dict) -> None:
    # Partial answers are not kept: the next ask may finish the probes
    if insights.get("partial"):
        return
    with _cache_lock:
        if len(_cache) >= _CACHE_MAX:
            oldest = min(_cache, key=lambda k: _cache[k][0])
            _cache.pop(oldest, None)
        _cache[key] = (time.monotonic() + _CACHE_SECONDS, insights)


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()


@router.get("/insights/{file_id}")
def get_insights(file_id: str, request: Request):
    """Get auto-generated insights for a file, as its steps have left it."""
    user_id = getattr(request.state, "user_id", "anonymous")

    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    r2_key = file_rec["r2_key"]
    steps = db.get_transformations(file_id)
    key = _state_key(file_id, r2_key, steps)
    insights = _cached(key)
    if insights is None:
        try:
            local_path = get_local_parquet(r2_key)
            insights = generate_insights(local_path, steps)
        except Exception as exc:
            logger.error("Insights failed: %s", exc)
            return _json_response(500, "INSIGHTS_FAILED", "Couldn't look over this file just now. Try again.")
        _remember(key, insights)

    return {"file_id": file_id, "insights": insights}
