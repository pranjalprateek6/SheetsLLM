"""Tests for billing/tier logic that does not require the Stripe API."""

import pytest

from app import billing, usage
from app.billing import BillingError


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
    """A pro user under the free cap but at no pro cap is not blocked."""
    free_transforms = usage.TIER_LIMITS["free"]["transforms"]
    monkeypatch.setattr(usage.db, "get_subscription", lambda uid: {"tier": "pro"})
    monkeypatch.setattr(usage.db, "get_usage", lambda *a, **k: {"transforms": free_transforms})
    usage.enforce("pro-user", "transforms")  # no raise — over free cap, under pro cap


# ── configuration guards ──────────────────────────────────────────────

def test_is_configured_false_without_keys(monkeypatch):
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "")
    monkeypatch.setattr(billing, "STRIPE_PRICE_ID", "")
    assert billing.is_configured() is False


def test_checkout_raises_when_unconfigured(monkeypatch):
    monkeypatch.setattr(billing, "STRIPE_SECRET_KEY", "")
    monkeypatch.setattr(billing, "STRIPE_PRICE_ID", "")
    with pytest.raises(BillingError):
        billing.create_checkout_session("u1", "u1@example.com")


def test_verify_webhook_requires_secret(monkeypatch):
    monkeypatch.setattr(billing, "STRIPE_WEBHOOK_SECRET", "")
    with pytest.raises(BillingError):
        billing.verify_webhook(b"{}", "sig")
