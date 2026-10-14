"""The weekly digest: the numbers, the email, the run and the route."""
from __future__ import annotations

import datetime as dt

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import db, digest, events, mail
from app.main import app
from app.routes import digest as digest_route

NOW = dt.datetime(2026, 10, 19, 3, 45, tzinfo=dt.timezone.utc)  # a Monday


def _ev(days_ago: float, event: str, user: str = "u1", **props) -> dict:
    return {"user_id": user, "event": event, "properties": props,
            "created_at": (NOW - dt.timedelta(days=days_ago)).isoformat()}


ROWS = [
    # this week: two people, one of them new
    _ev(1, "upload_completed", "u1"), _ev(1, "chat_sent", "u1"), _ev(2, "chat_sent", "u1"),
    _ev(3, "recipe_applied", "u1"), _ev(3, "export_completed", "u1"),
    _ev(2, "upload_completed", "u2"), _ev(2, "llm_quota_hit", "u2"),
    _ev(0.5, "upload_completed", "anonymous"),  # the e2e user counts for nothing
    # last week: one person, who is the same u1
    _ev(9, "upload_completed", "u1"), _ev(9, "chat_sent", "u1"), _ev(10, "chat_sent", "u1"), _ev(10, "chat_sent", "u1"),
    _ev(11, "recipe_incompatible", "u1"),
    # long ago: u1 has been around, so is not new
    _ev(40, "upload_completed", "u1"),
]


def test_the_summary_counts_this_week_beside_last_and_tells_new_people_apart():
    s = digest.summarise(ROWS, NOW, recipes_total=7)
    assert (s["from"], s["to"]) == ("2026-10-12", "2026-10-18")
    assert s["active_users"] == {"this": 2, "last": 1}
    assert s["new_users"] == {"this": 1, "last": 0}
    by = {p["event"]: p for p in s["activity"]}
    assert (by["upload_completed"]["this"], by["upload_completed"]["last"]) == (2, 1)
    assert (by["chat_sent"]["this"], by["chat_sent"]["last"]) == (2, 3)
    assert (by["recipe_applied"]["this"], by["recipe_applied"]["last"]) == (1, 0)
    trouble = {p["event"]: p for p in s["trouble"]}
    assert (trouble["llm_quota_hit"]["this"], trouble["recipe_incompatible"]["last"]) == (1, 1)
    assert s["recipes_total"] == 7


def test_the_email_leads_with_the_three_numbers_and_says_the_direction():
    subject, text = digest.email_text(digest.summarise(ROWS, NOW, recipes_total=7))
    assert subject == "SheetsLLM this week: 2 files, 2 AI requests, 1 recipe runs"
    assert "2  people did something (up 1 from 1)" in text
    assert "1  were new (up from 0)" in text
    assert "2  AI requests (down 1 from 3)" in text
    assert "1  AI quota hits (up from 0)" in text
    assert "0  recipes that did not fit a file (down 1 from 1)" in text
    assert "7 recipes exist in all" in text
    assert "Money" not in text, "no money events, no money section"
    assert "/admin/metrics" in text
    assert "u1" not in text and "u2" not in text, "nobody is named"
    assert "—" not in subject + text


def test_a_quiet_week_still_reads():
    subject, text = digest.email_text(digest.summarise([], NOW))
    assert subject == "SheetsLLM this week: 0 files, 0 AI requests, 0 recipe runs"
    assert "- nothing this week or last" in text


@pytest.fixture
def world(monkeypatch):
    monkeypatch.setattr(db, "list_events", lambda since, names, limit=20000: list(ROWS))
    monkeypatch.setattr(db, "count_recipes", lambda: 7)
    sent: list[tuple] = []
    monkeypatch.setattr(mail, "send", lambda to, subject, text: (sent.append((to, subject, text)), True)[1])
    monkeypatch.setattr(mail, "configured", lambda: True)
    recorded: list[tuple] = []
    monkeypatch.setattr(events, "record", lambda uid, ev, **props: recorded.append((uid, ev, props)))
    monkeypatch.setattr(digest, "ADMIN_EMAILS", frozenset({"owner@example.com", "second@example.com"}))
    return sent, recorded


def test_the_run_mails_every_owner_once_and_records_it(world):
    sent, recorded = world
    out = digest.run_weekly(now=NOW)
    assert out["sent"] == 2 and out["failed"] == 0
    assert sorted(s[0] for s in sent) == ["owner@example.com", "second@example.com"]
    assert sent[0][1].startswith("SheetsLLM this week:")
    assert recorded == [("system", "digest_sent", {"recipients": 2})]


def test_without_owner_addresses_nothing_is_sent(world, monkeypatch):
    sent, _ = world
    monkeypatch.setattr(digest, "ADMIN_EMAILS", frozenset())
    out = digest.run_weekly(now=NOW)
    assert out["sent"] == 0 and "ADMIN_EMAILS" in out["skipped"]
    assert sent == []


def test_an_unreadable_events_table_is_reported_not_raised(world, monkeypatch):
    sent, _ = world
    monkeypatch.setattr(db, "list_events", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    out = digest.run_weekly(now=NOW)
    assert out["sent"] == 0 and out["skipped"] == "events unavailable"
    assert sent == []


def test_the_cron_route_needs_the_secret(monkeypatch, world):
    client = TestClient(app, raise_server_exceptions=False)
    monkeypatch.setattr(digest_route, "CRON_SECRET", "")
    assert client.post("/admin/digest/run").status_code == 503
    monkeypatch.setattr(digest_route, "CRON_SECRET", "s3cret")
    assert client.post("/admin/digest/run", headers={"X-Cron-Secret": "wrong"}).status_code == 401
    r = client.post("/admin/digest/run", headers={"X-Cron-Secret": "s3cret"})
    assert r.status_code == 200 and r.json()["sent"] == 2


def test_the_preview_is_for_the_owner_only(monkeypatch, world):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    client = TestClient(app, raise_server_exceptions=False)
    assert client.get("/admin/digest").status_code == 403
    # the admin check reads the email the auth middleware sets; stand in for it
    monkeypatch.setattr(digest_route, "is_admin", lambda request: True)
    body = client.get("/admin/digest").json()
    assert body["subject"].startswith("SheetsLLM this week:") and "People" in body["text"]
    assert set(body["summary"]) >= {"from", "to", "active_users", "new_users", "activity", "trouble", "money"}


def test_the_cron_route_is_reached_without_a_sign_in(monkeypatch):
    """pg_cron has no session: the route must be public and gated by the secret alone."""
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", False)
    monkeypatch.setattr(digest_route, "CRON_SECRET", "s3cret")
    r = TestClient(app, raise_server_exceptions=False).post("/admin/digest/run", headers={"X-Cron-Secret": "wrong"})
    assert r.status_code == 401 and r.json()["code"] == "UNAUTHORIZED" and "bearer" not in r.text.lower()
