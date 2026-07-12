"""Tests for recipe logic: snapshotting, validation, renumbering, and a real
end-to-end apply against local DuckDB (no Supabase / no network)."""

import tempfile
from pathlib import Path

import pytest

from app import usage
from app.engine import convert_to_parquet, replay_transformations_local
from app.recipes import (
    RecipeError,
    missing_columns,
    renumber_after,
    snapshot_steps,
    validate_recipe_steps,
)


# ── recipe limit by tier (the Pro gate) ───────────────────────────────

def test_recipe_limit_free_is_capped(monkeypatch):
    monkeypatch.setattr(usage.db, "get_subscription", lambda uid: None)  # free
    assert usage.recipe_limit("u") == 1


def test_recipe_limit_pro_is_unlimited(monkeypatch):
    monkeypatch.setattr(usage.db, "get_subscription", lambda uid: {"tier": "pro"})
    assert usage.recipe_limit("u") == 0  # 0 = unlimited


# ── snapshot_steps ────────────────────────────────────────────────────

def test_snapshot_empty_chain_rejected():
    with pytest.raises(RecipeError):
        snapshot_steps([])


def test_snapshot_orders_and_renumbers():
    steps = [
        {"step_number": 7, "instruction": "b", "sql_query": "SELECT 2"},
        {"step_number": 3, "instruction": "a", "sql_query": "SELECT 1"},
    ]
    snap = snapshot_steps(steps)
    assert [s["step_number"] for s in snap] == [1, 2]
    assert [s["instruction"] for s in snap] == ["a", "b"]  # sorted by original order


def test_snapshot_keeps_only_replay_fields():
    snap = snapshot_steps([
        {"step_number": 1, "instruction": "x", "sql_query": "SELECT 1",
         "id": "uuid", "created_at": "...", "row_count_after": 9},
    ])
    assert set(snap[0].keys()) == {"step_number", "instruction", "sql_query"}


# ── validate_recipe_steps ─────────────────────────────────────────────

def test_validate_accepts_clean_steps():
    steps = [{"step_number": 1, "instruction": "f", "sql_query": "SELECT * FROM data"}]
    assert validate_recipe_steps(steps)[0]["sql_query"] == "SELECT * FROM data"


def test_validate_rejects_hostile_stored_sql():
    # A stored step must be re-checked with the CURRENT validator on apply
    steps = [{"step_number": 1, "instruction": "x",
              "sql_query": "SELECT * FROM read_csv('/etc/passwd')"}]
    with pytest.raises(RecipeError) as exc:
        validate_recipe_steps(steps)
    assert "step 1" in str(exc.value)


def test_validate_rejects_empty_recipe():
    with pytest.raises(RecipeError):
        validate_recipe_steps([])


# ── renumber_after / missing_columns ─────────────────────────────────

def test_renumber_appends_after_existing():
    steps = [{"step_number": 1, "sql_query": "SELECT 1"},
             {"step_number": 2, "sql_query": "SELECT 2"}]
    out = renumber_after(steps, existing_count=3)
    assert [s["step_number"] for s in out] == [4, 5]


def test_missing_columns_case_insensitive():
    required = [{"name": "Age", "dtype": "BIGINT"}, {"name": "city", "dtype": "VARCHAR"}]
    assert missing_columns(required, ["age", "name"]) == ["city"]
    assert missing_columns(required, ["AGE", "CITY"]) == []


# ── End-to-end: save from one file, apply to another ─────────────────

def _write_parquet(csv: bytes, name: str) -> str:
    parquet_bytes, _, _ = convert_to_parquet(csv, name)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".parquet")
    tmp.write(parquet_bytes)
    tmp.close()
    return tmp.name


@pytest.fixture
def source_and_target():
    src = _write_parquet(
        b"name,age,city\nAlice,30,NYC\nBob,25,LA\nCharlie,35,Chicago\n", "src.csv"
    )
    # Same columns, different data — the recurring-export scenario
    tgt = _write_parquet(
        b"name,age,city\nDana,40,SF\nEve,22,NYC\nFrank,31,LA\nGrace,29,SEA\n", "tgt.csv"
    )
    yield src, tgt
    Path(src).unlink(missing_ok=True)
    Path(tgt).unlink(missing_ok=True)


def test_recipe_applies_to_new_file(source_and_target):
    _, tgt = source_and_target
    # Recipe captured from the source file's chain
    recipe_steps = snapshot_steps([
        {"step_number": 1, "instruction": "keep age > 28",
         "sql_query": "SELECT * FROM data WHERE age > 28"},
        {"step_number": 2, "instruction": "sort by age desc",
         "sql_query": "SELECT * FROM data ORDER BY age DESC"},
    ])
    validated = validate_recipe_steps(recipe_steps)
    combined = renumber_after(validated, existing_count=0)

    result = replay_transformations_local(tgt, combined)
    assert [r["name"] for r in result["preview"]] == ["Dana", "Frank", "Grace"]


