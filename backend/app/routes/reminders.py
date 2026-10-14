"""POST /reminders/run — the daily pass, called by the database's scheduler."""

from __future__ import annotations

import json
import logging
import secrets

from fastapi import APIRouter, Header, Response

from app.config import CRON_SECRET
from app import db
from app.reminders import run_daily

logger = logging.getLogger("sheetsllm.routes.reminders")

router = APIRouter()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(json.dumps(payload), status_code=status, media_type="application/json")


@router.post("/reminders/run")
def reminders_run(x_cron_secret: str = Header(default="")):
    """Email every owner whose recipes are due. Public path, gated by the
    CRON_SECRET header; without the secret configured it does nothing."""
    if not CRON_SECRET:
        return _json_response(503, "NOT_CONFIGURED", "CRON_SECRET is not set")
    if not secrets.compare_digest(x_cron_secret or "", CRON_SECRET):
        return _json_response(401, "UNAUTHORIZED", "Wrong or missing secret")
    out = run_daily()
    from app import lifecycle

    try:
        out["lifecycle"] = lifecycle.run_daily()
    except Exception as exc:
        logger.warning("lifecycle pass failed: %s", exc)
    return out


@router.post("/reminders/unsubscribe")
def reminders_unsubscribe(t: str = ""):
    """Switch recipe reminders off for the user a token names. Public, so
    the link in the email and a mail client's one-click unsubscribe both
    work without a sign-in; the token is the proof."""
    from app import events
    from app.reminders import user_from_unsubscribe_token

    user_id = user_from_unsubscribe_token(t or "")
    if not user_id:
        return _json_response(400, "BAD_TOKEN", "This link is not valid.")
    try:
        db.upsert_user_settings(user_id, email_reminders=False)
    except Exception as exc:
        logger.warning("unsubscribe failed for %s: %s", user_id, exc)
        return _json_response(503, "SETTINGS_UNAVAILABLE", "Couldn't save that right now. Try the link again later.")
    events.record(user_id, "reminders_unsubscribed")
    return {"ok": True}
