"""Insights on the file as its steps left it, inside a time budget, and
remembered per file state so the chat panel's refetches cost nothing."""

from __future__ import annotations

import types

import duckdb
import pytest

from app import db, insights as insights_module
from app.insights import generate_insights
from app.routes import insights as route


@pytest.fixture
def parquet(tmp_path):
    path = tmp_path / "data.parquet"
    duckdb.connect().execute(
        "COPY (SELECT * FROM (VALUES (1, 'x', '2026-10-01'), (1, 'x', '2026-10-01'), (2, NULL, '28/10/2026'), (3, 'z', '10/10/2026')) t(a, b, d)) "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return str(path)


def test_steps_are_applied_in_the_same_connection(parquet):
    base = generate_insights(parquet)
    assert base["duplicate_rows"] == 1 and base["row_count"] == 4
    after = generate_insights(parquet, [{"step_number": 1, "sql_query": "SELECT DISTINCT * FROM data"}])
    assert after["duplicate_rows"] == 0 and after["row_count"] == 3
    assert not any("duplicate" in s["text"] for s in after["suggestions"])
    assert after["partial"] is False


def test_probes_stop_when_the_budget_is_spent(parquet):
    out = generate_insights(parquet, budget=0.0)
    # The counts always run
    assert out["row_count"] == 4 and out["duplicate_rows"] == 1
    assert out["partial"] is True
    assert not any("dates" in s["text"] for s in out["suggestions"]), "the date probe was skipped"


def test_full_budget_finds_the_dates(parquet):
    out = generate_insights(parquet)
    assert any("dates" in s["text"] for s in out["suggestions"])


# ── The route's memory ───────────────────────────────────────────────


def _request(user_id="u1"):
    return types.SimpleNamespace(state=types.SimpleNamespace(user_id=user_id))


@pytest.fixture
def seams(monkeypatch, parquet):
    route.clear_cache()
    monkeypatch.setattr(db, "get_file", lambda fid, uid: {"id": fid, "r2_key": "k1"} if fid == "f1" else None)
    monkeypatch.setattr(route, "get_local_parquet", lambda key: parquet)
    calls = []

    def _gen(path, steps=None, **kw):
        calls.append(len(steps or []))
        return {"row_count": 4, "suggestions": [], "partial": kw.get("partial", False)}

    monkeypatch.setattr(route, "generate_insights", _gen)
    yield calls
    route.clear_cache()


def test_same_state_is_answered_from_memory(seams, monkeypatch):
    monkeypatch.setattr(db, "get_transformations", lambda fid: [])
    assert route.get_insights("f1", _request())["insights"]["row_count"] == 4
    route.get_insights("f1", _request())
    assert seams == [0], "one computation for two asks"


def test_a_new_step_is_a_new_state(seams, monkeypatch):
    steps = []
    monkeypatch.setattr(db, "get_transformations", lambda fid: steps)
    route.get_insights("f1", _request())
    steps.append({"step_number": 1, "sql_query": "SELECT DISTINCT * FROM data"})
    route.get_insights("f1", _request())
    steps.pop()
    route.get_insights("f1", _request())
    assert seams == [0, 1], "the file came back to a state already seen"


def test_partial_answers_are_not_remembered(seams, monkeypatch):
    monkeypatch.setattr(db, "get_transformations", lambda fid: [])
    monkeypatch.setattr(route, "generate_insights", lambda path, steps=None, **kw: (seams.append(0), {"row_count": 4, "suggestions": [], "partial": True})[1])
    route.get_insights("f1", _request())
    route.get_insights("f1", _request())
    assert seams == [0, 0]


def test_unknown_file_404(seams):
    assert route.get_insights("ghost", _request()).status_code == 404


def test_insights_route_has_room_to_work():
    from app.main import _DEFAULT_TIMEOUT, _ROUTE_TIMEOUTS

    assert _ROUTE_TIMEOUTS["/insights"] > insights_module.INSIGHTS_BUDGET_SECONDS
    assert _ROUTE_TIMEOUTS["/insights"] > _DEFAULT_TIMEOUT
