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
# A renewal that did not go through: "pending" while Razorpay retries the
# card, "halted" once it gives up. Pro stays on for a grace period past the
# paid-up date, so one failed card does not cut someone off mid-month.
_GRACE_STATUSES = {"pending", "halted"}
GRACE_DAYS = 7


def _period_end_iso(ts) -> str | None:
    if not ts:
        return None
    return _dt.datetime.fromtimestamp(int(ts), _dt.timezone.utc).isoformat()


def _parse_iso(value) -> _dt.datetime | None:
    if not value:
        return None
    try:
        t = _dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=_dt.timezone.utc)


def grace_until(period_end_iso: str | None) -> _dt.datetime | None:
    """When a failed renewal's grace period ends: GRACE_DAYS past the
    paid-up date. None when there is no paid-up date to count from."""
    end = _parse_iso(period_end_iso)
    return end + _dt.timedelta(days=GRACE_DAYS) if end else None


def tier_for(status: str | None, period_end_iso: str | None, *, now: _dt.datetime | None = None) -> str:
    """The tier a subscription status earns right now."""
    if status in _ACTIVE_STATUSES:
        return "pro"
    if status in _GRACE_STATUSES:
        until = grace_until(period_end_iso)
        now = now or _dt.datetime.now(_dt.timezone.utc)
        if until and now < until:
            return "pro"
    return "free"


def state_for(user_id: str) -> dict:
    """What the account and pricing pages show: the tier, the provider
    status, and when a grace period ends if one is running."""
    try:
        row = db.get_subscription(user_id) or {}
    except Exception:
        row = {}
    status = row.get("status")
    period_end = row.get("current_period_end")
    tier = tier_for(status, period_end)
    until = grace_until(period_end) if status in _GRACE_STATUSES else None
    return {
        "tier": tier,
        "status": status,
        "period_end": period_end,
        "grace_until": until.isoformat() if (until and tier == "pro") else None,
    }


def _payment_failed_text(until: _dt.datetime | None) -> tuple[str, str]:
    from app.config import PUBLIC_APP_URL

    keep = f"Pro stays on until {until.date().isoformat()}." if until else "Pro stays on for a few days."
    body = "\n".join([
        "Hi,",
        "",
        "Your SheetsLLM Pro renewal didn't go through. " + keep,
        "",
        "Razorpay will retry the card and has emailed you a link to pay. Once it goes through, nothing changes.",
        "If the card has expired, replace it from that email, or cancel and subscribe again from your account page.",
        "",
        f"Your account: {PUBLIC_APP_URL}/account",
        "",
        "SheetsLLM",
    ])
    return "Your SheetsLLM payment didn't go through", body


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


def cancel_subscription(user_id: str, *, at_cycle_end: bool = True) -> dict:
    """Cancel at the end of the current cycle (the user keeps Pro until then),
    or at once when ``at_cycle_end`` is False, as when the account is deleted."""
    client = _client()
    sub = db.get_subscription(user_id)
    sub_id = sub.get("provider_subscription_id") if sub else None
    if not sub_id:
        raise BillingError("No active subscription for this user")

    result = client.subscription.cancel(sub_id, {"cancel_at_cycle_end": 1 if at_cycle_end else 0})
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


def _notify_payment_failed(user_id: str, until: _dt.datetime | None) -> None:
    """One email when a renewal first fails. Never raises: the webhook's
    job is the state change, the mail is a courtesy."""
    from app import events, mail

    try:
        email = db.user_email(user_id)
        if not email:
            return
        subject, body = _payment_failed_text(until)
        if mail.send(email, subject, body):
            events.record(user_id, "payment_failed_notified")
    except Exception as exc:
        logger.warning("billing: could not notify %s of a failed payment: %s", user_id, exc)


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

    period_end = _period_end_iso(entity.get("current_end"))
    try:
        prior = db.get_subscription(user_id) or {}
    except Exception:
        prior = {}
    # A failed renewal carries no new period end; keep counting from the paid-up date
    if not period_end and status in _GRACE_STATUSES:
        period_end = prior.get("current_period_end")
    tier = tier_for(status, period_end)

    # Funnel event on the actual free -> pro transition only (webhooks for
    # renewals/charges keep tier=pro and must not double-count).
    try:
        if tier == "pro" and prior.get("tier") != "pro" and status in _ACTIVE_STATUSES:
            from app import events

            events.record(user_id, "subscription_activated", status=status)
    except Exception:
        pass  # analytics must never break webhook handling

    # The first time a renewal fails, say so, once
    if status in _GRACE_STATUSES and prior.get("status") not in _GRACE_STATUSES:
        _notify_payment_failed(user_id, grace_until(period_end))

    db.upsert_subscription(
        user_id,
        provider_subscription_id=sub_id,
        tier=tier,
        status=status,
        current_period_end=period_end,
    )
    logger.info("billing: user %s -> tier=%s status=%s (%s)", user_id, tier, status, etype)
