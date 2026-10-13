"""Clean numbers: money-ish text read as numbers with no AI, what it loses
said out loud, and the upload suggestion that offers it."""

from __future__ import annotations

import duckdb
import pytest

from app import db
from app.engine import replay_transformations_local, values_lost_by
from app.insights import generate_insights
from app.ops import OpError, build_op, number_expr, quote_ident
from app.routes import transform as transform_module
from app.sql_validator import validate_sql

SCHEMA = [{"name": "Amount", "dtype": "VARCHAR"}, {"name": "Note", "dtype": "VARCHAR"}, {"name": "Qty", "dtype": "BIGINT"}]


def _parquet(tmp_path, amounts: list[str | None]) -> str:
    path = tmp_path / "data.parquet"
    rows = ", ".join(
        f"({'NULL' if a is None else repr(a)}, 'n', 1)" for a in amounts
    )
    duckdb.connect().execute(
        f"COPY (SELECT * FROM (VALUES {rows}) t(Amount, Note, Qty)) "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return str(path)


def _clean(tmp_path, amounts, args=None):
    path = _parquet(tmp_path, amounts)
    sql, instruction = build_op("clean_number", SCHEMA, "Amount", args)
    validate_sql(sql)
    out = replay_transformations_local(path, [{"step_number": 1, "sql_query": sql}])
    return path, [r["Amount"] for r in out["preview"]], instruction


# ── The op ───────────────────────────────────────────────────────────


def test_reads_money_as_people_write_it(tmp_path):
    _, values, instruction = _clean(tmp_path, ["$1,234.50", "(12)", "12%", "  7 ", "-3.5", "1e3", "", None, "₹ 2,00,000"])
    assert values == [1234.5, -12.0, 12.0, 7.0, -3.5, 1000.0, None, None, 200000.0]
    assert instruction == "Clean numbers in Amount"


def test_decimal_comma(tmp_path):
    _, values, instruction = _clean(tmp_path, ["1.234,50", "€ 1 234,5", "12"], {"decimal": "comma"})
    assert values == [1234.5, 1234.5, 12.0]
    assert instruction == "Clean numbers in Amount (decimal comma)"


def test_text_that_is_not_a_number_becomes_empty(tmp_path):
    _, values, _ = _clean(tmp_path, ["N/A", "12", "TBD", "12-5"])
    assert values == [None, 12.0, None, None]


def test_number_column_is_refused():
    with pytest.raises(OpError) as exc:
        build_op("clean_number", SCHEMA, "Qty")
    assert exc.value.code == "WRONG_TYPE"


def test_bad_decimal_is_refused():
    with pytest.raises(OpError) as exc:
        build_op("clean_number", SCHEMA, "Amount", {"decimal": "space"})
    assert exc.value.code == "INVALID_ARGS"


# ── What was lost ────────────────────────────────────────────────────


def test_counts_and_shows_what_could_not_be_read(tmp_path):
    path = _parquet(tmp_path, ["N/A", "12", "TBD", "N/A", "", None, "$5"])
    lost = values_lost_by(path, [], "Amount", number_expr(quote_ident("Amount")))
    assert lost["count"] == 3, "blank and NULL were never values; N/A twice and TBD once"
    assert sorted(lost["examples"]) == ["N/A", "TBD"]


def test_nothing_lost_when_everything_reads(tmp_path):
    path = _parquet(tmp_path, ["1", "$2", "(3)"])
    assert values_lost_by(path, [], "Amount", number_expr(quote_ident("Amount"))) == {"count": 0, "examples": []}


def test_route_warns_when_values_are_lost(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    import app.main as main_module
    from app import cache, events, usage
    from app.main import app

    path = _parquet(tmp_path, ["N/A", "$12", "TBD"])
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    monkeypatch.setattr(usage, "record", lambda *a, **kw: None)
    recorded = []
    monkeypatch.setattr(events, "record", lambda uid, ev, **props: recorded.append((ev, props)))
    monkeypatch.setattr(db, "get_file", lambda fid, uid: {"id": fid, "user_id": uid, "r2_key": "k", "name": "d.csv", "row_count": 3, "column_count": 3, "schema_json": {"columns": SCHEMA}})
    monkeypatch.setattr(db, "get_transformations", lambda fid: [])
    monkeypatch.setattr(db, "get_next_step_number", lambda fid: 1)
    monkeypatch.setattr(db, "create_transformation", lambda **kw: {})
    monkeypatch.setattr(db, "update_file", lambda *a, **kw: {})
    monkeypatch.setattr(db, "create_audit_entry", lambda **kw: {})
    monkeypatch.setattr(cache, "get_local_parquet", lambda key: path)
    monkeypatch.setattr(transform_module, "get_local_parquet", lambda key: path)

    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post("/transform/op", json={"file_id": "f1", "op": "clean_number", "column": "Amount"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["preview"]["rows"][1]["Amount"] == 12.0
    w = body["warning"]
    assert w["code"] == "VALUES_LOST" and w["column"] == "Amount" and w["count"] == 2
    assert w["message"] == "2 values in Amount couldn't be read as numbers and are now empty, like “N/A”, “TBD”."
    assert w["fix"] is None
    assert ("clean_number_lost", {"count": 2}) in recorded

    # Clean again on the cleaned column: it is a number now, so the op refuses
    resp = client.post("/transform/op", json={"file_id": "f1", "op": "clean_number", "column": "Qty"})
    assert resp.status_code == 400 and resp.json()["code"] == "WRONG_TYPE"


# ── The upload suggestion ────────────────────────────────────────────


def _suggestions(tmp_path, col: str, values: list[str]) -> list[dict]:
    path = tmp_path / "s.parquet"
    rows = ", ".join(f"({repr(v)}, {i})" for i, v in enumerate(values))
    duckdb.connect().execute(
        f"COPY (SELECT * FROM (VALUES {rows}) t({quote_ident(col)}, n)) "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return [s for s in generate_insights(path)["suggestions"] if "numbers" in s["text"]]


def test_money_text_is_offered_a_clean(tmp_path):
    [s] = _suggestions(tmp_path, "Amount", ["$1,234.50", "$99", "(12)", "12%", "7"])
    assert s == {
        "text": "Clean numbers in Amount",
        "instruction": "clean numbers in Amount",
        "detail": "4 written with a currency sign, separators or brackets",
    }


def test_plain_digits_are_left_alone(tmp_path):
    # Could be codes with leading zeros; and Change type to number reads them already
    assert _suggestions(tmp_path, "Amount", ["00123", "00456", "789"]) == []


def test_identifier_columns_are_never_offered(tmp_path):
    assert _suggestions(tmp_path, "Order ID", ["1,001", "1,002", "1,003"]) == []
    assert _suggestions(tmp_path, "Phone", ["+91 98765", "+91 12345"]) == []


def test_mostly_words_is_not_a_number_column(tmp_path):
    assert _suggestions(tmp_path, "Amount", ["$5", "five", "lots", "none"]) == []
