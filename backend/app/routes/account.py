"""DELETE /account — remove the caller's account and everything in it."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Request, Response

from app import account, db, events
from app.billing import BillingError

logger = logging.getLogger("sheetsllm.routes.account")

router = APIRouter()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(json.dumps(payload), status_code=status, media_type="application/json")


@router.delete("/account")
async def delete_account(request: Request):
    user_id = getattr(request.state, "user_id", "anonymous")
    # The shared dev pseudo-user is not an account and holds nothing to delete
    if user_id == "anonymous":
        return _json_response(401, "UNAUTHORIZED", "Sign in to delete your account")

    try:
        await asyncio.to_thread(account.close_subscription, user_id)
    except BillingError as exc:
        logger.warning("account %s: subscription cancel failed: %s", user_id, exc)
        return _json_response(
            502, "SUBSCRIPTION_NOT_CANCELLED",
            "We couldn't cancel your Pro subscription, so nothing was deleted. "
            "Try again in a moment, or cancel the subscription first.",
        )

    try:
        counts = await asyncio.to_thread(account.erase_user_data, user_id)
    except Exception as exc:
        logger.error("account %s: erase failed: %s", user_id, exc)
        return _json_response(
            502, "DELETE_FAILED",
            "We couldn't delete everything. Nothing you can see has changed. Try again in a moment.",
        )

    try:
        await asyncio.to_thread(db.delete_auth_user, user_id)
    except Exception as exc:
        logger.error("account %s: auth user delete failed: %s", user_id, exc)
        return _json_response(
            502, "SIGN_IN_NOT_REMOVED",
            "Your files and data were deleted, but the sign-in itself could not be removed. "
            "Try again in a moment.",
        )

    # Recorded under a fixed pseudo-user: the user's own rows are gone
    events.record("deleted", "account_deleted", files=counts.get("files", 0), recipes=counts.get("recipes", 0))
    logger.info("account %s deleted", user_id)
    return {"deleted": True, **counts}


@router.get("/account/export")
def export_account(request: Request):
    """Everything the account holds that is not the files' bytes: the
    settings, the plan, every recipe with its steps, and every file with
    its size and its steps. The files themselves export from the app."""
    import datetime as _dt

    from app import billing

    user_id = getattr(request.state, "user_id", "anonymous")
    try:
        files = db.list_files(user_id, page=1, page_size=500).get("items", [])
    except Exception:
        return _json_response(503, "DB_UNAVAILABLE", "The database isn't answering right now. Try again in a minute.")
    out_files = []
    for f in files:
        try:
            steps = db.get_transformations(f["id"])
        except Exception:
            steps = []
        out_files.append({
            "id": f.get("id"), "name": f.get("name"), "created_at": f.get("created_at"),
            "rows": f.get("row_count"), "columns": f.get("column_count"),
            "columns_at_upload": [c.get("name") for c in ((f.get("schema_json") or {}).get("columns") or []) if isinstance(c, dict)],
            "steps": [{"step": s.get("step_number"), "instruction": s.get("instruction"), "sql": s.get("sql_query")} for s in steps],
        })
    recipes = []
    for r in db.list_recipes(user_id):
        recipes.append({
            "id": r.get("id"), "name": r.get("name"), "description": r.get("description"), "created_at": r.get("created_at"),
            "steps": [{"instruction": s.get("instruction"), "sql": s.get("sql_query")} for s in (r.get("steps") or []) if isinstance(s, dict)],
            "required_columns": [c.get("name") for c in (r.get("required_columns") or []) if isinstance(c, dict)],
        })
    try:
        settings = db.get_user_settings(user_id) or {}
    except Exception:
        settings = {}
    events.record(user_id, "account_exported")
    return {
        "exported_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "account": {"email": getattr(request.state, "email", "") or None},
        "plan": billing.state_for(user_id),
        "settings": {k: v for k, v in settings.items() if k in ("privacy_mode", "email_reminders")},
        "recipes": recipes,
        "files": out_files,
    }

