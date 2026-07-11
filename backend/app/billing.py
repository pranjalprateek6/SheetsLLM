"""Razorpay billing — subscription checkout, cancel, webhook handling.

Tier is stored in the subscriptions table and read by usage enforcement; the
webhook is the single source that keeps it in sync with Razorpay. All SDK
calls are wrapped so a missing/invalid config surfaces as BillingError rather
than a 500 with a stack trace.

Razorpay differs from card-processor flows:
- Subscriptions are created server-side; the customer authorizes payment on a
  Razorpay-hosted `short_url` (returned by create). No return-URL round trip.
- There is no hosted customer portal; cancellation is an API call.
- Webhooks are authenticated with an HMAC-SHA256 signature over the raw body.
"""

from __future__ import annotations

import datetime as _dt
import logging

from app.config import (
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_PLAN_ID,
    RAZORPAY_TOTAL_COUNT,
    RAZORPAY_WEBHOOK_SECRET,
)
from app import db

logger = logging.getLogger("sheetsllm.billing")


class BillingError(Exception):
    """Raised for any billing operation that cannot proceed."""


def _client():
    if not (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
        raise BillingError("Billing is not configured")
    import razorpay

    return razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


def is_configured() -> bool:
    return bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET and RAZORPAY_PLAN_ID)


# Razorpay subscription statuses that grant the paid tier.
_ACTIVE_STATUSES = {"active", "authenticated", "charged", "resumed"}


def _period_end_iso(ts) -> str | None:
    if not ts:
        return None
    return _dt.datetime.fromtimestamp(int(ts), _dt.timezone.utc).isoformat()


def create_checkout_session(user_id: str, email: str | None) -> str:
    """Create a Razorpay subscription; return the hosted auth/payment URL."""
    if not is_configured():
        raise BillingError("Billing is not configured")
    client = _client()

    sub = client.subscription.create(
        {
            "plan_id": RAZORPAY_PLAN_ID,
            "total_count": RAZORPAY_TOTAL_COUNT,
            "customer_notify": 1,
            "notes": {"user_id": user_id, "email": email or ""},
        }
    )
    # Persist the pending subscription so the webhook can map it back to the
    # user even if the notes are absent.
    db.upsert_subscription(
        user_id,
        provider_subscription_id=sub["id"],
        status=sub.get("status"),
    )
    short_url = sub.get("short_url")
    if not short_url:
        raise BillingError("Razorpay did not return a checkout URL")
    return short_url


def cancel_subscription(user_id: str) -> dict:
    """Cancel at the end of the current cycle (user keeps Pro until then)."""
    client = _client()
    sub = db.get_subscription(user_id)
    sub_id = sub.get("provider_subscription_id") if sub else None
    if not sub_id:
        raise BillingError("No active subscription for this user")

    result = client.subscription.cancel(sub_id, {"cancel_at_cycle_end": 1})
    db.upsert_subscription(user_id, status=result.get("status"))
    return {"status": result.get("status"), "ends_at": _period_end_iso(result.get("current_end"))}


def verify_webhook(payload: bytes, signature: str) -> dict:
    """Verify a Razorpay webhook signature and return the parsed event."""
    if not RAZORPAY_WEBHOOK_SECRET:
        raise BillingError("Webhook secret not configured")
    client = _client()
    body = payload.decode("utf-8")
    try:
        client.utility.verify_webhook_signature(body, signature, RAZORPAY_WEBHOOK_SECRET)
    except Exception as exc:  # SignatureVerificationError
        raise BillingError(f"Invalid webhook signature: {exc}") from exc

    import json

    return json.loads(body)


def _entity(event: dict) -> dict | None:
    payload = event.get("payload") or {}
    sub = payload.get("subscription") or {}
    return sub.get("entity")


def handle_event(event: dict) -> None:
    """Apply a verified Razorpay event to local subscription state."""
    etype = event.get("event", "")
    if not etype.startswith("subscription."):
        logger.debug("billing: ignoring event %s", etype)
        return

    entity = _entity(event)
    if not entity:
        logger.warning("billing: %s had no subscription entity", etype)
        return

    sub_id = entity.get("id")
    status = entity.get("status")
    notes = entity.get("notes") or {}

    # Map subscription to a local user: notes first, then the stored id.
    user_id = notes.get("user_id")
    if not user_id and sub_id:
        row = db.get_subscription_by_provider_id(sub_id)
        user_id = row.get("user_id") if row else None
    if not user_id:
        logger.warning("billing: no local user for subscription %s", sub_id)
        return

    tier = "pro" if status in _ACTIVE_STATUSES else "free"
    db.upsert_subscription(
        user_id,
        provider_subscription_id=sub_id,
        tier=tier,
        status=status,
        current_period_end=_period_end_iso(entity.get("current_end")),
    )
    logger.info("billing: user %s -> tier=%s status=%s (%s)", user_id, tier, status, etype)
