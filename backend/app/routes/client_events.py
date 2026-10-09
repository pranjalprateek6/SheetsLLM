"""POST /events: the few events only the browser can see.

Everything else is recorded where it happens, on the server. This route
exists for moments with no request behind them, like a hint being shown.
Names are an allow-list and properties are trimmed, so a client can never
write arbitrary rows into the events table.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Request, Response

from app import events

router = APIRouter()

# name → the property keys it may carry
CLIENT_EVENTS: dict[str, tuple[str, ...]] = {
    "recipe_hint_shown": ("recipe_id",),
}

_MAX_VALUE = 120


def _json_response(status: int, code: str, message: str) -> Response:
    return Response(json.dumps({"code": code, "message": message}), status_code=status, media_type="application/json")


def clean_properties(name: str, raw: object) -> dict:
    """Only the allowed keys, only short scalar values."""
    allowed = CLIENT_EVENTS.get(name, ())
    if not isinstance(raw, dict):
        return {}
    out: dict = {}
    for key in allowed:
        value = raw.get(key)
        if isinstance(value, bool) or value is None:
            continue
        if isinstance(value, (int, float)):
            out[key] = value
        elif isinstance(value, str):
            out[key] = value[:_MAX_VALUE]
    return out


@router.post("/events")
async def client_event(request: Request):
    user_id = getattr(request.state, "user_id", "anonymous")
    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")
    name = (body or {}).get("event") if isinstance(body, dict) else None
    if name not in CLIENT_EVENTS:
        return _json_response(400, "UNKNOWN_EVENT", "That event is not recorded from the browser.")
    if user_id == "anonymous":
        # Local dev and tests run anonymous; their clicks are not product data
        return {"recorded": False}
    events.record(user_id, name, **clean_properties(name, body.get("properties")))
    return {"recorded": True}
