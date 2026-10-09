"""Deterministic ops: SQL templates, the endpoint, undo and recipe replay."""

from __future__ import annotations

import duckdb
import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import cache, db, events, usage
from app.engine import replay_transformations_local
from app.main import app
from app.ops import DATE_FORMATS, OpError, build_op, quote_ident, quote_literal
from app.routes import transform as transform_module
from app.sql_validator import validate_sql

ROWS = """
    ('  a@x.com ', 'North', 10,   '2026-10-01', 'Ann'),
    ('b@x.com',    NULL,    NULL, '02/10/2026', 'O''Brien'),
    ('b@x.com',    NULL,    NULL, '02/10/2026', 'O''Brien'),
    ('',           'East',  30,   'Oct 03, 2026', 'Cy'),
    (NULL,         '  ',    40,   'nonsense',   'Di')
"""
COLS = "Email, Region, Amount, Date, Name"


@pytest.fixture
def parquet(tmp_path):
    path = tmp_path / "data.parquet"
    duckdb.connect().execute(
        f"COPY (SELECT Email, Region, CAST(Amount AS BIGINT) AS Amount, Date, Name "
        f"FROM (VALUES {ROWS}) t({COLS})) TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return str(path)


SCHEMA = [
    {"name": "Email", "dtype": "VARCHAR"},
    {"name": "Region", "dtype": "VARCHAR"},
    {"name": "Amount", "dtype": "BIGINT"},
    {"name": "Date", "dtype": "VARCHAR"},
    {"name": "Name", "dtype": "VARCHAR"},
]


def run(parquet, op, column=None, args=None):
    sql, instruction = build_op(op, SCHEMA, column, args)
    validate_sql(sql)  # every template must pass the same validator as AI SQL
    result = replay_transformations_local(parquet, [{"step_number": 1, "sql_query": sql}])
    return result, instruction


# ── One test per op: rows before and after ───────────────────────────


def test_trim(parquet):
    result, instruction = run(parquet, "trim", "Email")
    assert result["preview"][0]["Email"] == "a@x.com"
    assert instruction == "Trim whitespace in Email"


def test_drop_column(parquet):
    result, _ = run(parquet, "drop_column", "Name")
    assert "Name" not in result["columns"] and result["total_columns"] == 4


def test_rename_keeps_position(parquet):
    result, instruction = run(parquet, "rename", "Region", {"new_name": "Area"})
    assert result["columns"] == ["Email", "Area", "Amount", "Date", "Name"]
    assert instruction == "Rename Region to Area"


def test_fill_nulls_text_counts_blank_as_empty(parquet):
    result, _ = run(parquet, "fill_nulls", "Region", {"value": "Unknown"})
    assert [r["Region"] for r in result["preview"]] == ["North", "Unknown", "Unknown", "East", "Unknown"]


def test_fill_nulls_number(parquet):
    result, _ = run(parquet, "fill_nulls", "Amount", {"value": "0"})
    assert [r["Amount"] for r in result["preview"]] == [10, 0, 0, 30, 40]


def test_fill_number_column_with_text_is_rejected():
    with pytest.raises(OpError) as exc:
        build_op("fill_nulls", SCHEMA, "Amount", {"value": "lots"})
    assert exc.value.code == "WRONG_TYPE"


def test_drop_empty_rows(parquet):
    result, instruction = run(parquet, "drop_empty_rows", "Email")
    assert result["total_rows"] == 3  # NULL and blank text both go
    assert instruction == "Drop rows where Email is empty"


def test_drop_empty_rows_counts_blank_text(parquet):
    result, _ = run(parquet, "drop_empty_rows", "Email")
    assert [r["Name"] for r in result["preview"]] == ["Ann", "O'Brien", "O'Brien"]


def test_dedupe_all(parquet):
    result, instruction = run(parquet, "dedupe")
    assert result["total_rows"] == 4
    # First occurrence kept, file order kept
    assert [r["Name"] for r in result["preview"]] == ["Ann", "O'Brien", "Cy", "Di"]
    assert "__row" not in result["columns"]
    assert instruction == "Remove duplicate rows"


def test_dedupe_on_column(parquet):
    result, instruction = run(parquet, "dedupe", "Region")
    # NULL, North, East, '  ' are the distinct regions
    assert result["total_rows"] == 4
    assert instruction == "Remove rows with a duplicate Region"


def test_cast(parquet):
    result, instruction = run(parquet, "cast", "Amount", {"type": "VARCHAR"})
    assert result["preview"][0]["Amount"] == "10"
    assert instruction == "Change Amount to text"


def test_cast_type_not_allowed():
    with pytest.raises(OpError) as exc:
        build_op("cast", SCHEMA, "Amount", {"type": "BLOB"})
    assert exc.value.code == "INVALID_ARGS"


def test_standardise_date_with_a_format(parquet):
    result, _ = run(parquet, "standardise_date", "Date", {"format": "%d/%m/%Y"})
    assert str(result["preview"][1]["Date"]).startswith("2026-10-02")
    assert result["preview"][0]["Date"] is None  # not in that format


def test_standardise_date_auto(parquet):
    result, _ = run(parquet, "standardise_date", "Date", {"format": "auto"})
    dates = [str(r["Date"])[:10] if r["Date"] is not None else None for r in result["preview"]]
    assert dates == ["2026-10-01", "2026-10-02", "2026-10-02", "2026-10-03", None]


def test_format_not_in_allowlist_400():
    with pytest.raises(OpError) as exc:
        build_op("standardise_date", SCHEMA, "Date", {"format": "%Y'); DROP TABLE x; --"})
    assert exc.value.code == "INVALID_ARGS"


def test_sort(parquet):
    result, instruction = run(parquet, "sort", "Amount", {"direction": "desc"})
    assert [r["Amount"] for r in result["preview"]] == [40, 30, 10, None, None]
    assert instruction == "Sort all rows by Amount, descending"


def test_contains_any(parquet):
    result, _ = run(parquet, "contains_any", None, {"needle": "o'brien"})
    assert result["total_rows"] == 2


def test_value_with_quote_is_escaped_not_executed(parquet):
    sql, _ = build_op("fill_nulls", SCHEMA, "Region", {"value": "O'Brien'); DROP TABLE data; --"})
    validate_sql(sql)
    result = replay_transformations_local(parquet, [{"step_number": 1, "sql_query": sql}])
    assert result["preview"][1]["Region"] == "O'Brien'); DROP TABLE data; --"


def test_quoting_helpers():
    assert quote_ident('we"ird') == '"we""ird"'
    assert quote_literal("O'Brien") == "'O''Brien'"


def test_unknown_column():
    with pytest.raises(OpError) as exc:
        build_op("trim", SCHEMA, "Nope")
    assert exc.value.code == "UNKNOWN_COLUMN"


def test_unknown_op():
    with pytest.raises(OpError) as exc:
        build_op("explode", SCHEMA, "Email")
    assert exc.value.code == "UNKNOWN_OP"


def test_trim_needs_text():
    with pytest.raises(OpError) as exc:
        build_op("trim", SCHEMA, "Amount")
    assert exc.value.code == "WRONG_TYPE"


def test_every_date_format_is_a_strptime_format():
    for fmt in DATE_FORMATS:
        assert "'" not in fmt


# ── The endpoint ─────────────────────────────────────────────────────


class FakeLLM:
    def __init__(self):
        self.calls = 0

    def generate_sql(self, system_prompt, user_message):
        self.calls += 1
        return "SELECT * FROM data"


@pytest.fixture
def api(monkeypatch, parquet):
    """/transform/op against the parquet fixture, with an in-memory step store."""
    store: list[dict] = []
    recorded: dict[str, list] = {"usage": [], "events": []}
    file_rec = {"id": "f1", "user_id": "anonymous", "r2_key": "k", "name": "x.csv",
                "row_count": 5, "column_count": 5, "schema_json": {"columns": SCHEMA}}

    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    monkeypatch.setattr(db, "get_file", lambda fid, uid: file_rec if fid == "f1" else None)
    monkeypatch.setattr(db, "get_transformations", lambda fid: list(store))
    monkeypatch.setattr(db, "get_next_step_number", lambda fid: len(store) + 1)
    monkeypatch.setattr(db, "create_transformation", lambda **kw: store.append(kw) or kw)
    monkeypatch.setattr(db, "update_file", lambda *a, **kw: {})
    monkeypatch.setattr(db, "create_audit_entry", lambda **kw: {})
    monkeypatch.setattr(cache, "get_local_parquet", lambda key: parquet)
    monkeypatch.setattr(transform_module, "get_local_parquet", lambda key: parquet)
    monkeypatch.setattr(usage, "record", lambda uid, **c: recorded["usage"].append(c))
    monkeypatch.setattr(events, "record", lambda uid, name, **p: recorded["events"].append((name, p)))
    llm = FakeLLM()
    monkeypatch.setattr(transform_module, "get_llm", lambda: llm)
    client = TestClient(app, raise_server_exceptions=False)
    return client, store, recorded, llm


def test_op_endpoint_saves_a_step_without_ai(api):
    client, store, recorded, llm = api
    resp = client.post("/transform/op", json={"file_id": "f1", "op": "dedupe"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source"] == "op" and body["step_number"] == 1
    assert body["preview"]["total_rows"] == 4
    assert store[0]["instruction"] == "Remove duplicate rows"
    assert store[0]["explain"] == "op: dedupe"
    assert recorded["usage"] == [{"transforms": 1, "rows_processed": 4}]
    assert ("op_applied", {"op": "dedupe"}) in recorded["events"]
    assert llm.calls == 0


def test_op_endpoint_unknown_column_400(api):
    client, store, _, _ = api
    resp = client.post("/transform/op", json={"file_id": "f1", "op": "trim", "column": "Nope"})
    assert resp.status_code == 400 and resp.json()["code"] == "UNKNOWN_COLUMN"
    assert store == []


def test_op_endpoint_unknown_op_400(api):
    client, _, _, _ = api
    resp = client.post("/transform/op", json={"file_id": "f1", "op": "explode"})
    assert resp.status_code == 400 and resp.json()["code"] == "UNKNOWN_OP"


def test_op_endpoint_unknown_file_404(api):
    client, _, _, _ = api
    resp = client.post("/transform/op", json={"file_id": "nope", "op": "dedupe"})
    assert resp.status_code == 404


def test_op_steps_chain_on_the_current_schema(api):
    client, store, _, _ = api
    assert client.post("/transform/op", json={"file_id": "f1", "op": "rename", "column": "Region",
                                              "args": {"new_name": "Area"}}).status_code == 200
    # The second op sees the renamed column
    resp = client.post("/transform/op", json={"file_id": "f1", "op": "fill_nulls", "column": "Area",
                                              "args": {"value": "Unknown"}})
    assert resp.status_code == 200, resp.text
    assert len(store) == 2


def test_op_step_replays_like_any_step_and_a_recipe_needs_no_llm(api, parquet):
    client, store, _, llm = api
    client.post("/transform/op", json={"file_id": "f1", "op": "dedupe"})
    client.post("/transform/op", json={"file_id": "f1", "op": "trim", "column": "Email"})
    # A recipe is a snapshot of the step SQL: replaying it is pure DuckDB
    steps = [{"step_number": s["step_number"], "sql_query": s["sql_query"]} for s in store]
    result = replay_transformations_local(parquet, steps)
    assert result["total_rows"] == 4 and result["preview"][0]["Email"] == "a@x.com"
    # Undo is "replay one step fewer": the chain without the last step
    undone = replay_transformations_local(parquet, steps[:-1])
    assert undone["preview"][0]["Email"] == "  a@x.com "
    assert llm.calls == 0
