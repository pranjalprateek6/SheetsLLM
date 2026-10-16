"""POST /try/apply: the try page's one route, open to anyone.

Stateless (see app/try_demo.py). Rate-limited per visitor and in total,
since there is no account to meter: the visitor key comes from the address
the Next.js proxy forwards, and the total cap holds even when that is
forged by calling the backend directly.
"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Request, Response

from app import events, try_demo
from app.security import RateLimitExceeded, check_rate_limit

router = APIRouter()

PER_VISITOR = 40  # a minute: a busy visitor clicks a fix every couple of seconds
IN_TOTAL = 600  # a minute, across every visitor
# What a request may say it is, for the funnel; anything else records nothing
FUNNEL = {"start": "try_started", "fix": "try_fix_applied", "replay": "try_replayed"}


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
    try:
        result = await asyncio.to_thread(try_demo.run, month, body.get("steps") or [])
    except try_demo.TryError as exc:
        return _error(exc.status, exc.code, str(exc))

    event = FUNNEL.get(body.get("event"))
    if event:
        events.record(visitor, event, month=month, steps=len(result["steps"]))
    return result
