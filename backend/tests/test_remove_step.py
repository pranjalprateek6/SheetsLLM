"""Taking a step out of the middle of a file's history."""

from __future__ import annotations

import types

import duckdb
import pytest

from app import db, events
from app.routes import files as files_route

STEPS = [
    {"id": "t1", "step_number": 1, "instruction": "trim", "sql_query": "SELECT TRIM(b) AS b, a FROM data"},
    {"id": "t2", "step_number": 2, "instruction": "add c", "sql_query": "SELECT *, a * 2 AS c FROM data"},
    {"id": "t3", "step_number": 3, "instruction": "keep big c", "sql_query": "SELECT * FROM data WHERE c > 2"},
]


def _request(user_id="u1"):
    return types.SimpleNamespace(state=types.SimpleNamespace(user_id=user_id))


@pytest.fixture
def parquet(tmp_path):
    path = tmp_path / "src.parquet"
    duckdb.connect().execute(
        "COPY (SELECT * FROM (VALUES (1, ' x '), (2, 'y'), (3, 'z')) t(a, b)) "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return str(path)


@pytest.fixture
def seams(monkeypatch, parquet):
    state = {"steps": [dict(s) for s in STEPS], "deleted": [], "renumbered": 0}
    monkeypatch.setattr(db, "get_file", lambda fid, uid: {"id": fid, "r2_key": "k"} if fid == "f1" else None)
    monkeypatch.setattr(db, "get_transformations", lambda fid: [dict(s) for s in state["steps"]])

    def _delete(fid, n):
        state["deleted"].append(n)
        state["steps"] = [s for s in state["steps"] if s["step_number"] != n]
        return 1

    def _renumber(fid, n):
        moved = 0
        for s in state["steps"]:
            if s["step_number"] > n:
                s["step_number"] -= 1
                moved += 1
        state["renumbered"] = moved
        return moved

    monkeypatch.setattr(db, "delete_transformation", _delete)
    monkeypatch.setattr(db, "renumber_transformations_after", _renumber)
    monkeypatch.setattr(db, "update_file", lambda *a, **kw: {})
    monkeypatch.setattr(db, "create_audit_entry", lambda **kw: {})
    monkeypatch.setattr(files_route, "get_local_parquet", lambda key: parquet)
    recorded = []
    monkeypatch.setattr(events, "record", lambda uid, ev, **props: recorded.append((ev, props)))
    state["events"] = recorded
    return state


def test_a_step_nobody_needs_comes_out_and_the_rest_close_up(seams):
    body = files_route.remove_step(_request(), "f1", 1)
    assert body["removed_step"] == 1 and body["steps"] == 2
    assert seams["deleted"] == [1] and seams["renumbered"] == 2
    assert [s["step_number"] for s in seams["steps"]] == [1, 2]
    assert [s["instruction"] for s in seams["steps"]] == ["add c", "keep big c"]
    # The result is the file with the two remaining steps: a*2 > 2 keeps a=2 and a=3, b untrimmed
    assert body["preview"]["total_rows"] == 2
    assert body["preview"]["rows"][0]["b"] == "y"
    assert ("step_removed", {"position": 1, "of": 3}) in seams["events"]


def test_a_step_a_later_one_needs_stays(seams):
    resp = files_route.remove_step(_request(), "f1", 2)
    assert resp.status_code == 409
    assert b"STEP_NEEDED" in resp.body
    assert b"step 3 (keep big c) needs what it did" in resp.body
    assert seams["deleted"] == [], "nothing changed"


def test_the_last_step_can_go(seams):
    body = files_route.remove_step(_request(), "f1", 3)
    assert body["steps"] == 2 and body["preview"]["total_rows"] == 3


def test_removing_the_only_step_leaves_the_original(seams):
    seams["steps"] = [dict(STEPS[0])]
    body = files_route.remove_step(_request(), "f1", 1)
    assert body["steps"] == 0
    assert body["preview"]["rows"][0]["b"] == " x "


def test_unknown_step_and_file(seams):
    assert files_route.remove_step(_request(), "f1", 9).status_code == 404
    assert files_route.remove_step(_request(), "ghost", 1).status_code == 404


def test_event_is_known():
    assert "step_removed" in events.EVENTS
