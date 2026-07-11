"""Tests for funnel events: fail-open recording and activation semantics."""

from app import billing, events


# ── record() never raises ─────────────────────────────────────────────

def test_record_inserts_via_db(monkeypatch):
    captured = {}

    def fake_insert(user_id, event, properties):
        captured.update(user=user_id, event=event, props=properties)

    monkeypatch.setattr(events.db, "insert_event", fake_insert)
    events.record("u1", "paywall_hit", action="uploads", used=50, limit=50)
    assert captured == {
        "user": "u1",
        "event": "paywall_hit",
        "props": {"action": "uploads", "used": 50, "limit": 50},
    }


def test_record_fails_open_when_table_missing(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("relation events does not exist")

    monkeypatch.setattr(events.db, "insert_event", boom)
    events.record("u1", "checkout_started")  # must not raise


# ── subscription_activated fires only on the free -> pro transition ──

def _activation_event(status="active"):
    return {
        "event": "subscription.activated",
        "payload": {
            "subscription": {
                "entity": {
                    "id": "sub_1",
                    "status": status,
                    "notes": {"user_id": "u1"},
                    "current_end": None,
                }
            }
        },
    }


def test_webhook_records_activation_on_transition(monkeypatch):
    recorded = []
    monkeypatch.setattr(billing.db, "get_subscription", lambda uid: {"tier": "free"})
    monkeypatch.setattr(billing.db, "upsert_subscription", lambda uid, **f: {})
    monkeypatch.setattr(events, "record", lambda uid, ev, **p: recorded.append((uid, ev)))

    billing.handle_event(_activation_event())
    assert recorded == [("u1", "subscription_activated")]


def test_webhook_skips_activation_when_already_pro(monkeypatch):
    recorded = []
    monkeypatch.setattr(billing.db, "get_subscription", lambda uid: {"tier": "pro"})
    monkeypatch.setattr(billing.db, "upsert_subscription", lambda uid, **f: {})
    monkeypatch.setattr(events, "record", lambda uid, ev, **p: recorded.append((uid, ev)))

    billing.handle_event(_activation_event(status="charged"))
    assert recorded == []


def test_webhook_survives_event_lookup_failure(monkeypatch):
    def boom(uid):
        raise RuntimeError("db down")

    upserts = []
    monkeypatch.setattr(billing.db, "get_subscription", boom)
    monkeypatch.setattr(billing.db, "upsert_subscription", lambda uid, **f: upserts.append(uid))

    billing.handle_event(_activation_event())  # must not raise
    assert upserts == ["u1"]  # tier sync still happened