"""Billing — Stripe checkout, customer portal, and webhook.

POST /billing/checkout   create a Checkout session, return its URL
POST /billing/portal     create a Customer Portal session, return its URL
POST /billing/webhook    Stripe webhook (signature-verified; public path)
GET  /billing/status     current tier + whether billing is configured
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Request, Response

from app import billing, db, usage
from app.billing import BillingError

logger = logging.getLogger("sheetsllm.routes.billing")

router = APIRouter()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


@router.get("/billing/status")
async def billing_status(request: Request):
    user_id = getattr(request.state, "user_id", "anonymous")
    return {
        "tier": usage.get_user_tier(user_id),
        "billing_configured": billing.is_configured(),
    }


@router.post("/billing/checkout")
async def checkout(request: Request):
    user_id = getattr(request.state, "user_id", "anonymous")
    email = getattr(request.state, "email", "") or None
    try:
        url = billing.create_checkout_session(user_id, email)
    except BillingError as exc:
        return _json_response(400, "BILLING_ERROR", str(exc))
    except Exception as exc:
        logger.error("checkout failed: %s", exc)
        return _json_response(502, "STRIPE_ERROR", "Could not start checkout")
    return {"url": url}


@router.post("/billing/portal")
async def portal(request: Request):
    user_id = getattr(request.state, "user_id", "anonymous")
    try:
        url = billing.create_portal_session(user_id)
    except BillingError as exc:
        return _json_response(400, "BILLING_ERROR", str(exc))
    except Exception as exc:
        logger.error("portal failed: %s", exc)
        return _json_response(502, "STRIPE_ERROR", "Could not open billing portal")
    return {"url": url}


@router.post("/billing/webhook")
async def webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        event = billing.verify_webhook(payload, signature)
    except BillingError as exc:
        logger.warning("webhook rejected: %s", exc)
        return _json_response(400, "INVALID_WEBHOOK", str(exc))

    try:
        billing.handle_event(event)
    except Exception as exc:
        # Return 500 so Stripe retries; the event was validly signed.
        logger.error("webhook handling failed for %s: %s", event.get("type"), exc)
        return _json_response(500, "WEBHOOK_HANDLING_FAILED", "Retry later")

    return {"received": True}
