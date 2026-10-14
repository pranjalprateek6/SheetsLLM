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


def test_a_recipe_from_a_sample_does_not_count(monkeypatch):
    recipes = [{"id": "r1", "source_file_id": "f1"}, {"id": "r2", "source_file_id": "f2"}, {"id": "r3"}]
    monkeypatch.setattr(db, "file_names", lambda ids: {"f1": "orders_oct.csv", "f2": "my_export.csv"})
    assert [r["id"] for r in onboarding.counted_recipes(recipes)] == ["r2", "r3"]


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
