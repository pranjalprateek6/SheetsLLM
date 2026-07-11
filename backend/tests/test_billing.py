"""Tests for billing/tier logic that does not require the Razorpay API."""

import pytest

from app import billing, usage
from app.billing import BillingError, handle_event


# ── tier resolution → limits ──────────────────────────────────────────

def test_pro_tier_has_higher_limits_than_free():
    free = usage.TIER_LIMITS["free"]
    pro = usage.TIER_LIMITS["pro"]
    assert pro["transforms"] > free["transforms"]
    assert pro["uploads"] > free["uploads"]


def test_get_user_tier_reads_subscription(monkeypatch):
    monkeypatch.setattr(usage.db, "get_subscription", lambda uid: {"tier": "pro"})
    assert usage.get_user_tier("u1") == "pro"


def test_get_user_tier_unknown_tier_falls_back_to_free(monkeypatch):
    monkeypatch.setattr(usage.db, "get_subscription", lambda uid: {"tier": "enterprise"})
    assert usage.get_user_tier("u1") == "free"


def test_get_user_tier_no_row_is_free(monkeypatch):
    monkeypatch.setattr(usage.db, "get_subscription", lambda uid: None)
    assert usage.get_user_tier("u1") == "free"


def test_get_user_tier_fails_open_to_free(monkeypatch):
    def boom(uid):
        raise RuntimeError("db down")
    monkeypatch.setattr(usage.db, "get_subscription", boom)
    assert usage.get_user_tier("u1") == "free"


def test_pro_user_gets_pro_enforcement(monkeypatch):
    """A pro user over the free cap but under the pro cap is not blocked."""
    free_transforms = usage.TIER_LIMITS["free"]["transforms"]
    monkeypatch.setattr(usage.db, "get_subscription", lambda uid: {"tier": "pro"})
    monkeypatch.setattr(usage.db, "get_usage", lambda *a, **k: {"transforms": free_transforms})
    usage.enforce("pro-user", "transforms")  # no raise


# ── configuration guards ──────────────────────────────────────────────

def test_is_configured_false_without_keys(monkeypatch):
    monkeypatch.setattr(billing, "RAZORPAY_KEY_ID", "")
    monkeypatch.setattr(billing, "RAZORPAY_KEY_SECRET", "")
    monkeypatch.setattr(billing, "RAZORPAY_PLAN_ID", "")
    assert billing.is_configured() is False


def test_checkout_raises_when_unconfigured(monkeypatch):
    monkeypatch.setattr(billing, "RAZORPAY_KEY_ID", "")
    monkeypatch.setattr(billing, "RAZORPAY_KEY_SECRET", "")
    monkeypatch.setattr(billing, "RAZORPAY_PLAN_ID", "")
    with pytest.raises(BillingError):
        billing.create_checkout_session("u1", "u1@example.com")


def test_verify_webhook_requires_secret(monkeypatch):
    monkeypatch.setattr(billing, "RAZORPAY_WEBHOOK_SECRET", "")
    with pytest.raises(BillingError):
        billing.verify_webhook(b"{}", "sig")


# ── webhook event handling → local tier state ─────────────────────────

def _event(etype: str, status: str, *, user_id="u1", sub_id="sub_x", current_end=1893456000):
    return {
        "event": etype,
        "payload": {
            "subscription": {
                "entity": {
                    "id": sub_id,
                    "status": status,
                    "current_end": current_end,
                    "notes": {"user_id": user_id},
                }
            }
        },
    }


def test_activation_sets_pro(monkeypatch):
    captured = {}
    monkeypatch.setattr(billing.db, "upsert_subscription",
                        lambda uid, **f: captured.update({"uid": uid, **f}))
    handle_event(_event("subscription.activated", "active"))
    assert captured["uid"] == "u1"
    assert captured["tier"] == "pro"
    assert captured["current_period_end"].startswith("2030")  # 1893456000 -> 2030


def test_halted_sets_free(monkeypatch):
    captured = {}
    monkeypatch.setattr(billing.db, "upsert_subscription",
                        lambda uid, **f: captured.update(f))
    handle_event(_event("subscription.halted", "halted"))
    assert captured["tier"] == "free"


def test_cancelled_sets_free(monkeypatch):
    captured = {}
    monkeypatch.setattr(billing.db, "upsert_subscription",
                        lambda uid, **f: captured.update(f))
    handle_event(_event("subscription.cancelled", "cancelled"))
    assert captured["tier"] == "free"


def test_user_resolved_via_stored_id_when_notes_missing(monkeypatch):
    captured = {}
    ev = _event("subscription.charged", "active", sub_id="sub_y")
    ev["payload"]["subscription"]["entity"]["notes"] = {}  # no user_id in notes
    monkeypatch.setattr(billing.db, "get_subscription_by_provider_id",
                        lambda sid: {"user_id": "u-from-db"} if sid == "sub_y" else None)
    monkeypatch.setattr(billing.db, "upsert_subscription",
                        lambda uid, **f: captured.update({"uid": uid, **f}))
    handle_event(ev)
    assert captured["uid"] == "u-from-db"
    assert captured["tier"] == "pro"


def test_non_subscription_event_ignored(monkeypatch):
    called = []
    monkeypatch.setattr(billing.db, "upsert_subscription", lambda *a, **k: called.append(1))
    handle_event({"event": "payment.captured", "payload": {}})
    assert called == []
