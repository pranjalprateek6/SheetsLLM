"""GET/PATCH /settings — per-user preferences (currently: privacy_mode)."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Request, Response

from app import db, events

logger = logging.getLogger("sheetsllm.routes.settings")

router = APIRouter()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


@router.get("/settings")
def get_settings(request: Request):
    user_id = getattr(request.state, "user_id", "anonymous")
    row = db.get_user_settings(user_id)
    return {"privacy_mode": db.privacy_mode_from_row(row), "email_reminders": (row or {}).get("email_reminders") is not False}


@router.patch("/settings")
async def update_settings(request: Request):
    user_id = getattr(request.state, "user_id", "anonymous")

    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")

    changes = {k: body[k] for k in ("privacy_mode", "email_reminders") if k in body}
    if not changes:
        return _json_response(400, "NO_SETTINGS", "No recognized settings in body")
    for key, value in changes.items():
        if not isinstance(value, bool):
            return _json_response(400, "INVALID_VALUE", f"{key} must be a boolean")

    row = db.upsert_user_settings(user_id, **changes)
    logger.info("settings updated user=%s %s", user_id, changes)
    if "privacy_mode" in changes:
        events.record(user_id, "privacy_mode_changed", strict=changes["privacy_mode"])
    return {"privacy_mode": db.privacy_mode_from_row(row), "email_reminders": (row or {}).get("email_reminders") is not False}


@router.get("/onboarding")
def get_onboarding(request: Request):
    """The four first-loop milestones, read from the account."""
    from app import onboarding

    user_id = getattr(request.state, "user_id", "anonymous")
    return onboarding.milestones(user_id)
