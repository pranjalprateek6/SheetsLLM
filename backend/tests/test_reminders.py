"""Between months: which recipes are due, who is told, and only once."""

from __future__ import annotations

import datetime as _dt
import types

import httpx
import pytest

from app import db, events, mail, reminders
from app.reminders import due_for_user, email_text, recipe_status, run_daily
from app.routes import recipes as recipes_route

NOW = _dt.datetime(2026, 11, 10, 9, 0, tzinfo=_dt.timezone.utc)


def _iso(days_ago: int) -> str:
    return (NOW - _dt.timedelta(days=days_ago)).isoformat()


# ── Due or not ───────────────────────────────────────────────────────


def test_a_recipe_is_due_after_the_window_since_its_last_run():
    recipe = {"id": "r1", "name": "Monthly orders", "created_at": _iso(90)}
    assert recipe_status(recipe, {"created_at": _iso(31)}, NOW) == {
        "recipe_id": "r1", "name": "Monthly orders", "last_run_at": _iso(31), "days_since": 31, "due": True,
    }
    assert recipe_status(recipe, {"created_at": _iso(5)}, NOW)["due"] is False


def test_a_recipe_never_run_counts_from_its_saving():
    recipe = {"id": "r1", "name": "Monthly orders", "created_at": _iso(30)}
    status = recipe_status(recipe, None, NOW)
    assert status["due"] is True and status["last_run_at"] is None and status["days_since"] == 30


def test_the_users_list_puts_due_ones_first(monkeypatch):
    monkeypatch.setattr(db, "list_recipes", lambda uid: [
        {"id": "fresh", "name": "Fresh", "created_at": _iso(2)},
        {"id": "old", "name": "Old", "created_at": _iso(60)},
        {"id": "older", "name": "Older", "created_at": _iso(90)},
    ])
    monkeypatch.setattr(db, "last_recipe_run", lambda uid, rid: {"created_at": _iso(40)} if rid == "old" else None)
    out = due_for_user("u1", now=NOW)
    assert [r["recipe_id"] for r in out] == ["older", "old", "fresh"]
    assert [r["due"] for r in out] == [True, True, False]


# ── The email ────────────────────────────────────────────────────────


def test_email_names_the_recipe_and_links_to_the_run():
    subject, body = email_text([{"recipe_id": "r1", "name": "Monthly orders", "last_run_at": _iso(31), "days_since": 31, "due": True}])
    assert subject == "Monthly orders is ready for this month's file"
    assert "Monthly orders: last ran 31 days ago" in body
    assert "/workspace?recipe_id=r1" in body
    subject, body = email_text([
        {"recipe_id": "r1", "name": "A", "last_run_at": None, "days_since": 30, "due": True},
        {"recipe_id": "r2", "name": "B", "last_run_at": _iso(45), "days_since": 45, "due": True},
    ])
    assert subject == "2 recipes are ready for this month's files"
    assert "A: saved 30 days ago and not run since" in body


def test_mail_is_off_without_a_key(monkeypatch):
    monkeypatch.setattr(mail, "RESEND_API_KEY", "")
    assert mail.configured() is False
    assert mail.send("a@b.c", "s", "t") is False


def test_mail_posts_to_the_provider(monkeypatch):
    monkeypatch.setattr(mail, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(mail, "REMINDER_FROM", "SheetsLLM <hello@example.com>")
    seen = {}

    def handler(request: httpx.Request):
        seen["auth"] = request.headers.get("authorization")
        seen["json"] = request.read()
        return httpx.Response(200, json={"id": "em_1"})

    ok = mail.send("ana@example.com", "Subject", "Body", client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert ok is True and seen["auth"] == "Bearer re_test" and b'"to":["ana@example.com"]' in seen["json"].replace(b" ", b"")
    bad = mail.send("ana@example.com", "S", "B", client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(422))))
    assert bad is False


# ── The daily pass ───────────────────────────────────────────────────


