"""POST /reminders/run — the daily pass, called by the database's scheduler."""

from __future__ import annotations

import json
import logging
import secrets

from fastapi import APIRouter, Header, Response

from app.config import CRON_SECRET
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
    return run_daily()
