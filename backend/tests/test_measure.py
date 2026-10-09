"""Client events, the metrics behind the plan's decisions, and the admin route."""

from __future__ import annotations

import datetime as dt
import types

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import db, events, metrics
from app.main import app
from app.routes import admin as admin_route
from app.routes.client_events import clean_properties

NOW = dt.datetime(2026, 10, 9, 12, 0, tzinfo=dt.timezone.utc)


def ev(name: str, days_ago: float, user: str = "u1", **props) -> dict:
    return {
        "user_id": user, "event": name, "properties": props,
        "created_at": (NOW - dt.timedelta(days=days_ago)).isoformat(),
    }


# ── POST /events ─────────────────────────────────────────────────────


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    return TestClient(app, raise_server_exceptions=False)


def test_unknown_client_event_is_400(client):
    resp = client.post("/events", json={"event": "subscription_activated"})
    assert resp.status_code == 400 and resp.json()["code"] == "UNKNOWN_EVENT"


def test_anonymous_client_events_are_not_recorded(client, monkeypatch):
    got = []
    monkeypatch.setattr(events, "record", lambda *a, **k: got.append(a))
    assert client.post("/events", json={"event": "recipe_hint_shown"}).json() == {"recorded": False}
    assert got == []


def test_signed_in_client_event_is_recorded_with_clean_properties(monkeypatch):
    import asyncio
    from app.routes.client_events import client_event

    got = []
    monkeypatch.setattr(events, "record", lambda uid, name, **p: got.append((uid, name, p)))

    async def body():
        return {"event": "recipe_hint_shown", "properties": {"recipe_id": "r1", "evil": "x" * 9000}}

    req = types.SimpleNamespace(state=types.SimpleNamespace(user_id="u1"), json=body)
    assert asyncio.run(client_event(req)) == {"recorded": True}
    assert got == [("u1", "recipe_hint_shown", {"recipe_id": "r1"})]


def test_properties_are_trimmed_to_short_scalars():
    assert clean_properties("recipe_hint_shown", {"recipe_id": "r" * 500}) == {"recipe_id": "r" * 120}
    assert clean_properties("recipe_hint_shown", {"recipe_id": {"nested": 1}}) == {}
    assert clean_properties("recipe_hint_shown", "not a dict") == {}


# ── privacy watch ────────────────────────────────────────────────────


def test_privacy_watch_counts_kinds_per_day():
    rows = [
        ev("chat_sent", 0.1, kind="transform"), ev("chat_sent", 0.2, kind="error"),
        ev("chat_sent", 2, kind="transform"), ev("chat_sent", 40, kind="error"),  # outside 14 days
        ev("upload_completed", 0.1),
    ]
    w = metrics.privacy_watch(rows, NOW)
    assert len(w["days"]) == 14
    assert w["days"][-1] == {"date": "2026-10-09", "transform": 1, "insight": 0, "clarification": 0, "error": 1}
    assert w["total"] == 3 and w["error_rate"] == round(1 / 3, 4)


def test_privacy_watch_with_no_chat_has_no_rate():
    assert metrics.privacy_watch([], NOW)["error_rate"] is None


# ── gates ────────────────────────────────────────────────────────────


def gate(rows, key, **kw):
    kw.setdefault("recipes_saved", 0)
    kw.setdefault("sample_step_counts", {})
    return next(g for g in metrics.gates(rows, NOW, **kw) if g["key"] == key)


def test_column_mapping_goes_when_drift_passes_ten_percent():
    rows = [ev("recipe_applied", 1) for _ in range(20)] + [ev("recipe_incompatible", 1) for _ in range(3)]
    g = gate(rows, "column_mapping")
    assert (g["value"], g["status"]) == (0.15, "go")


def test_column_mapping_waits_below_ten_percent():
    rows = [ev("recipe_applied", 1) for _ in range(30)] + [ev("recipe_incompatible", 1)]
    assert gate(rows, "column_mapping")["status"] == "not_yet"


def test_a_gate_never_says_go_on_a_tiny_sample():
    rows = [ev("recipe_applied", 1), ev("recipe_incompatible", 1)]
    g = gate(rows, "column_mapping")
    assert g["value"] == 1.0 and g["status"] == "insufficient_data"


def test_return_rate_cohort():
    rows = [
        ev("upload_completed", 45, user="a"), ev("upload_completed", 30.5, user="a"),  # came back
        ev("upload_completed", 50, user="b"),                                          # did not
        ev("upload_completed", 10, user="c"),                                          # not in the cohort
    ]
    rate, cohort = metrics.return_rate(rows, NOW)
    assert (rate, cohort) == (0.5, 2)


def test_monthly_pull_needs_recipes_and_a_low_return_rate():
    rows = []
    for i in range(20):  # 20 users, 4 of whom came back: 20%
        rows.append(ev("upload_completed", 45, user=f"u{i}"))
        if i < 4:
            rows.append(ev("upload_completed", 40, user=f"u{i}"))
    assert gate(rows, "monthly_pull", recipes_saved=25)["status"] == "go"
    assert gate(rows, "monthly_pull", recipes_saved=5)["status"] == "not_yet"


def test_sample_wedge_counts_untouched_sample_files():
    rows = [ev("upload_completed", 1, file_id=f"f{i}", sample=True) for i in range(20)]
    rows += [ev("upload_completed", 1, file_id="mine", sample=False)]
    steps = {f"f{i}": (0 if i < 12 else 2) for i in range(20)}
    g = gate(rows, "sample_wedge", sample_step_counts=steps)
    assert (g["value"], g["sample"], g["status"]) == (0.6, 20, "go")


def test_fold_history_is_a_product_call():
    assert gate([], "fold_history")["status"] == "decide"


def test_strict_answers_by_insight_share():
    rows = [ev("chat_sent", 1, kind="insight") for _ in range(20)] + [ev("chat_sent", 1, kind="transform") for _ in range(30)]
    g = gate(rows, "strict_answers")
    assert (g["value"], g["status"]) == (0.4, "go")


# ── GET /admin/metrics ───────────────────────────────────────────────


def test_admin_metrics_is_owner_only(client):
    resp = client.get("/admin/metrics")
    assert resp.status_code == 403 and resp.json()["code"] == "FORBIDDEN"


def test_admin_metrics_for_the_owner(monkeypatch):
    monkeypatch.setattr(admin_route, "ADMIN_EMAILS", frozenset({"owner@example.com"}))
    monkeypatch.setattr(db, "list_events", lambda since, names, limit=0: [ev("chat_sent", 0.1, kind="error")])
    monkeypatch.setattr(db, "count_recipes", lambda: 3)
    monkeypatch.setattr(db, "step_counts", lambda ids: {})
    req = types.SimpleNamespace(state=types.SimpleNamespace(email="Owner@Example.com"))
    body = admin_route.admin_metrics(req)
    assert body["privacy_watch"]["totals"]["error"] == 1
    assert {g["key"] for g in body["gates"]} == {"column_mapping", "monthly_pull", "sample_wedge", "fold_history", "strict_answers"}
    assert body["truncated"] is False


def test_unset_admin_list_means_nobody(monkeypatch):
    monkeypatch.setattr(admin_route, "ADMIN_EMAILS", frozenset())
    req = types.SimpleNamespace(state=types.SimpleNamespace(email="owner@example.com"))
    assert admin_route.is_admin(req) is False
