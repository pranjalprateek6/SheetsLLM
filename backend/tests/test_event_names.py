"""The event vocabulary the product plan measures by."""

import logging

from app import events

PLANNED = {
    # already in use
    "paywall_hit", "checkout_started", "subscription_activated", "feedback",
    # phases 1 to 6 of docs/PRODUCT-PLAN-2026-10.md
    "upload_completed", "insight_fix_applied", "op_applied", "chat_sent",
    "export_completed", "recipe_saved", "recipe_hint_shown", "recipe_hint_applied",
    "recipe_applied", "recipe_incompatible", "usage_cap_hit", "llm_quota_hit",
    "waitlist_joined", "privacy_mode_changed",
}


def test_every_planned_event_is_registered():
    missing = PLANNED - events.EVENTS
    assert not missing, f"not in events.EVENTS: {sorted(missing)}"


def test_event_names_are_identifiers():
    assert all(name.isidentifier() and name == name.lower() for name in events.EVENTS)


def test_unknown_name_is_recorded_but_warned(monkeypatch, caplog):
    captured = []
    monkeypatch.setattr(events.db, "insert_event", lambda uid, ev, props: captured.append(ev))
    with caplog.at_level(logging.WARNING, logger="sheetsllm.events"):
        events.record("u1", "typo_evnt")
    assert captured == ["typo_evnt"], "a typo must not lose the row"
    assert any("typo_evnt" in rec.message for rec in caplog.records)


def test_known_name_does_not_warn(monkeypatch, caplog):
    monkeypatch.setattr(events.db, "insert_event", lambda uid, ev, props: None)
    with caplog.at_level(logging.WARNING, logger="sheetsllm.events"):
        events.record("u1", "recipe_saved", source="export_strip")
    assert not caplog.records
