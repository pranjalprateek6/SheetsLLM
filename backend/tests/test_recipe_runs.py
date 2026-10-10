"""Recipe runs: matching a renamed column, checks, and the run report.

Pure functions first, then POST /recipes/{id}/apply end to end against
local DuckDB with the database mocked (no Supabase, no network)."""

from __future__ import annotations

import asyncio
import json
import tempfile
from pathlib import Path

import pytest

from app.engine import convert_to_parquet
from app.recipe_runs import (
    check_label,
    mapping_step,
    remembered_columns,
    step_report,
    suggest_mapping,
    validate_checks,
)
from app.recipes import RecipeError
from app.routes import recipes as recipes_route

# ── suggest_mapping ───────────────────────────────────────────────────


def test_suggests_the_renamed_column():
    got = suggest_mapping(["Customer Email"], ["Order ID", "Email", "Region"], ["Order ID", "Customer Email", "Region"])
    assert got == {"Customer Email": "Email"}


def test_same_words_in_another_style_match():
    assert suggest_mapping(["Order Date"], ["order_date", "Region"], ["Order Date", "Region"]) == {"Order Date": "order_date"}


def test_no_guess_when_nothing_is_close():
    assert suggest_mapping(["Customer Email"], ["Order ID", "Status"], ["Order ID", "Status", "Customer Email"]) == {}


def test_a_column_the_recipe_already_uses_is_not_offered():
    # Region is the recipe's own column, so it cannot stand in for "Regions"
    assert suggest_mapping(["Regions"], ["Region"], ["Region", "Regions"]) == {}


# ── mapping_step ──────────────────────────────────────────────────────


def test_mapping_step_renames_to_the_recipe_names():
    step = mapping_step({"Customer Email": "Email"}, ["Order ID", "Email"], ["Order ID", "Customer Email"])
    assert step["sql_query"] == 'SELECT * RENAME ("Email" AS "Customer Email") FROM data'
    assert step["instruction"] == "Match columns: Email as Customer Email"


@pytest.mark.parametrize("column_map, why", [
    ({"Nope": "Email"}, "does not use"),
    ({"Customer Email": "Missing"}, "no column called"),
    ({"Order ID": "Email"}, "already has"),
    ({}, "Pick a column"),
])
def test_mapping_step_refuses_a_bad_match(column_map, why):
    with pytest.raises(RecipeError, match=why):
        mapping_step(column_map, ["Order ID", "Email"], ["Order ID", "Customer Email"])


def test_a_quote_in_a_name_stays_a_name():
    step = mapping_step({'a"b': 'c"d'}, ['c"d'], ['a"b'])
    assert step["sql_query"] == 'SELECT * RENAME ("c""d" AS "a""b") FROM data'


def test_remembered_columns_take_the_new_names():
    required = [{"name": "Order ID", "dtype": "VARCHAR"}, {"name": "Customer Email", "dtype": "VARCHAR"}]
    assert remembered_columns(required, {"Customer Email": "Email"}) == [
        {"name": "Order ID", "dtype": "VARCHAR"}, {"name": "Email", "dtype": "VARCHAR"},
    ]


# ── checks ────────────────────────────────────────────────────────────


def test_checks_normalise():
    got = validate_checks([
        {"type": "unique", "column": "Order ID"},
        {"type": "at_least", "column": "MRP", "value": 0},
        {"type": "one_of", "column": "Region", "value": [" North", "South "]},
    ])
    assert got[2]["value"] == ["North", "South"]
    assert [check_label(c) for c in got] == [
        "Order ID is unique", "MRP is at least 0", "Region is one of North, South",
    ]


@pytest.mark.parametrize("bad", [
    [{"type": "bogus", "column": "a"}],
    [{"type": "unique"}],
    [{"type": "at_least", "column": "a", "value": "5"}],
    [{"type": "at_least", "column": "a", "value": True}],
    [{"type": "one_of", "column": "a", "value": []}],
    "not a list",
])
def test_bad_checks_are_refused(bad):
    with pytest.raises(RecipeError):
        validate_checks(bad)


