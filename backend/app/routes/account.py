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
