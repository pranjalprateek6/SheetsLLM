"""Stripe billing — checkout, customer portal, webhook handling.

Tier is stored in the subscriptions table and read by usage enforcement; the
webhook is the single source that keeps it in sync with Stripe. All Stripe SDK
calls are wrapped so a missing/invalid config surfaces as BillingError rather
than a 500 with a stack trace.
"""

from __future__ import annotations

import logging

from app.config import (
    BILLING_CANCEL_URL,
    BILLING_PORTAL_RETURN_URL,
    BILLING_SUCCESS_URL,
    STRIPE_PRICE_ID,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
)
from app import db

logger = logging.getLogger("sheetsllm.billing")


class BillingError(Exception):
    """Raised for any billing operation that cannot proceed."""


def _stripe():
    if not STRIPE_SECRET_KEY:
        raise BillingError("Billing is not configured")
    import stripe

    stripe.api_key = STRIPE_SECRET_KEY
    return stripe


def is_configured() -> bool:
    return bool(STRIPE_SECRET_KEY and STRIPE_PRICE_ID)


def _ensure_customer(stripe, user_id: str, email: str | None) -> str:
    """Return the Stripe customer id for a user, creating and persisting it once."""
    sub = db.get_subscription(user_id)
    if sub and sub.get("stripe_customer_id"):
        return sub["stripe_customer_id"]

    customer = stripe.Customer.create(
        email=email or None,
        metadata={"user_id": user_id},
    )
    db.upsert_subscription(user_id, stripe_customer_id=customer.id)
    return customer.id


def create_checkout_session(user_id: str, email: str | None) -> str:
    """Create a Stripe Checkout session for the Pro plan; return its URL."""
    if not is_configured():
        raise BillingError("Billing is not configured")
    stripe = _stripe()
    customer_id = _ensure_customer(stripe, user_id, email)

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": STRIPE_PRICE_ID, "quantity": 1}],
        success_url=BILLING_SUCCESS_URL,
        cancel_url=BILLING_CANCEL_URL,
        client_reference_id=user_id,
        metadata={"user_id": user_id},
        allow_promotion_codes=True,
    )
    return session.url


def create_portal_session(user_id: str) -> str:
    """Create a Stripe Billing Portal session; return its URL."""
    stripe = _stripe()
    sub = db.get_subscription(user_id)
    if not sub or not sub.get("stripe_customer_id"):
        raise BillingError("No billing account for this user")

    session = stripe.billing_portal.Session.create(
        customer=sub["stripe_customer_id"],
        return_url=BILLING_PORTAL_RETURN_URL,
    )
    return session.url


def verify_webhook(payload: bytes, signature: str):
    """Verify and parse a Stripe webhook event."""
    if not STRIPE_WEBHOOK_SECRET:
        raise BillingError("Webhook secret not configured")
    stripe = _stripe()
    try:
        return stripe.Webhook.construct_event(
            payload, signature, STRIPE_WEBHOOK_SECRET
        )
    except Exception as exc:  # SignatureVerificationError, ValueError
        raise BillingError(f"Invalid webhook signature: {exc}") from exc


# Stripe subscription statuses that grant the paid tier.
_ACTIVE_STATUSES = {"active", "trialing", "past_due"}


def _sync_from_subscription(stripe, subscription_id: str, customer_id: str) -> None:
    """Fetch a subscription from Stripe and write the derived tier locally."""
    sub = stripe.Subscription.retrieve(subscription_id)
    status = sub.get("status")
    tier = "pro" if status in _ACTIVE_STATUSES else "free"
    period_end = sub.get("current_period_end")

    row = db.get_subscription_by_customer(customer_id)
    user_id = row.get("user_id") if row else None
    if not user_id:
        logger.warning("webhook: no local user for customer %s", customer_id)
        return

    import datetime as _dt

    db.upsert_subscription(
        user_id,
        stripe_subscription_id=subscription_id,
        tier=tier,
        status=status,
        current_period_end=(
            _dt.datetime.fromtimestamp(period_end, _dt.timezone.utc).isoformat()
            if period_end else None
        ),
    )
    logger.info("billing: user %s -> tier=%s status=%s", user_id, tier, status)


def handle_event(event) -> None:
    """Apply a verified Stripe event to local subscription state."""
    stripe = _stripe()
    etype = event["type"]
    obj = event["data"]["object"]

    if etype == "checkout.session.completed":
        customer_id = obj.get("customer")
        subscription_id = obj.get("subscription")
        # Bind customer -> user if this is the first time we see them
        user_id = obj.get("client_reference_id") or (obj.get("metadata") or {}).get("user_id")
        if user_id and customer_id:
            db.upsert_subscription(user_id, stripe_customer_id=customer_id)
        if subscription_id and customer_id:
            _sync_from_subscription(stripe, subscription_id, customer_id)

    elif etype in ("customer.subscription.updated", "customer.subscription.created"):
        _sync_from_subscription(stripe, obj["id"], obj["customer"])

    elif etype == "customer.subscription.deleted":
        row = db.get_subscription_by_customer(obj["customer"])
        if row:
            db.upsert_subscription(
                row["user_id"], tier="free", status="canceled",
                stripe_subscription_id=None,
            )
            logger.info("billing: user %s downgraded to free", row["user_id"])

    else:
        logger.debug("billing: ignoring event type %s", etype)