# ── step_report ───────────────────────────────────────────────────────


def test_report_flags_a_step_that_changed_a_lot_more_than_last_time():
    rows = step_report(["dedupe", "drop empty"], [1000, 990, 500], [1000, 990, 780])
    assert rows[0]["flag"] is None and rows[0]["change_pct"] == -1.0
    assert rows[1]["change_pct"] == -49.5 and rows[1]["last_change_pct"] == -21.2
    assert rows[1]["flag"] == "Changed 49.5% of rows, 21.2% last time"


def test_report_flags_a_step_that_left_no_rows():
    assert step_report(["filter"], [10, 0], None)[0]["flag"] == "Left no rows"


def test_report_without_a_comparable_baseline_has_no_last_time():
    rows = step_report(["a", "b"], [10, 9, 8], [10, 9])  # different length
    assert all(r["last_change_pct"] is None and r["flag"] is None for r in rows)


# ── POST /recipes/{id}/apply, end to end ──────────────────────────────


def _parquet(csv: bytes) -> str:
    data, _, _ = convert_to_parquet(csv, "x.csv")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".parquet")
    tmp.write(data)
    tmp.close()
    return tmp.name


OCT = b"Order ID,Customer Email,Region,MRP\n1,a@x,north,10\n1,a@x,north,10\n2,b@x,,20\n3,c@x,East,-5\n"
NOV_RENAMED = b"Order ID,Email,Region,MRP\n7,a@x,north,10\n8,b@x,West,20\n8,b@x,West,20\n"

RECIPE_STEPS = [
    {"step_number": 1, "instruction": "Remove duplicate rows", "sql_query": "SELECT DISTINCT * FROM data"},
    {"step_number": 2, "instruction": "Keep the email", "sql_query": 'SELECT "Order ID", "Customer Email", "Region", "MRP" FROM data'},
]
REQUIRED = [{"name": n, "dtype": "VARCHAR"} for n in ("Order ID", "Customer Email", "Region", "MRP")]


class _Req:
    def __init__(self, body):
        self._body = body
        self.state = type("S", (), {"user_id": "u1"})()

    async def json(self):
        return self._body


@pytest.fixture
def run(monkeypatch):
    """Apply the recipe to a file; returns (call, captured)."""
    captured: dict = {"steps": [], "audit": [], "updates": [], "events": []}
    paths: list[str] = []

    def setup(csv, *, recipe_extra=None, last_run=None, file_columns=None):
        path = _parquet(csv)
        paths.append(path)
        cols = file_columns or csv.split(b"\n")[0].decode().split(",")
        recipe = {"id": "r1", "name": "Monthly", "steps": RECIPE_STEPS, "required_columns": REQUIRED,
                  "source_file_id": None, **(recipe_extra or {})}
        m = monkeypatch.setattr
        m(recipes_route.db, "get_recipe", lambda rid, uid: recipe)
        m(recipes_route.db, "get_file", lambda fid, uid: {"id": fid, "r2_key": "k",
                                                          "schema_json": {"columns": [{"name": c} for c in cols]}})
        m(recipes_route.db, "get_transformations", lambda fid: [])
        m(recipes_route.db, "create_transformation", lambda **kw: captured["steps"].append(kw) or kw)
        m(recipes_route.db, "update_file", lambda *a, **kw: {})
        m(recipes_route.db, "update_recipe", lambda rid, uid, **kw: captured["updates"].append(kw) or kw)
        m(recipes_route.db, "create_audit_entry", lambda **kw: captured["audit"].append(kw) or kw)
        m(recipes_route.db, "last_recipe_run", lambda uid, rid: last_run)
        m(recipes_route.db, "file_names", lambda ids: {i: "orders_oct.csv" for i in ids})
        m(recipes_route.events, "record", lambda uid, name, **p: captured["events"].append(name))
        m(recipes_route.usage, "record", lambda *a, **kw: None)
        m(recipes_route, "get_local_parquet", lambda key: path)

    def call(body):
        resp = asyncio.run(recipes_route.apply_recipe(_Req({"file_id": "f2", **body}), "r1"))
        if hasattr(resp, "body"):
            return resp.status_code, json.loads(resp.body)
        return 200, resp

    yield setup, call, captured
    for p in paths:
        Path(p).unlink(missing_ok=True)


