"""A recipe's live link: the latest file it cleaned, as CSV, for anyone
with the link, so a Google Sheet (=IMPORTDATA) or an Excel query (From Web)
stays current with every run, including scheduled ones.

GET    /recipes/{id}/live-link   the link, or null when there is none
POST   /recipes/{id}/live-link   make one (a new one replaces the old)
DELETE /recipes/{id}/live-link   turn it off
GET    /live/{token}             the CSV (public)

The token is signed (app/share.py) and names the recipe, its owner and a
key kept on the recipe (migration 020). Clearing or replacing the key ends
every link made with it, so a link can always be taken back.
"""
from __future__ import annotations

import json
import logging
import secrets

from fastapi import APIRouter, Request, Response

from app import db, events, lookups
from app.config import PUBLIC_APP_URL
from app.security import RateLimitExceeded, check_rate_limit
from app.share import make_token, read_token

logger = logging.getLogger("sheetsllm.routes.live_links")

router = APIRouter()

# Long enough never to matter; the key on the recipe is what ends a link
LIVE_TTL = 10 * 365 * 24 * 3600
_PREFIX = "o:"
# A sheet re-reads its import every hour or so; this leaves room for many
_RATE_MAX, _RATE_WINDOW = 60, 3600


def _json_response(status: int, code: str, message: str) -> Response:
    return Response(json.dumps({"code": code, "message": message}), status_code=status, media_type="application/json")


def _missing(exc: Exception) -> bool:
    return "live_key" in str(exc)


def link_for(recipe_id: str, user_id: str, key: str) -> str:
    token, _ = make_token(f"{_PREFIX}{recipe_id}:{key}", user_id, ttl=LIVE_TTL)
    return f"{PUBLIC_APP_URL}/api/live/{token}"


def read_live_token(token: str) -> tuple[str, str, str] | None:
    """(recipe_id, key, user_id) for an intact live-link token, else None."""
    ids = read_token(token)
    if not ids or not ids[0].startswith(_PREFIX):
        return None
    recipe_id, _, key = ids[0][len(_PREFIX):].partition(":")
    return (recipe_id, key, ids[1]) if recipe_id and key else None


@router.get("/recipes/{recipe_id}/live-link")
def get_live_link(request: Request, recipe_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")
    recipe = db.get_recipe(recipe_id, user_id)
    if not recipe:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    key = recipe.get("live_key")
    return {"recipe_id": recipe_id, "url": link_for(recipe_id, user_id, key) if key else None}


@router.post("/recipes/{recipe_id}/live-link")
def make_live_link(request: Request, recipe_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")
    if not db.get_recipe(recipe_id, user_id):
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    key = secrets.token_urlsafe(12)
    try:
        updated = db.update_recipe(recipe_id, user_id, live_key=key)
    except Exception as exc:
        if _missing(exc):
            return _json_response(503, "MIGRATION_REQUIRED", "Live links work once migration 020 is applied.")
        raise
    if not updated:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    events.record(user_id, "live_link_created", recipe_id=recipe_id)
    return {"recipe_id": recipe_id, "url": link_for(recipe_id, user_id, key)}


@router.delete("/recipes/{recipe_id}/live-link")
def stop_live_link(request: Request, recipe_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")
    try:
        updated = db.update_recipe(recipe_id, user_id, live_key=None)
    except Exception as exc:
        if _missing(exc):
            return {"recipe_id": recipe_id, "url": None}
        raise
    if not updated:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    return {"recipe_id": recipe_id, "url": None}


@router.get("/live/{token}")
def live(token: str):
    """The latest file the recipe cleaned, as CSV, read as its owner."""
    from app.routes.download import _stream_export

    try:
        check_rate_limit(f"live:{token[-24:]}", max_requests=_RATE_MAX, window=_RATE_WINDOW)
    except RateLimitExceeded as exc:
        return _json_response(429, "RATE_LIMITED", f"Too many reads of this link. Retry after {exc.retry_after:.0f}s")
    ids = read_live_token(token)
    gone = _json_response(404, "LINK_NOT_FOUND", "This link was turned off or never existed.")
    if not ids:
        return gone
    recipe_id, key, user_id = ids
    recipe = db.get_recipe(recipe_id, user_id)
    if not recipe or not recipe.get("live_key") or not secrets.compare_digest(str(recipe["live_key"]), key):
        return gone
    last = db.last_recipe_run(user_id, recipe_id)
    file_id = (last or {}).get("file_id")
    file_rec = db.get_file(file_id, user_id) if file_id else None
    if not file_rec:
        return _json_response(404, "NOT_RUN_YET", "This recipe hasn't cleaned a file yet. Run it once and the link fills in.")
    lookups.use(file_id, user_id)
    steps = db.get_transformations(file_id)
    return _stream_export(user_id, file_id, file_rec, steps, "csv", via="live_link")