def test_recipe_appends_after_existing_steps(source_and_target):
    _, tgt = source_and_target
    existing = [{"step_number": 1, "instruction": "no SF",
                 "sql_query": "SELECT * FROM data WHERE city != 'SF'"}]
    recipe = renumber_after(
        [{"step_number": 1, "instruction": "keep age > 28",
          "sql_query": "SELECT * FROM data WHERE age > 28"}],
        existing_count=len(existing),
    )
    result = replay_transformations_local(tgt, existing + recipe)
    assert {r["name"] for r in result["preview"]} == {"Frank", "Grace"}


def test_recipe_incompatible_schema_fails_explain(source_and_target):
    _, tgt = source_and_target
    bad = [{"step_number": 1, "instruction": "x",
            "sql_query": "SELECT * FROM data WHERE revenue > 100"}]  # no such column
    with pytest.raises(Exception):
        replay_transformations_local(tgt, bad)

# ── PATCH /recipes/{id} (rename / description) ───────────────────────

import asyncio
import json as _json
import types as _types

from app.routes import recipes as recipes_route


def _patch_request(body: dict | str, user_id: str = "u1"):
    async def _json_body():
        if isinstance(body, str):
            raise ValueError("not json")
        return body
    return _types.SimpleNamespace(
        state=_types.SimpleNamespace(user_id=user_id),
        json=_json_body,
    )


def _run_patch(body, monkeypatch_db_result, recipe_id="r1"):
    return asyncio.run(recipes_route.update_recipe(_patch_request(body), recipe_id))


def test_patch_renames_recipe(monkeypatch):
    captured = {}

    def _update(recipe_id, user_id, **updates):
        captured.update(recipe=recipe_id, user=user_id, **updates)
        return {"id": recipe_id, "name": updates.get("name", "old"),
                "description": updates.get("description"), "source_file_id": "f1"}

    monkeypatch.setattr(recipes_route.db, "update_recipe", _update)
    monkeypatch.setattr(recipes_route.db, "create_audit_entry", lambda **kw: {})

    resp = asyncio.run(
        recipes_route.update_recipe(_patch_request({"name": "  Better name  "}), "r1")
    )
    assert resp["name"] == "Better name"
    assert captured["name"] == "Better name"
    assert captured["user"] == "u1"


def test_patch_updates_description_only(monkeypatch):
    captured = {}

    def _update(recipe_id, user_id, **updates):
        captured.update(updates)
        return {"id": recipe_id, "name": "kept", "description": updates["description"]}

    monkeypatch.setattr(recipes_route.db, "update_recipe", _update)
    monkeypatch.setattr(recipes_route.db, "create_audit_entry", lambda **kw: {})

    resp = asyncio.run(
        recipes_route.update_recipe(_patch_request({"description": "monthly run"}), "r1")
    )
    assert resp["description"] == "monthly run"
    assert "name" not in captured


def test_patch_empty_name_rejected(monkeypatch):
    monkeypatch.setattr(
        recipes_route.db, "update_recipe",
        lambda *a, **kw: pytest.fail("db should not be touched"),
    )
    resp = asyncio.run(
        recipes_route.update_recipe(_patch_request({"name": "   "}), "r1")
    )
    assert resp.status_code == 400
    assert _json.loads(resp.body)["code"] == "MISSING_NAME"


def test_patch_name_too_long_rejected(monkeypatch):
    monkeypatch.setattr(
        recipes_route.db, "update_recipe",
        lambda *a, **kw: pytest.fail("db should not be touched"),
    )
    resp = asyncio.run(
        recipes_route.update_recipe(_patch_request({"name": "x" * 121}), "r1")
    )
    assert resp.status_code == 400
    assert _json.loads(resp.body)["code"] == "NAME_TOO_LONG"


def test_patch_no_fields_rejected(monkeypatch):
    monkeypatch.setattr(
        recipes_route.db, "update_recipe",
        lambda *a, **kw: pytest.fail("db should not be touched"),
    )
    resp = asyncio.run(recipes_route.update_recipe(_patch_request({}), "r1"))
    assert resp.status_code == 400
    assert _json.loads(resp.body)["code"] == "NO_FIELDS"


def test_patch_unknown_recipe_404(monkeypatch):
    monkeypatch.setattr(recipes_route.db, "update_recipe", lambda *a, **kw: None)
    resp = asyncio.run(
        recipes_route.update_recipe(_patch_request({"name": "n"}), "ghost")
    )
    assert resp.status_code == 404
    assert _json.loads(resp.body)["code"] == "RECIPE_NOT_FOUND"


def test_patch_blank_description_clears_it(monkeypatch):
    captured = {}

    def _update(recipe_id, user_id, **updates):
        captured.update(updates)
        return {"id": recipe_id, "name": "kept", "description": None}

    monkeypatch.setattr(recipes_route.db, "update_recipe", _update)
    monkeypatch.setattr(recipes_route.db, "create_audit_entry", lambda **kw: {})

    asyncio.run(
        recipes_route.update_recipe(_patch_request({"description": "  "}), "r1")
    )
    assert captured["description"] is None
