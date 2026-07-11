"""Tests for the DuckDB engine: CTE replay correctness, path escaping, and a
real end-to-end round-trip (no Supabase / no network — pure local DuckDB)."""

import tempfile
from pathlib import Path

import pytest

from app.engine import (
    _retarget_from_data,
    _sql_path,
    build_replay_sql,
    convert_to_parquet,
    execute_sql_from_local,
    get_schema_after_steps,
    get_schema_from_local,
    replay_transformations_local,
)


# ── Path escaping ─────────────────────────────────────────────────────

def test_sql_path_normalizes_and_escapes():
    assert _sql_path(r"C:\tmp\file.parquet") == "C:/tmp/file.parquet"
    assert _sql_path("C:/tmp/o'brien.parquet") == "C:/tmp/o''brien.parquet"


# ── CTE retargeting ───────────────────────────────────────────────────

def test_retarget_case_and_whitespace():
    assert _retarget_from_data("SELECT * from   data WHERE x=1", "step_1") == \
        "SELECT * FROM step_1 WHERE x=1"


def test_retarget_skips_string_literals():
    assert _retarget_from_data("SELECT * FROM data WHERE c = 'FROM data'", "step_1") == \
        "SELECT * FROM step_1 WHERE c = 'FROM data'"


def test_retarget_respects_word_boundary():
    # 'database_col' must not be rewritten
    assert _retarget_from_data("SELECT * FROM database_col", "step_1") == \
        "SELECT * FROM database_col"


def test_build_replay_sql_empty():
    assert build_replay_sql([]) == "SELECT * FROM data"


def test_build_replay_sql_chains_lowercase():
    sql = build_replay_sql([
        {"sql_query": "SELECT * FROM data WHERE age > 28"},
        {"sql_query": "select * from data order by age desc"},  # lowercase
    ])
    assert "step_1 AS (SELECT * FROM data WHERE age > 28)" in sql
    assert "FROM step_1" in sql            # second step retargeted
    assert sql.strip().endswith("SELECT * FROM step_2")


def test_build_replay_sql_up_to():
    steps = [
        {"sql_query": "SELECT * FROM data WHERE age > 28"},
        {"sql_query": "SELECT * FROM data ORDER BY age DESC"},
    ]
    assert build_replay_sql(steps, up_to=1).strip().endswith("SELECT * FROM step_1")


# ── Real end-to-end round-trip against local DuckDB ───────────────────

@pytest.fixture
def local_parquet():
    csv = b"name,age,city\nAlice,30,NYC\nBob,25,LA\nCharlie,35,Chicago\n"
    parquet_bytes, rows, cols = convert_to_parquet(csv, "people.csv")
    assert (rows, cols) == (3, 3)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".parquet")
    tmp.write(parquet_bytes)
    tmp.close()
    yield tmp.name
    Path(tmp.name).unlink(missing_ok=True)


def test_convert_and_schema(local_parquet):
    schema = get_schema_from_local(local_parquet)
    names = [c["name"] for c in schema["columns"]]
    assert names == ["name", "age", "city"]


def test_execute_filter(local_parquet):
    result = execute_sql_from_local(local_parquet, "SELECT * FROM data WHERE age > 28")
    assert result["total_rows"] == 2
    assert {r["name"] for r in result["preview"]} == {"Alice", "Charlie"}


def test_replay_two_steps(local_parquet):
    steps = [
        {"sql_query": "SELECT * FROM data WHERE age > 28"},
        {"sql_query": "SELECT * FROM data ORDER BY age DESC"},
    ]
    result = replay_transformations_local(local_parquet, steps)
    assert [r["name"] for r in result["preview"]] == ["Charlie", "Alice"]


def test_preview_limit(local_parquet):
    result = execute_sql_from_local(local_parquet, "SELECT * FROM data", preview_limit=2)
    assert result["total_rows"] == 3          # full count
    assert len(result["preview"]) == 2        # capped preview


# ── Schema after steps (regression: dtypes were hardcoded to VARCHAR) ──

def test_schema_after_steps_no_steps_falls_back(local_parquet):
    schema = get_schema_after_steps(local_parquet, [])
    names = [c["name"] for c in schema["columns"]]
    assert names == ["name", "age", "city"]


def test_schema_after_steps_keeps_real_dtypes(local_parquet):
    steps = [{"sql_query": "SELECT * FROM data WHERE age > 28"}]
    schema = get_schema_after_steps(local_parquet, steps)
    dtypes = {c["name"]: c["dtype"] for c in schema["columns"]}
    assert dtypes["age"] == "BIGINT"        # was reported as VARCHAR before the fix
    assert dtypes["name"] == "VARCHAR"
    assert schema["samples"]                # samples present, not []


def test_schema_after_steps_computed_column_typed(local_parquet):
    steps = [{"sql_query": "SELECT *, (age * 2) AS double_age FROM data"}]
    schema = get_schema_after_steps(local_parquet, steps)
    dtypes = {c["name"]: c["dtype"] for c in schema["columns"]}
    assert "double_age" in dtypes
    assert dtypes["double_age"] != "VARCHAR"    # numeric expression stays numeric


def test_schema_after_steps_reflects_dropped_columns(local_parquet):
    steps = [{"sql_query": "SELECT name, age FROM data"}]
    schema = get_schema_after_steps(local_parquet, steps)
    assert [c["name"] for c in schema["columns"]] == ["name", "age"]
