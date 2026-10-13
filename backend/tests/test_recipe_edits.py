"""Editing a recipe: remove and reorder steps, or take a file's steps, with
the SQL never coming from the client and a reordered chain planned first."""

from __future__ import annotations

import asyncio
import types

import duckdb
import pytest

from app import db, events
from app.engine import first_failing_step
from app.recipes import RecipeError, reorder_steps
from app.routes import recipes as recipes_route

STEPS = [
    {"step_number": 1, "instruction": "trim", "sql_query": "SELECT TRIM(b) AS b, a FROM data"},
    {"step_number": 2, "instruction": "add c", "sql_query": "SELECT *, a * 2 AS c FROM data"},
    {"step_number": 3, "instruction": "keep big c", "sql_query": "SELECT * FROM data WHERE c > 2"},
]


def _request(body, user_id="u1"):
    async def _json():
        return body
    return types.SimpleNamespace(state=types.SimpleNamespace(user_id=user_id), json=_json)


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
    saved = {}
    monkeypatch.setattr(db, "get_recipe", lambda rid, uid: {"id": rid, "user_id": uid, "steps": STEPS, "source_file_id": "f1", "required_columns": [{"name": "a"}, {"name": "b"}]} if rid == "r1" else None)
    monkeypatch.setattr(db, "get_file", lambda fid, uid: {"id": fid, "r2_key": "k", "schema_json": {"columns": [{"name": "a", "dtype": "BIGINT"}, {"name": "b", "dtype": "VARCHAR"}]}} if fid in ("f1", "f2") else None)

    def _update(rid, uid, **updates):
        saved.update(updates)
        return {"id": rid, "source_file_id": updates.get("source_file_id", "f1"), **updates}

    monkeypatch.setattr(db, "update_recipe", _update)
    monkeypatch.setattr(db, "create_audit_entry", lambda **kw: {})
    monkeypatch.setattr(db, "get_transformations", lambda fid: [
        {"step_number": 1, "instruction": "dedupe", "sql_query": "SELECT DISTINCT * FROM data"},
    ])
    monkeypatch.setattr(recipes_route, "get_local_parquet", lambda key: parquet)
    monkeypatch.setattr(events, "record", lambda *a, **kw: None)
    return saved


# ── reorder_steps ────────────────────────────────────────────────────


def test_reorder_keeps_named_steps_in_order_and_renumbers():
    out = reorder_steps(STEPS, [3, 1])
    assert [s["instruction"] for s in out] == ["keep big c", "trim"]
    assert [s["step_number"] for s in out] == [1, 2]
    assert out[0]["sql_query"] == STEPS[2]["sql_query"], "the SQL is the stored one"


@pytest.mark.parametrize("keep", [[], None, "1", [4], [1, 1], [True], [1.0]])
def test_reorder_refuses_bad_lists(keep):
    with pytest.raises(RecipeError):
        reorder_steps(STEPS, keep)


# ── first_failing_step ───────────────────────────────────────────────


def test_first_failing_step_names_the_step_that_lost_its_input(parquet):
    assert first_failing_step(parquet, STEPS) is None
    # Filter on c before c exists
    assert first_failing_step(parquet, reorder_steps(STEPS, [1, 3, 2])) == 2
    # c's step removed: the filter is now step 2 and breaks there
    assert first_failing_step(parquet, reorder_steps(STEPS, [1, 3])) == 2


# ── PUT /recipes/{id}/steps ──────────────────────────────────────────


def test_remove_a_step_and_save(seams):
    body = asyncio.run(recipes_route.put_recipe_steps(_request({"keep": [2, 3]}), "r1"))
    assert body["steps"] == [{"step_number": 1, "instruction": "add c"}, {"step_number": 2, "instruction": "keep big c"}]
    assert [s["sql_query"] for s in seams["steps"]] == [STEPS[1]["sql_query"], STEPS[2]["sql_query"]]
    assert "required_columns" not in seams, "the columns a recipe needs do not change on a reorder"


def test_reorder_that_breaks_the_chain_is_refused_by_name(seams):
    resp = asyncio.run(recipes_route.put_recipe_steps(_request({"keep": [1, 3, 2]}), "r1"))
    assert resp.status_code == 400
    assert b"STEPS_DO_NOT_RUN" in resp.body
    assert b"step 2 (keep big c)" in resp.body
    assert not seams, "nothing saved"


def test_reorder_without_a_source_file_is_saved_as_is(seams, monkeypatch):
    monkeypatch.setattr(db, "get_file", lambda fid, uid: None)
    body = asyncio.run(recipes_route.put_recipe_steps(_request({"keep": [3, 1, 2]}), "r1"))
    assert [s["instruction"] for s in body["steps"]] == ["keep big c", "trim", "add c"]


def test_bad_keep_list_is_a_400(seams):
    resp = asyncio.run(recipes_route.put_recipe_steps(_request({"keep": []}), "r1"))
    assert resp.status_code == 400
    assert b"INVALID_STEPS" in resp.body
    assert b"delete the recipe instead" in resp.body


def test_take_a_files_steps(seams):
    body = asyncio.run(recipes_route.put_recipe_steps(_request({"file_id": "f2"}), "r1"))
    assert body["steps"] == [{"step_number": 1, "instruction": "dedupe"}]
    assert seams["steps"][0]["sql_query"] == "SELECT DISTINCT * FROM data"
    assert seams["source_file_id"] == "f2"
    assert [c["name"] for c in seams["required_columns"]] == ["a", "b"]
    assert body["required_columns"] == ["a", "b"]


def test_unknown_file_and_recipe(seams):
    assert asyncio.run(recipes_route.put_recipe_steps(_request({"file_id": "nope"}), "r1")).status_code == 404
    assert asyncio.run(recipes_route.put_recipe_steps(_request({"keep": [1]}), "ghost")).status_code == 404


def test_nothing_to_do_is_a_400(seams):
    resp = asyncio.run(recipes_route.put_recipe_steps(_request({}), "r1"))
    assert resp.status_code == 400
    assert b"NO_FIELDS" in resp.body


def test_sql_from_the_client_is_ignored(seams):
    body = asyncio.run(recipes_route.put_recipe_steps(
        _request({"keep": [1], "steps": [{"sql_query": "DROP TABLE data"}]}), "r1"))
    assert body["steps"] == [{"step_number": 1, "instruction": "trim"}]
    assert seams["steps"][0]["sql_query"] == STEPS[0]["sql_query"]


def test_event_is_known():
    assert "recipe_steps_edited" in events.EVENTS
