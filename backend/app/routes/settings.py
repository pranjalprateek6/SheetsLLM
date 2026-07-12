"""GET/PATCH /settings — per-user preferences (currently: privacy_mode)."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Request, Response

from app import db

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
    return {"privacy_mode": bool(row and row.get("privacy_mode"))}


@router.patch("/settings")
async def update_settings(request: Request):
    user_id = getattr(request.state, "user_id", "anonymous")

    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")

    if "privacy_mode" not in body:
        return _json_response(400, "NO_SETTINGS", "No recognized settings in body")
    privacy_mode = body["privacy_mode"]
    if not isinstance(privacy_mode, bool):
        return _json_response(400, "INVALID_VALUE", "privacy_mode must be a boolean")

    row = db.upsert_user_settings(user_id, privacy_mode=privacy_mode)
    logger.info("settings updated user=%s privacy_mode=%s", user_id, privacy_mode)
    return {"privacy_mode": bool(row.get("privacy_mode"))}