@pytest.fixture
def world(monkeypatch):
    monkeypatch.setattr(db, "list_all_recipes", lambda: [
        {"id": "r1", "user_id": "u1", "name": "Monthly orders", "created_at": _iso(100)},
        {"id": "r2", "user_id": "u1", "name": "Payroll", "created_at": _iso(100)},
        {"id": "r3", "user_id": "u2", "name": "Fresh", "created_at": _iso(3)},
        {"id": "r4", "user_id": "u3", "name": "No email", "created_at": _iso(50)},
    ])
    runs = {"r1": {"created_at": _iso(35)}, "r2": {"created_at": _iso(29)}, "r3": {"created_at": _iso(1)}}
    monkeypatch.setattr(db, "last_recipe_run", lambda uid, rid: runs.get(rid))
    monkeypatch.setattr(db, "user_email", lambda uid: {"u1": "one@example.com", "u2": "two@example.com"}.get(uid))
    past: list[dict] = []
    monkeypatch.setattr(db, "list_events", lambda since, names, limit=20000: past)
    sent: list[tuple] = []
    monkeypatch.setattr(mail, "send", lambda to, subject, text: (sent.append((to, subject, text)), True)[1])
    monkeypatch.setattr(mail, "configured", lambda: True)
    recorded: list[tuple] = []
    monkeypatch.setattr(events, "record", lambda uid, ev, **props: recorded.append((uid, ev, props)))
    return types.SimpleNamespace(past=past, sent=sent, recorded=recorded)


def test_each_owner_hears_once_about_all_their_due_recipes(world):
    out = run_daily(now=NOW)
    assert out == {"due": 3, "sent": 2, "skipped": 1, "failed": 0, "mail": True}
    assert [s[0] for s in world.sent] == ["one@example.com"]
    assert world.sent[0][1] == "2 recipes are ready for this month's files"
    assert ("u1", "reminder_sent", {"recipe_id": "r1", "days_since": 35}) in world.recorded
    assert ("u1", "reminder_sent", {"recipe_id": "r2", "days_since": 29}) in world.recorded
    assert not any(r[0] == "u3" for r in world.recorded), "no address, nothing recorded"


def test_a_recipe_already_reminded_is_left_alone(world):
    world.past.append({"user_id": "u1", "event": "reminder_sent", "properties": {"recipe_id": "r1"}})
    out = run_daily(now=NOW)
    assert out["sent"] == 1
    assert "Payroll is ready" in world.sent[0][1]


# ── The routes ───────────────────────────────────────────────────────


def test_due_route_answers_for_the_signed_in_user(monkeypatch):
    saved = (_dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(days=40)).isoformat()
    monkeypatch.setattr(db, "list_recipes", lambda uid: [{"id": "r1", "name": "Monthly orders", "created_at": saved}])
    monkeypatch.setattr(db, "last_recipe_run", lambda uid, rid: None)
    req = types.SimpleNamespace(state=types.SimpleNamespace(user_id="u1"))
    body = recipes_route.recipes_due(req)
    assert body["days"] == reminders.REMINDER_DAYS
    assert body["recipes"][0]["recipe_id"] == "r1" and body["recipes"][0]["due"] is True


def test_the_daily_pass_needs_the_secret(monkeypatch):
    from fastapi.testclient import TestClient

    import app.main as main_module
    from app.main import app
    from app.routes import reminders as route

    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", False)
    monkeypatch.setattr(route, "CRON_SECRET", "")
    client = TestClient(app, raise_server_exceptions=False)
    assert client.post("/reminders/run").status_code == 503
    monkeypatch.setattr(route, "CRON_SECRET", "s3cret")
    assert client.post("/reminders/run").status_code == 401
    assert client.post("/reminders/run", headers={"X-Cron-Secret": "wrong"}).status_code == 401
    monkeypatch.setattr(route, "run_daily", lambda: {"due": 0, "sent": 0, "skipped": 0, "failed": 0, "mail": False})
    resp = client.post("/reminders/run", headers={"X-Cron-Secret": "s3cret"})
    assert resp.status_code == 200 and resp.json()["sent"] == 0
