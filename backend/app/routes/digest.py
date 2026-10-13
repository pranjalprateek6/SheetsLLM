"""The weekly digest: run by cron with the secret, previewed by the owner."""
from __future__ import annotations

import json
import secrets

from fastapi import APIRouter, Header, Request, Response

from app import digest
from app.config import CRON_SECRET
from app.routes.admin import is_admin

router = APIRouter()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(json.dumps(payload), status_code=status, media_type="application/json")


@router.post("/admin/digest/run")
def digest_run(x_cron_secret: str = Header(default="")):
    """Mail the week's numbers to every owner address. Public path, gated
    by the CRON_SECRET header; without the secret configured it does nothing."""
    if not CRON_SECRET:
        return _json_response(503, "NOT_CONFIGURED", "CRON_SECRET is not set")
    if not secrets.compare_digest(x_cron_secret or "", CRON_SECRET):
        return _json_response(401, "UNAUTHORIZED", "Wrong or missing secret")
    return digest.run_weekly()


@router.get("/admin/digest")
def digest_preview(request: Request):
    """What this week's email would say, for the owner, without sending it."""
    if not is_admin(request):
        return _json_response(403, "FORBIDDEN", "This page is for the account owner.")
    try:
        subject, text, summary = digest.build()
    except Exception:
        return _json_response(503, "EVENTS_UNAVAILABLE", "The events table couldn't be read.")
    return {"subject": subject, "text": text, "summary": summary}
