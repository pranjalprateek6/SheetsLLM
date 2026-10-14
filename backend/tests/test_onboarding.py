"""The first loop read from the account, and practice recipes that do not
take a slot."""
from __future__ import annotations

import datetime as dt

from fastapi.testclient import TestClient

import app.main as main_module
from app import db, digest, onboarding
from app.main import app


def test_milestones_come_from_the_events(monkeypatch):
    monkeypatch.setattr(db, "user_events", lambda uid, names, limit=2000: [
        {"event": "upload_completed", "properties": {}},
        {"event": "chat_sent", "properties": {"kind": "insight"}},
    ])
    assert onboarding.milestones("u1") == {"upload": True, "transform": False, "recipe": False, "rerun": False}
    monkeypatch.setattr(db, "user_events", lambda uid, names, limit=2000: [
        {"event": "upload_completed", "properties": {}},
        {"event": "chat_sent", "properties": {"kind": "transform"}},
        {"event": "recipe_saved", "properties": {}},
        {"event": "recipe_applied", "properties": {}},
    ])
    assert onboarding.milestones("u1") == {"upload": True, "transform": True, "recipe": True, "rerun": True}


def test_milestones_survive_an_unreadable_table(monkeypatch):
    monkeypatch.setattr(db, "user_events", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    assert onboarding.milestones("u1") == {"upload": False, "transform": False, "recipe": False, "rerun": False}


ORDERS_HEADER = ["Order ID", "Customer Email", "Region", "Order Date", "MRP", "Landing Cost", "Status"]


def _file(name, header, rows):
    return {"name": name, "row_count": rows, "schema_json": {"columns": [{"name": c} for c in header]}}


def test_only_one_recipe_from_a_real_sample_goes_uncounted(monkeypatch):
    recipes = [
        {"id": "r1", "source_file_id": "f1", "created_at": "2026-10-01"},
        {"id": "r2", "source_file_id": "f2", "created_at": "2026-10-02"},
        {"id": "r3", "source_file_id": "f3", "created_at": "2026-10-03"},
        {"id": "r4", "created_at": "2026-10-04"},
    ]
    monkeypatch.setattr(db, "file_rows", lambda ids: {
        "f1": _file("orders_oct.csv", ORDERS_HEADER, 1012),   # the real sample: practice
        "f2": _file("orders_oct.csv", ORDERS_HEADER, 1012),   # a second one: counts
        "f3": _file("my_export.csv", ORDERS_HEADER, 1012),
    })
    assert [r["id"] for r in onboarding.counted_recipes(recipes)] == ["r2", "r3", "r4"]


def test_a_renamed_file_is_not_a_sample():
    assert not onboarding.is_sample_file(_file("orders_oct.csv", ["a", "b"], 1012))
    assert not onboarding.is_sample_file(_file("orders_oct.csv", ORDERS_HEADER, 999))
    assert not onboarding.is_sample_file(None)
    assert onboarding.is_sample_file(_file("orders_oct.csv", ORDERS_HEADER, 1012))


def test_the_route_answers_for_the_signed_in_user(monkeypatch):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    monkeypatch.setattr(db, "user_events", lambda uid, names, limit=2000: [{"event": "upload_completed", "properties": {}}])
    body = TestClient(app).get("/onboarding").json()
    assert body == {"upload": True, "transform": False, "recipe": False, "rerun": False}


def test_the_digest_counts_who_activated():
    now = dt.datetime(2026, 10, 19, tzinfo=dt.timezone.utc)

    def ev(days, name, user):
        return {"user_id": user, "event": name, "properties": {}, "created_at": (now - dt.timedelta(days=days)).isoformat()}

    rows = [
        ev(10, "upload_completed", "a"), ev(8, "recipe_applied", "a"),   # started last week, ran within 7 days
        ev(12, "upload_completed", "b"),                                  # started last week, never ran
        ev(3, "upload_completed", "c"), ev(2, "recipe_applied", "c"),     # started this week: not in the cohort
        ev(30, "upload_completed", "d"), ev(11, "recipe_applied", "d"),   # started long ago
    ]
    s = digest.summarise(rows, now)
    assert s["activation"] == {"cohort": 2, "activated": 1}
    _, text = digest.email_text(s)
    assert "1 of the 2 who started the week before ran a recipe within 7 days." in text
