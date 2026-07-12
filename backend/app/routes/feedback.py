"""POST /feedback — in-product feedback, stored as an analytics event.

Feedback rows live in the existing `events` table (event = "feedback"),
so there is no new migration and events.record's fail-open semantics
apply: a Supabase hiccup drops the row with a log line rather than
surfacing an error to someone who just tried to help.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Request, Response

from app import events
from app.security import RateLimitExceeded, check_rate_limit

logger = logging.getLogger("sheetsllm.routes.feedback")

router = APIRouter()

_MAX_MESSAGE = 2_000
_MAX_EMAIL = 200
_MAX_PATH = 300

# Generous for humans, tight for bots
_FEEDBACK_RATE_MAX = 5
_FEEDBACK_RATE_WINDOW = 3_600


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


@router.post("/feedback")
async def submit_feedback(request: Request):
    user_id = getattr(request.state, "user_id", "anonymous")

    try:
        check_rate_limit(
            f"{user_id}:feedback",
            max_requests=_FEEDBACK_RATE_MAX,
            window=_FEEDBACK_RATE_WINDOW,
        )
    except RateLimitExceeded:
        return _json_response(
            429, "RATE_LIMITED",
            "You've sent a lot of feedback recently. Thank you! Try again later.",
        )

    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")

    message = (body.get("message") or "").strip()
    if not message:
        return _json_response(400, "MISSING_MESSAGE", "message is required")
    if len(message) > _MAX_MESSAGE:
        return _json_response(
            400, "MESSAGE_TOO_LONG", f"message exceeds {_MAX_MESSAGE} characters"
        )

    email = (body.get("email") or "").strip()[:_MAX_EMAIL]
    path = (body.get("path") or "").strip()[:_MAX_PATH]
    # Signed-in users don't need to type their email
    auth_email = getattr(request.state, "email", "") or ""

    events.record(
        user_id, "feedback",
        message=message,
        email=email or auth_email,
        path=path,
    )
    logger.info("Feedback received from %s (%d chars)", user_id, len(message))
    return {"received": True}
