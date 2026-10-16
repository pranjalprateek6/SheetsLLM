"""The try page's route: the real engine on the bundled sample, no account,
one-click fixes only, and the same steps replayed on next month's file."""
from __future__ import annotations

import datetime as dt

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import digest, events, security
from app.main import app
from app.routes import try_demo as route

FIXES = [
    {"op": "dedupe"},
    {"op": "drop_empty_rows", "column": "Region"},
    {"op": "standardise_date", "column": "Order Date", "args": {"format": "auto"}},
]


@pytest.fixture
def client(monkeypatch):
    # Signed out for real: no anonymous fallback, so only a public path answers
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", False)
    recorded: list[tuple] = []
    monkeypatch.setattr(events, "record", lambda *a, **k: recorded.append((a, k)))
    security._rate_store.clear()
    route._funnel_seen.clear()
    c = TestClient(app, raise_server_exceptions=False)
    c.recorded = recorded
    return c


def test_open_without_an_account_shows_the_sample_and_its_fixes(client):
    r = client.post("/try/apply", json={"month": "oct", "steps": [], "event": "start"})
    assert r.status_code == 200
    body = r.json()
    assert body["total_rows"] == 1012
    assert body["row_counts"] == [1012]
    assert "Remove 12 duplicate rows" in [s["text"] for s in body["suggestions"]]
    assert body["columns"][:3] == ["Order ID", "Customer Email", "Region"]
    (args, props), = client.recorded
    assert args[0].startswith("try:") and args[1] == "try_started"


def test_fixes_become_steps_and_the_same_steps_run_on_november(client):
    oct_ = client.post("/try/apply", json={"month": "oct", "steps": FIXES}).json()
    assert [s["instruction"] for s in oct_["steps"]][0] == "Remove duplicate rows"
    assert oct_["row_counts"][0] == 1012 and oct_["row_counts"][1] == 1000
    # Every fix the insights offered is done
    assert oct_["suggestions"] == []

    nov = client.post("/try/apply", json={"month": "nov", "steps": FIXES, "event": "replay"}).json()
    assert nov["row_counts"][0] == 1040
    assert nov["row_counts"][-1] < 1040
    assert all(row["Region"] is not None for row in nov["rows"])
    assert client.recorded[-1][0][1] == "try_replayed"


def test_only_one_click_fixes_never_sql(client):
    r = client.post("/try/apply", json={"steps": [{"op": "join_lookup", "column": "Region"}]})
    assert r.status_code == 400 and r.json()["code"] == "OP_NOT_ALLOWED"
    r = client.post("/try/apply", json={"steps": [{"op": "dedupe", "sql_query": "DROP TABLE x"}]})
    # Extra keys are ignored: the SQL is always built here
    assert r.status_code == 200 and r.json()["row_counts"] == [1012, 1000]


@pytest.mark.parametrize("body,code", [
    ({"month": "dec"}, "UNKNOWN_SAMPLE"),
    ({"steps": [{"op": "dedupe"}] * 13}, "TOO_MANY_STEPS"),
    ({"steps": "dedupe"}, "INVALID_STEPS"),
    ({"steps": [{"op": "trim", "column": "No Such Column"}]}, None),
])
def test_bad_requests_are_400_json(client, body, code):
    r = client.post("/try/apply", json=body)
    assert r.status_code == 400
    if code:
        assert r.json()["code"] == code


def test_an_unknown_event_records_nothing(client):
    client.post("/try/apply", json={"steps": [], "event": "recipe_saved"})
    assert client.recorded == []


def test_rate_limited_per_visitor(client, monkeypatch):
    monkeypatch.setattr(route, "PER_VISITOR", 2)
    headers = {"x-client-ip": "203.0.113.9"}
    assert client.post("/try/apply", json={}, headers=headers).status_code == 200
    assert client.post("/try/apply", json={}, headers=headers).status_code == 200
    r = client.post("/try/apply", json={}, headers=headers)
    assert r.status_code == 429 and r.json()["code"] == "RATE_LIMITED"
    # Another visitor is not held up
    assert client.post("/try/apply", json={}, headers={"x-client-ip": "198.51.100.4"}).status_code == 200


def test_the_visitor_key_never_holds_the_address():
    key = route.try_demo.visitor_key("203.0.113.9")
    assert key.startswith("try:") and "203" not in key


def test_digest_counts_try_visitors_apart_from_people():
    now = dt.datetime(2026, 10, 19, 4, tzinfo=dt.timezone.utc)
    at = (now - dt.timedelta(days=1)).isoformat()
    rows = [
        {"user_id": "try:a", "event": "try_started", "created_at": at, "properties": {}},
        {"user_id": "try:a", "event": "try_fix_applied", "created_at": at, "properties": {}},
        {"user_id": "try:b", "event": "try_started", "created_at": at, "properties": {}},
        {"user_id": "u1", "event": "signed_up_from", "created_at": at, "properties": {"from": "try"}},
    ]
    s = digest.summarise(rows, now)
    assert s["active_users"]["this"] == 1
    assert (s["loop"]["try_started"], s["loop"]["try_fixed"], s["loop"]["try_signups"]) == (2, 1, 1)
    _, text = digest.email_text(s)
    assert "The try page: 2 opened it, 1 fixed something, 0 ran it on November, 1 signed up this week." in text


def test_each_funnel_event_counts_once_per_visitor(client):
    for _ in range(3):
        client.post("/try/apply", json={"steps": [], "event": "start"})
    assert [a[1] for a, _ in client.recorded] == ["try_started"]


def test_busy_when_too_many_run_at_once(client, monkeypatch):
    import asyncio

    monkeypatch.setattr(route, "_running", asyncio.Semaphore(0))
    r = client.post("/try/apply", json={})
    assert r.status_code == 503 and r.json()["code"] == "TRY_BUSY"


def test_the_sample_copy_is_private_to_the_process():
    import os
    import tempfile

    path = route.try_demo.sample_path("oct")
    assert path.parent != __import__("pathlib").Path(tempfile.gettempdir())
    if os.name != "nt":
        assert (path.parent.stat().st_mode & 0o777) == 0o700


def test_the_limiter_forgets_idle_keys(monkeypatch):
    monkeypatch.setattr(security, "_SWEEP_EVERY", 1)
    security._rate_store.clear()
    security._rate_store["try:old"] = [0.0]
    security.check_rate_limit("try:new")
    assert "try:old" not in security._rate_store and "try:new" in security._rate_store
