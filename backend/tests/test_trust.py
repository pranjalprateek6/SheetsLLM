"""Production trust: sized timeouts, a reference on every crash, the
reminder opt-out, and the settings that carry it."""
from __future__ import annotations

import asyncio
import datetime as dt
import types

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import db, events, mail, reminders
from app.main import app
from app.routes import reminders as reminders_route
from app.routes import settings as settings_route


def test_every_route_that_replays_a_file_has_room():
    for prefix in ("/recipes", "/undo", "/reset", "/files", "/shared", "/transform/op"):
        assert main_module._ROUTE_TIMEOUTS[prefix] >= 60, prefix
    assert main_module._DEFAULT_TIMEOUT == 10


def test_a_timeout_names_the_operation_and_carries_the_reference(monkeypatch):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    monkeypatch.setitem(main_module._ROUTE_TIMEOUTS, "/undo", 0.05)

    async def slow():
        await asyncio.sleep(0.5)
        return {"ok": True}

    app.add_api_route("/undo/__slow", slow, methods=["GET"])
    client = TestClient(app, raise_server_exceptions=False)
    r = client.get("/undo/__slow")
    assert r.status_code == 504
    body = r.json()
    assert body["code"] == "REQUEST_TIMEOUT"
    assert body["message"].startswith("Undo took more than")
    assert body["request_id"] == r.headers["x-request-id"]


def test_a_crash_answers_in_json_with_the_reference(monkeypatch):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)

    def boom():
        raise RuntimeError("kaboom")

    app.add_api_route("/reset/__boom", boom, methods=["GET"])
    client = TestClient(app, raise_server_exceptions=False)
    r = client.get("/reset/__boom")
    assert r.status_code == 500
    body = r.json()
    assert body["code"] == "INTERNAL" and "reference" in body["message"]
    assert body["request_id"] and body["request_id"] == r.headers["x-request-id"]
    assert "kaboom" not in r.text, "no internals in the answer"


# ── reminder opt-out ─────────────────────────────────────────────────


def test_the_unsubscribe_token_names_its_user_and_nobody_else():
    token = reminders.unsubscribe_token("user-123")
    assert reminders.user_from_unsubscribe_token(token) == "user-123"
    assert reminders.user_from_unsubscribe_token(token[:-2] + "zz") is None
    assert reminders.user_from_unsubscribe_token("") is None
    assert reminders.user_from_unsubscribe_token("nonsense") is None


def test_the_email_carries_the_link():
    status = {"recipe_id": "r1", "name": "Monthly orders", "days_since": 35, "last_run_at": "2026-09-01", "due": True}
    subject, body = reminders.email_text([status], user_id="u1")
    assert "/unsubscribe?t=" in body
    token = body.split("?t=")[1].strip().split()[0]
    assert reminders.user_from_unsubscribe_token(token) == "u1"


@pytest.fixture
def world(monkeypatch):
    now = dt.datetime(2026, 10, 13, tzinfo=dt.timezone.utc)
    monkeypatch.setattr(db, "list_all_recipes", lambda: [
        {"id": "r1", "user_id": "u1", "name": "Monthly orders", "created_at": "2026-06-01T00:00:00+00:00"},
        {"id": "r2", "user_id": "u2", "name": "Payroll", "created_at": "2026-06-01T00:00:00+00:00"},
    ])
    monkeypatch.setattr(db, "last_recipe_run", lambda uid, rid: None)
    monkeypatch.setattr(db, "user_email", lambda uid: f"{uid}@example.com")
    monkeypatch.setattr(db, "list_events", lambda since, names, limit=20000: [])
    settings = {"u2": {"email_reminders": False}}
    monkeypatch.setattr(db, "get_user_settings", lambda uid: settings.get(uid))
    sent = []
    monkeypatch.setattr(mail, "send", lambda to, subject, text, headers=None, **kw: (sent.append((to, headers)), True)[1])
    monkeypatch.setattr(mail, "configured", lambda: True)
    monkeypatch.setattr(events, "record", lambda *a, **k: None)
    return types.SimpleNamespace(sent=sent, now=now)


def test_someone_who_opted_out_is_skipped_and_the_rest_get_the_header(world):
    out = reminders.run_daily(now=world.now)
    assert out["sent"] == 1 and out["skipped"] == 1
    to, headers = world.sent[0]
    assert to == "u1@example.com"
    assert headers["List-Unsubscribe"].startswith("<") and "/unsubscribe?t=" in headers["List-Unsubscribe"]
    assert headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"


def test_the_unsubscribe_route_needs_a_valid_token_and_saves_the_setting(monkeypatch):
    saved = {}
    monkeypatch.setattr(reminders_route.db, "upsert_user_settings", lambda uid, **f: saved.update({uid: f}) or {})
    recorded = []
    monkeypatch.setattr(events, "record", lambda uid, ev, **p: recorded.append((uid, ev)))
    client = TestClient(app, raise_server_exceptions=False)
    assert client.post("/reminders/unsubscribe?t=garbage").status_code == 400
    r = client.post(f"/reminders/unsubscribe?t={reminders.unsubscribe_token('u9')}")
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert saved == {"u9": {"email_reminders": False}}
    assert ("u9", "reminders_unsubscribed") in recorded


def test_settings_carry_the_reminder_preference(monkeypatch):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    rows: dict[str, dict] = {}
    monkeypatch.setattr(settings_route.db, "get_user_settings", lambda uid: rows.get(uid))

    def upsert(uid, **f):
        rows.setdefault(uid, {}).update(f)
        return rows[uid]

    monkeypatch.setattr(settings_route.db, "upsert_user_settings", upsert)
    monkeypatch.setattr(events, "record", lambda *a, **k: None)
    client = TestClient(app, raise_server_exceptions=False)
    assert client.get("/settings").json()["email_reminders"] is True
    r = client.patch("/settings", json={"email_reminders": False})
    assert r.status_code == 200 and r.json()["email_reminders"] is False
    assert client.patch("/settings", json={"email_reminders": "no"}).status_code == 400
    assert client.patch("/settings", json={}).status_code == 400
