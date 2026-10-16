"""POST /try/apply: the try page's one route, open to anyone.

Stateless (see app/try_demo.py). There is no account to meter, so three
bounds hold it: a per-visitor rate, a total rate, and a cap on runs at
once. Every browser request arrives through the Next.js proxy, so the
socket peer is always a proxy and the visitor comes from the address it
forwards. Someone calling the backend directly can forge that and dodge
the per-visitor rate, but not the total rate or the concurrency cap,
which are what protect the server. The funnel counts each visitor and
event once per window, so forged keys can only add so much to it.
"""
from __future__ import annotations

import asyncio
import json
import threading
import time

from fastapi import APIRouter, Request, Response

from app import events, try_demo
from app.security import RateLimitExceeded, check_rate_limit

router = APIRouter()

PER_VISITOR = 40  # a minute: a busy visitor clicks a fix every couple of seconds
IN_TOTAL = 600  # a minute, across every visitor
# What a request may say it is, for the funnel; anything else records nothing
FUNNEL = {"start": "try_started", "fix": "try_fix_applied", "replay": "try_replayed"}
# Runs at once: the rest are told to retry, not queued on the shared pool
MAX_RUNNING = 4
_running = asyncio.Semaphore(MAX_RUNNING)
# Each (visitor, event) is recorded at most once in this many seconds
FUNNEL_WINDOW = 600
_FUNNEL_MAX_KEYS = 5000
_funnel_seen: dict[tuple[str, str], float] = {}
_funnel_lock = threading.Lock()


def _first_in_window(visitor: str, event: str) -> bool:
    now = time.monotonic()
    with _funnel_lock:
        if len(_funnel_seen) >= _FUNNEL_MAX_KEYS:
            for key in [k for k, t in _funnel_seen.items() if now - t > FUNNEL_WINDOW]:
                del _funnel_seen[key]
            if len(_funnel_seen) >= _FUNNEL_MAX_KEYS:
                return False
        last = _funnel_seen.get((visitor, event))
        if last is not None and now - last < FUNNEL_WINDOW:
            return False
        _funnel_seen[(visitor, event)] = now
        return True


def _error(status: int, code: str, message: str, **extra) -> Response:
    return Response(json.dumps({"code": code, "message": message, **extra}), status_code=status, media_type="application/json")


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-client-ip") or request.headers.get("x-forwarded-for") or ""
    first = forwarded.split(",")[0].strip()
    return first[:64] or (request.client.host if request.client else None)


@router.post("/try/apply")
async def try_apply(request: Request):
    visitor = try_demo.visitor_key(_client_ip(request))
    try:
        check_rate_limit("try:all", max_requests=IN_TOTAL, window=60)
        check_rate_limit(visitor, max_requests=PER_VISITOR, window=60)
    except RateLimitExceeded as exc:
        return _error(429, "RATE_LIMITED", "That's a lot of clicks. Give it a few seconds.", retry_after=round(exc.retry_after))

    try:
        body = await request.json()
    except Exception:
        return _error(400, "INVALID_JSON", "Request body must be JSON")
    if not isinstance(body, dict):
        return _error(400, "INVALID_JSON", "Request body must be a JSON object")

    month = body.get("month", "oct")
    if _running.locked():
        return _error(503, "TRY_BUSY", "A lot of people are trying it right now. Give it a few seconds.", retry_after=3)
    async with _running:
        try:
            result = await asyncio.to_thread(try_demo.run, month, body.get("steps") or [])
        except try_demo.TryError as exc:
            return _error(exc.status, exc.code, str(exc))

    event = FUNNEL.get(body.get("event"))
    if event and _first_in_window(visitor, event):
        events.record(visitor, event, month=month, steps=len(result["steps"]))
    return result