def test_a_renamed_column_comes_back_with_a_suggested_match(run):
    setup, call, captured = run
    setup(NOV_RENAMED)
    status, body = call({})
    assert status == 400 and body["code"] == "RECIPE_INCOMPATIBLE"
    assert body["missing"] == ["Customer Email"]
    assert body["suggested_map"] == {"Customer Email": "Email"}
    assert "Email" in body["file_columns"]
    # A clean message, not the database's error text
    assert body["message"] == "This file is missing columns the recipe needs: Customer Email."
    assert captured["steps"] == []


def test_running_with_the_match_keeps_the_recipe_names(run):
    setup, call, captured = run
    setup(NOV_RENAMED)
    status, body = call({"column_map": {"Customer Email": "Email"}})
    assert status == 200, body
    assert body["preview"]["columns"] == ["Order ID", "Customer Email", "Region", "MRP"]
    assert body["steps_added"] == 3 and body["matched"] == {"Customer Email": "Email"}
    assert captured["steps"][0]["instruction"] == "Match columns: Email as Customer Email"
    assert body["remembered"] is False and captured["updates"] == []
    # Saved for next time aligned with the recipe as it stands (no match step)
    assert captured["audit"][0]["metadata"]["counts"] == [3, 2, 2]
    assert "recipe_columns_matched" in captured["events"]


def test_remembering_the_match_updates_the_recipe(run):
    setup, call, captured = run
    setup(NOV_RENAMED)
    status, body = call({"column_map": {"Customer Email": "Email"}, "remember": True})
    assert status == 200 and body["remembered"] is True
    [update] = captured["updates"]
    assert update["steps"][0]["instruction"] == "Match columns: Email as Customer Email"
    assert [s["step_number"] for s in update["steps"]] == [1, 2, 3]
    assert {"name": "Email", "dtype": "VARCHAR"} in update["required_columns"]
    assert captured["audit"][0]["metadata"]["counts"] == [3, 3, 2, 2]


def test_the_report_compares_each_step_with_the_last_run(run):
    setup, call, _ = run
    setup(OCT, last_run={"file_id": "f1", "metadata": {"counts": [100, 100, 100]}})
    status, body = call({})
    assert status == 200, body
    report = body["report"]
    assert report["compared_with"] == {"kind": "last_run", "file_name": "orders_oct.csv"}
    dedupe = report["steps"][0]
    assert (dedupe["rows_before"], dedupe["rows_after"]) == (4, 3)
    assert dedupe["change_pct"] == -25.0 and dedupe["last_change_pct"] == 0.0
    assert dedupe["flag"] == "Changed 25% of rows, 0% last time"
    assert report["flagged"] == 1
    # Each step keeps the rows it left, not only the last one
    assert [s["row_count_after"] for s in run[2]["steps"]] == [3, 3]


def test_checks_are_counted_on_the_cleaned_rows(run):
    setup, call, _ = run
    checks = [
        {"type": "unique", "column": "Order ID"},
        {"type": "not_empty", "column": "Region"},
        {"type": "at_least", "column": "MRP", "value": 0},
        {"type": "one_of", "column": "Region", "value": ["north", "East"]},
        {"type": "unique", "column": "Gone"},
    ]
    setup(OCT, recipe_extra={"checks": checks})
    status, body = call({})
    assert status == 200, body
    got = {(c["label"]): (c["failed"], c["ok"]) for c in body["checks"]}
    assert got["Order ID is unique"] == (0, True)            # the duplicate went in step 1
    assert got["Region is never empty"] == (1, False)
    assert got["MRP is at least 0"] == (1, False)            # the -5
    assert got["Region is one of north, East"] == (0, True)  # empty cells are not_empty's job
    gone = [c for c in body["checks"] if c["column"] == "Gone"][0]
    assert gone["column_missing"] is True and gone["failed"] is None
