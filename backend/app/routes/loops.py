"""Schedules, shared recipes, and the daily pass that runs scheduled recipes."""
from __future__ import annotations

import datetime as _dt
import json
import logging
import secrets

from fastapi import APIRouter, Header, Request, Response

from app import db, events, schedules
from app.config import CRON_SECRET
from app.share import make_token, read_token

logger = logging.getLogger("sheetsllm.routes.loops")
router = APIRouter()

RECIPE_SHARE_TTL = 90 * 24 * 3600


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    return Response(json.dumps({"code": code, "message": message, **extra}), status_code=status, media_type="application/json")


# ── Schedules ────────────────────────────────────────────────────────


@router.put("/recipes/{recipe_id}/schedule")
async def set_schedule(request: Request, recipe_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")
    recipe = db.get_recipe(recipe_id, user_id)
    if not recipe:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    try:
        body = await request.json()
        schedule = schedules.check_schedule(body)
    except schedules.ScheduleError as exc:
        return _json_response(400, exc.code, str(exc))
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")
    limit = schedules.limit_for(user_id)
    if limit and not recipe.get("schedule"):
        try:
            others = [r for r in db.list_scheduled_recipes(user_id) if r["id"] != recipe_id]
        except Exception:
            others = []
        if len(others) >= limit:
            events.record(user_id, "paywall_hit", action="schedules", limit=limit)
            return _json_response(
                402, "SCHEDULE_LIMIT_REACHED",
                f"The free plan runs {limit} recipe on a schedule. Upgrade to Pro to schedule more.",
            )
    try:
        db.update_recipe(recipe_id, user_id, schedule=schedule)
    except Exception as exc:
        logger.warning("schedule save failed: %s", exc)
        return _json_response(503, "SCHEDULES_UNAVAILABLE", "Schedules aren't ready on this server yet. Try again later.")
    events.record(user_id, "schedule_set", recipe_id=recipe_id, day=schedule["day"])
    return {"recipe_id": recipe_id, "schedule": schedule}


@router.delete("/recipes/{recipe_id}/schedule")
def clear_schedule(request: Request, recipe_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")
    if not db.get_recipe(recipe_id, user_id):
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    try:
        db.update_recipe(recipe_id, user_id, schedule=None)
    except Exception:
        return _json_response(503, "SCHEDULES_UNAVAILABLE", "Schedules aren't ready on this server yet.")
    return {"recipe_id": recipe_id, "schedule": None}


@router.post("/schedules/run")
async def schedules_run(x_cron_secret: str = Header(default="")):
    """Run today's scheduled recipes. Public path, gated by CRON_SECRET."""
    if not CRON_SECRET:
        return _json_response(503, "NOT_CONFIGURED", "CRON_SECRET is not set")
    if not secrets.compare_digest(x_cron_secret or "", CRON_SECRET):
        return _json_response(401, "UNAUTHORIZED", "Wrong or missing secret")
    return await schedules.run_due()


# ── Shared recipes ───────────────────────────────────────────────────


def _read_recipe_token(token: str) -> tuple[str, str] | None:
    ids = read_token(token)
    if not ids or not ids[0].startswith("r:"):
        return None
    return ids[0][2:], ids[1]


@router.post("/recipes/{recipe_id}/share")
def share_recipe(request: Request, recipe_id: str):
    """A link to the recipe's steps, for 90 days. Steps and column names
    only: nothing from any file."""
    user_id = getattr(request.state, "user_id", "anonymous")
    if not db.get_recipe(recipe_id, user_id):
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    token, expires = make_token(f"r:{recipe_id}", user_id, ttl=RECIPE_SHARE_TTL)
    events.record(user_id, "recipe_shared", recipe_id=recipe_id)
    return {
        "token": token,
        "expires_at": _dt.datetime.fromtimestamp(expires, _dt.timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def _public_recipe(recipe: dict) -> dict:
    return {
        "name": recipe.get("name"),
        "description": recipe.get("description"),
        "steps": [
            {"instruction": s.get("instruction"), "sql": s.get("sql_query")}
            for s in (recipe.get("steps") or []) if isinstance(s, dict)
        ],
        "required_columns": [
            c.get("name") for c in (recipe.get("required_columns") or []) if isinstance(c, dict) and c.get("name")
        ],
    }


@router.get("/shared-recipes/{token}")
def shared_recipe(token: str):
    ids = _read_recipe_token(token)
    recipe = db.get_recipe(ids[0], ids[1]) if ids else None
    if not recipe:
        return _json_response(404, "LINK_NOT_FOUND", "This link has expired or never existed.")
    return _public_recipe(recipe)


@router.post("/recipes/import")
async def import_recipe(request: Request):
    """Copy a shared recipe into this account. It counts like any recipe."""
    from app import onboarding, usage

    user_id = getattr(request.state, "user_id", "anonymous")
    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")
    ids = _read_recipe_token(str((body or {}).get("token") or ""))
    source = db.get_recipe(ids[0], ids[1]) if ids else None
    if not source:
        return _json_response(404, "LINK_NOT_FOUND", "This link has expired or never existed.")
    limit = usage.recipe_limit(user_id)
    if limit and len(onboarding.counted_recipes(db.list_recipes(user_id))) >= limit:
        events.record(user_id, "paywall_hit", action="recipes", limit=limit)
        return _json_response(402, "RECIPE_LIMIT_REACHED", f"The free plan includes {limit} saved recipes. Upgrade to Pro for unlimited recipes.")
    recipe = db.create_recipe(
        user_id=user_id,
        name=str(source.get("name") or "Shared recipe")[:120],
        description=source.get("description"),
        source_file_id=None,
        steps=source.get("steps") or [],
        required_columns=source.get("required_columns") or [],
    )
    events.record(user_id, "recipe_imported")
    return {"recipe_id": recipe["id"], "name": recipe.get("name")}
