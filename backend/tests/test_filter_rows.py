"""Keep or remove rows by a plain condition, with no AI."""

from __future__ import annotations

import duckdb
import pytest

from app.engine import replay_transformations_local
from app.ops import COMPARES, OpError, build_op
from app.sql_validator import validate_sql

SCHEMA = [
    {"name": "Region", "dtype": "VARCHAR"},
    {"name": "Amount", "dtype": "DOUBLE"},
    {"name": "Day", "dtype": "DATE"},
    {"name": "Email", "dtype": "VARCHAR"},
]


@pytest.fixture
def parquet(tmp_path):
    path = tmp_path / "data.parquet"
    duckdb.connect().execute(
        "COPY (SELECT Region, CAST(Amount AS DOUBLE) AS Amount, CAST(Day AS DATE) AS Day, Email FROM (VALUES "
        "('North', 10, '2026-10-01', 'ann@acme.com'), "
        "('south', -5, '2026-10-02', 'ben@other.com'), "
        "(NULL, 0, NULL, NULL), "
        "('East', 30, '2026-11-03', ''), "
        "(' North ', NULL, '2026-11-04', 'cy@acme.com')"
        ") t(Region, Amount, Day, Email)) "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return str(path)


def run(parquet, column, args):
    sql, instruction = build_op("filter_rows", SCHEMA, column, args)
    validate_sql(sql)
    out = replay_transformations_local(parquet, [{"step_number": 1, "sql_query": sql}])
    return [r["Region"] for r in out["preview"]], instruction


# ── Text ─────────────────────────────────────────────────────────────


def test_is_ignores_case_and_edges(parquet):
    regions, instruction = run(parquet, "Region", {"compare": "eq", "value": "north"})
    assert regions == ["North", " North "]
    assert instruction == "Keep rows where Region is north"


def test_is_not_keeps_the_empty_ones(parquet):
    regions, instruction = run(parquet, "Region", {"compare": "ne", "value": "North"})
    assert regions == ["south", None, "East"]
    assert instruction == "Keep rows where Region is not North"


def test_contains_starts_ends(parquet):
    assert run(parquet, "Email", {"compare": "contains", "value": "ACME"})[0] == ["North", " North "]
    assert run(parquet, "Email", {"compare": "not_contains", "value": "acme"})[0] == ["south", None, "East"]
    assert run(parquet, "Email", {"compare": "starts_with", "value": "b"})[0] == ["south"]
    assert run(parquet, "Email", {"compare": "ends_with", "value": ".com"})[0] == ["North", "south", " North "]


def test_empty_and_not_empty(parquet):
    assert run(parquet, "Email", {"compare": "empty"})[0] == [None, "East"]
    regions, instruction = run(parquet, "Email", {"compare": "not_empty"})
    assert regions == ["North", "south", " North "]
    assert instruction == "Keep rows where Email is not empty"


# ── Numbers and dates ────────────────────────────────────────────────


def test_number_comparisons(parquet):
    assert run(parquet, "Amount", {"compare": "gt", "value": "0"})[0] == ["North", "East"]
    assert run(parquet, "Amount", {"compare": "gte", "value": "0"})[0] == ["North", None, "East"]
    assert run(parquet, "Amount", {"compare": "lt", "value": "10"})[0] == ["south", None]
    regions, instruction = run(parquet, "Amount", {"compare": "lte", "value": "10"})
    assert regions == ["North", "south", None]
    assert instruction == "Keep rows where Amount <= 10"


def test_number_needs_a_number():
    with pytest.raises(OpError) as exc:
        build_op("filter_rows", SCHEMA, "Amount", {"compare": "gt", "value": "ten"})
    assert exc.value.code == "WRONG_TYPE"


def test_dates_compare_as_dates(parquet):
    regions, instruction = run(parquet, "Day", {"compare": "gte", "value": "2026-11-01"})
    assert regions == ["East", " North "]
    assert instruction == "Keep rows where Day >= 2026-11-01"
    with pytest.raises(OpError) as exc:
        build_op("filter_rows", SCHEMA, "Day", {"compare": "gt", "value": "yesterday"})
    assert exc.value.code == "WRONG_TYPE"


def test_contains_on_a_number_reads_it_as_text(parquet):
    # 30.0 is the only amount with a 3 in it
    assert run(parquet, "Amount", {"compare": "contains", "value": "3"})[0] == ["East"]


# ── Remove instead of keep ───────────────────────────────────────────


def test_remove_is_the_mirror_and_keeps_the_empty_ones(parquet):
    regions, instruction = run(parquet, "Amount", {"compare": "gt", "value": "0", "keep": False})
    assert regions == ["south", None, " North "], "an empty Amount is not > 0, so it stays"
    assert instruction == "Remove rows where Amount > 0"


# ── Refusals ─────────────────────────────────────────────────────────


def test_bad_arguments():
    for args, code in [
        ({"compare": "between", "value": "1"}, "INVALID_ARGS"),
        ({"compare": "eq"}, "INVALID_ARGS"),
        ({"compare": "eq", "value": ""}, "INVALID_ARGS"),
        ({"compare": "eq", "value": "x" * 501}, "INVALID_ARGS"),
    ]:
        with pytest.raises(OpError) as exc:
            build_op("filter_rows", SCHEMA, "Region", args)
        assert exc.value.code == code, args
    with pytest.raises(OpError) as exc:
        build_op("filter_rows", SCHEMA, "Nope", {"compare": "eq", "value": "x"})
    assert exc.value.code == "UNKNOWN_COLUMN"


def test_every_compare_has_a_phrase():
    assert set(COMPARES) == {"eq", "ne", "gt", "gte", "lt", "lte", "contains", "not_contains", "starts_with", "ends_with", "empty", "not_empty"}


def test_a_quote_in_the_value_cannot_break_out(parquet):
    regions, instruction = run(parquet, "Region", {"compare": "eq", "value": "x' OR 1=1 --"})
    assert regions == []
    assert "x' OR 1=1 --" in instruction
