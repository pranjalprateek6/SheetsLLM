"""Tests for usage metering: pure limit logic, month key, fail-open behavior."""

import datetime as dt

import pytest

from app import usage
from app.usage import UsageLimitExceeded, check_limit, month_key


# ── month_key ─────────────────────────────────────────────────────────

def test_month_key_first_of_month_utc():
    now = dt.datetime(2026, 7, 31, 23, 59, tzinfo=dt.timezone.utc)
    assert month_key(now) == "2026-07-01"


# ── check_limit (pure logic) ─────────────────────────────────────────

def test_under_limit_passes():
    check_limit({"transforms": 5}, "free", "transforms")  # no raise


def test_at_limit_blocks():
    limit = usage.TIER_LIMITS["free"]["transforms"]
    with pytest.raises(UsageLimitExceeded) as exc:
        check_limit({"transforms": limit}, "free", "transforms")
    assert exc.value.used == limit
    assert exc.value.limit == limit
    assert "limit reached" in str(exc.value)


def test_over_limit_blocks():
    limit = usage.TIER_LIMITS["free"]["uploads"]
    with pytest.raises(UsageLimitExceeded):
        check_limit({"uploads": limit + 10}, "free", "uploads")


def test_fresh_month_none_row_passes():
    check_limit(None, "free", "transforms")  # no raise


def test_unknown_tier_falls_back_to_free():
    limit = usage.TIER_LIMITS["free"]["transforms"]
    with pytest.raises(UsageLimitExceeded):
        check_limit({"transforms": limit}, "nonexistent-tier", "transforms")


def test_zero_limit_means_unlimited(monkeypatch):
    monkeypatch.setitem(usage.TIER_LIMITS, "free", {"transforms": 0})
    check_limit({"transforms": 10_000_000}, "free", "transforms")  # no raise


def test_unknown_action_passes():
    check_limit({"transforms": 999999}, "free", "not-a-counter")  # no raise


# ── enforce / record fail-open on metering errors ─────────────────────

def test_enforce_fails_open_when_db_unavailable(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("db down")
    monkeypatch.setattr(usage.db, "get_usage", boom)
    usage.enforce("user-x", "transforms")  # no raise — data path unaffected


def test_enforce_raises_when_over_cap(monkeypatch):
    limit = usage.TIER_LIMITS["free"]["transforms"]
    monkeypatch.setattr(
        usage.db, "get_usage", lambda *a, **k: {"transforms": limit}
    )
    with pytest.raises(UsageLimitExceeded):
        usage.enforce("user-x", "transforms")


def test_record_never_raises(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("db down")
    monkeypatch.setattr(usage.db, "increment_usage", boom)
    usage.record("user-x", transforms=1)  # swallowed, logged


def test_summary_shape(monkeypatch):
    monkeypatch.setattr(
        usage.db, "get_usage",
        lambda *a, **k: {"uploads": 2, "transforms": 7, "chat_requests": 1, "rows_processed": 123},
    )
    s = usage.summary("user-x")
    assert s["tier"] == "free"
    assert s["used"]["transforms"] == 7
    assert set(s["limits"]) == {"uploads", "transforms", "chat_requests"}
    assert s["month"].endswith("-01")


# ── recipe_applies in the summary (dashboard insight) ─────────────────

def test_summary_includes_recipe_applies(monkeypatch):
    from app import usage

    monkeypatch.setattr(usage.db, "get_subscription", lambda uid: None)
    monkeypatch.setattr(usage.db, "get_usage", lambda uid, month: {"uploads": 1})
    captured = {}

    def _count(user_id, action, since_iso):
        captured.update(user=user_id, action=action, since=since_iso)
        return 3

    monkeypatch.setattr(usage.db, "count_audit_actions", _count)
    s = usage.summary("u1")
    assert s["recipe_applies"] == 3
    assert captured["action"] == "recipe_apply"
    assert captured["since"].endswith("T00:00:00Z")


def test_summary_recipe_applies_fails_open(monkeypatch):
    from app import usage

    monkeypatch.setattr(usage.db, "get_subscription", lambda uid: None)
    monkeypatch.setattr(usage.db, "get_usage", lambda uid, month: None)

    def _boom(*a, **kw):
        raise RuntimeError("db down")

    monkeypatch.setattr(usage.db, "count_audit_actions", _boom)
    s = usage.summary("u1")
    assert s["recipe_applies"] == 0
