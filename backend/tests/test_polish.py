"""The status page's memory, database timeouts, the loop numbers, the
account export and replacing a value as a step."""
from __future__ import annotations

import datetime as dt

import duckdb
import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import db, digest, events
from app.engine import replay_transformations_local
from app.llm import health as llm_health
from app.main import app
from app.ops import OpError, build_op


# ── 1. status ────────────────────────────────────────────────────────


def test_health_says_less_and_remembers_a_recent_outage(monkeypatch):
    llm_health.reset()
    now = dt.datetime.now(dt.timezone.utc)
    monkeypatch.setattr("app.routes.health._probe_database", lambda: None)
    monkeypatch.setattr(db, "list_events", lambda since, names, limit=500: [
        {"user_id": "u1", "event": "llm_unavailable", "created_at": (now - dt.timedelta(minutes=3)).isoformat()},
        {"user_id": "u2", "event": "llm_quota_hit", "created_at": (now - dt.timedelta(hours=5)).isoformat()},
        {"user_id": "anonymous", "event": "llm_quota_hit", "created_at": (now - dt.timedelta(hours=1)).isoformat()},
    ])
    body = TestClient(app).get("/health").json()
    assert "has_key" not in body and "provider" not in body
    assert body["ai"]["ok"] is False and body["ai"]["kind"] == "unavailable"
    assert body["ai"]["incidents_24h"] == 2


def test_an_old_incident_is_counted_but_does_not_mark_the_ai_down(monkeypatch):
    llm_health.reset()
    now = dt.datetime.now(dt.timezone.utc)
    monkeypatch.setattr("app.routes.health._probe_database", lambda: None)
    monkeypatch.setattr(db, "list_events", lambda since, names, limit=500: [
        {"user_id": "u1", "event": "llm_quota_hit", "created_at": (now - dt.timedelta(hours=5)).isoformat()},
    ])
    ai = TestClient(app).get("/health").json()["ai"]
    assert ai["ok"] is True and ai["incidents_24h"] == 1 and ai["last_incident_at"]


# ── 2. the database not answering ────────────────────────────────────


def test_a_database_timeout_is_said_plainly(monkeypatch):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)

    def slow_db():
        raise httpx.ReadTimeout("timed out")

    app.add_api_route("/reset/__dbslow", slow_db, methods=["GET"])
    r = TestClient(app, raise_server_exceptions=False).get("/reset/__dbslow")
    assert r.status_code == 503 and r.json()["code"] == "DB_UNAVAILABLE" and r.json()["request_id"]


# ── 6. the loop numbers ──────────────────────────────────────────────


def test_the_digest_measures_the_habit():
    now = dt.datetime(2026, 10, 19, tzinfo=dt.timezone.utc)

    def ev(days, name, user="u1", **p):
        return {"user_id": user, "event": name, "properties": p, "created_at": (now - dt.timedelta(days=days)).isoformat()}

    rows = [
        ev(20, "recipe_applied", recipe_id="r1"), ev(5, "recipe_applied", recipe_id="r1"),   # r1 twice
        ev(4, "recipe_applied", recipe_id="r2"),                                               # r2 once
        ev(8, "reminder_sent", recipe_id="r1"), ev(5, "recipe_applied", recipe_id="r1"),      # converted
        ev(3, "reminder_sent", recipe_id="r3"),                                                # not
        ev(2, "tool_cta_clicked", tool="csv-cleaner"), ev(1, "signed_up_from", **{"from": "tool-csv-cleaner"}),
        ev(1, "signed_up_from", **{"from": "share-page"}),
    ]
    loop = digest.summarise(rows, now)["loop"]
    assert loop == {"recipes_run_twice": 1, "recipes_run": 2, "reminders": 2, "reminders_converted": 1,
                    "tool_clicks": 1, "tool_signups": 1}
    _, text = digest.email_text(digest.summarise(rows, now))
    assert "1 of 2 recipes run in the last 60 days ran on two or more files." in text
    assert "1 of 2 reminders in the last two weeks led to a run within 7 days." in text


# ── 7. the account export ────────────────────────────────────────────


def test_the_export_holds_recipes_files_and_steps_but_no_values(monkeypatch):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    monkeypatch.setattr(db, "list_files", lambda uid, page=1, page_size=20, **k: {"items": [
        {"id": "f1", "name": "orders.csv", "row_count": 10, "column_count": 2, "created_at": "2026-10-01",
         "schema_json": {"columns": [{"name": "a"}, {"name": "b"}], "samples": [["secret", 1]]}},
    ], "total": 1})
    monkeypatch.setattr(db, "get_transformations", lambda fid: [{"step_number": 1, "instruction": "Trim a", "sql_query": "SELECT 1"}])
    monkeypatch.setattr(db, "list_recipes", lambda uid: [{"id": "r1", "name": "Orders", "steps": [{"instruction": "Trim a", "sql_query": "SELECT 1"}], "required_columns": [{"name": "a"}]}])
    monkeypatch.setattr(db, "get_user_settings", lambda uid: {"privacy_mode": True, "email_reminders": False, "user_id": "x"})
    monkeypatch.setattr(db, "get_subscription", lambda uid: None)
    monkeypatch.setattr(events, "record", lambda *a, **k: None)
    body = TestClient(app).get("/account/export").json()
    assert body["recipes"][0]["steps"] == [{"instruction": "Trim a", "sql": "SELECT 1"}]
    assert body["files"][0]["columns_at_upload"] == ["a", "b"] and body["files"][0]["steps"][0]["instruction"] == "Trim a"
    assert body["settings"] == {"privacy_mode": True, "email_reminders": False}
    assert "secret" not in str(body), "no sample values"


# ── 9. replace a value ───────────────────────────────────────────────


@pytest.fixture
def parquet(tmp_path):
    path = tmp_path / "d.parquet"
    duckdb.connect().execute(
        "COPY (SELECT * FROM (VALUES ('N/A', 1), ('North', 2), (NULL, 3), ('N/A', 4)) t(region, n)) "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return str(path)


SCHEMA = [{"name": "region", "dtype": "VARCHAR"}, {"name": "n", "dtype": "INTEGER"}]


def _run(parquet, sql):
    return replay_transformations_local(parquet, [{"step_number": 1, "sql_query": sql}])["preview"]


def test_replace_rewrites_every_matching_cell(parquet):
    sql, instruction = build_op("replace_value", SCHEMA, "region", {"from": "N/A", "to": ""})
    assert instruction == "Replace \u201cN/A\u201d with empty in region"
    assert [r["region"] for r in _run(parquet, sql)] == [None, "North", None, None]
    sql, _ = build_op("replace_value", SCHEMA, "region", {"from": "", "to": "Unknown"})
    assert [r["region"] for r in _run(parquet, sql)] == ["N/A", "North", "Unknown", "N/A"]


def test_replace_in_a_number_column_needs_a_number(parquet):
    sql, _ = build_op("replace_value", SCHEMA, "n", {"from": "2", "to": "20"})
    assert [r["n"] for r in _run(parquet, sql)] == [1, 20, 3, 4]
    with pytest.raises(OpError):
        build_op("replace_value", SCHEMA, "n", {"from": "2", "to": "two"})
    with pytest.raises(OpError):
        build_op("replace_value", SCHEMA, "region", {"from": "x", "to": "x"})
