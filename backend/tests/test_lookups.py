"""A second table beside the file: linked under an alias, seen by every
query of the request, joined without AI, carried by a recipe."""

from __future__ import annotations

import types

import duckdb
import pytest

from app import db, events, lookups
from app.engine import get_connection, replay_transformations_local
from app.llm.prompts import build_user_message, sent_receipt
from app.lookups import LookupError, LookupView, aliases_in, check_alias, required_for, suggest_alias
from app.ops import OpError, build_op, unmatched_sql
from app.routes import files as files_route
from app.routes import recipes as recipes_route
from app.sql_validator import validate_sql


def _parquet(tmp_path, name, sql):
    path = tmp_path / f"{name}.parquet"
    duckdb.connect().execute(f"COPY ({sql}) TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)")
    return str(path)


@pytest.fixture
def orders(tmp_path):
    return _parquet(tmp_path, "orders", "SELECT * FROM (VALUES ('North', 10), ('south ', 20), ('East', 30), (NULL, 40)) t(Region, MRP)")


@pytest.fixture
def managers(tmp_path):
    return _parquet(tmp_path, "managers", "SELECT * FROM (VALUES ('North', 'Ann', 'A'), ('South', 'Ben', 'B'), ('South', 'Old', 'Z'), ('West', 'Cy', 'C')) t(Region, Manager, Code)")


@pytest.fixture(autouse=True)
def _no_lookups():
    lookups.clear()
    yield
    lookups.clear()


# ── Aliases ──────────────────────────────────────────────────────────


def test_alias_rules():
    assert check_alias(" Managers ") == "managers"
    for bad in ("", "1abc", "my table", "data", "raw", "step_1", "x" * 31, "drop;"):
        with pytest.raises(LookupError):
            check_alias(bad)
    assert suggest_alias("Region Managers.xlsx") == "region_managers"
    assert suggest_alias("2026.csv") == "t_2026"
    assert suggest_alias("managers.csv", {"managers"}) == "managers_2"


# ── The views ────────────────────────────────────────────────────────


def test_every_connection_of_the_request_sees_the_lookup(orders, managers):
    lookups.set_current({"managers": LookupView("managers", "lf", "managers.csv", managers, [])})
    con = get_connection(read=(orders,))
    assert con.execute("SELECT COUNT(*) FROM managers").fetchone()[0] == 4
    # Through the timeout worker too, and inside a replay
    out = replay_transformations_local(orders, [{"step_number": 1, "sql_query": "SELECT d.*, m.Manager FROM data d LEFT JOIN managers m ON lower(trim(d.Region)) = lower(trim(m.Region))"}])
    assert out["total_rows"] == 5, "a naive join fans out on South; the op below does not"


def test_a_lookup_as_its_own_steps_left_it(orders, managers):
    lookups.set_current({"managers": LookupView("managers", "lf", "m.csv", managers, [{"step_number": 1, "sql_query": "SELECT * FROM data WHERE Code <> 'Z'"}])})
    con = get_connection()
    assert con.execute("SELECT COUNT(*) FROM managers").fetchone()[0] == 3


def test_without_lookups_nothing_extra_is_readable(orders, managers):
    con = get_connection(read=(orders,))
    with pytest.raises(Exception):
        con.execute(f"SELECT * FROM read_parquet('{managers.replace(chr(92), '/')}')")


# ── The join op ──────────────────────────────────────────────────────

SCHEMA = [{"name": "Region", "dtype": "VARCHAR"}, {"name": "MRP", "dtype": "BIGINT"}]
LOOKUPS = {"managers": [{"name": "Region", "dtype": "VARCHAR"}, {"name": "Manager", "dtype": "VARCHAR"}, {"name": "Code", "dtype": "VARCHAR"}]}


def test_join_keeps_every_row_matches_loosely_and_takes_one_match(orders, managers):
    lookups.set_current({"managers": LookupView("managers", "lf", "m.csv", managers, [])})
    sql, instruction = build_op("join_lookup", SCHEMA, "Region", {"alias": "managers", "take": ["Manager"]}, lookups=LOOKUPS)
    validate_sql(sql)
    assert instruction == "Add Manager from managers, matched on Region"
    out = replay_transformations_local(orders, [{"step_number": 1, "sql_query": sql}])
    assert out["total_rows"] == 4, "every row of the file, once"
    assert out["columns"] == ["Region", "MRP", "Manager"]
    by = {r["Region"]: r["Manager"] for r in out["preview"]}
    assert by["North"] == "Ann"
    assert by["south "] in ("Ben", "Old"), "case and spaces ignored, one match kept"
    assert by["East"] is None and by[None] is None


def test_join_renames_a_clash_and_can_match_different_key_names(orders, managers):
    lookups.set_current({"managers": LookupView("managers", "lf", "m.csv", managers, [])})
    sql, instruction = build_op("join_lookup", SCHEMA, "Region", {"alias": "managers", "lookup_on": "Region", "take": ["Region", "Code"]}, lookups=LOOKUPS)
    out = replay_transformations_local(orders, [{"step_number": 1, "sql_query": sql}])
    assert out["columns"] == ["Region", "MRP", "Region (managers)", "Code"]
    assert instruction == "Add Region, Code from managers, matched on Region"


def test_join_refusals():
    with pytest.raises(OpError) as exc:
        build_op("join_lookup", SCHEMA, "Region", {"alias": "nope"}, lookups=LOOKUPS)
    assert exc.value.code == "UNKNOWN_LOOKUP"
    with pytest.raises(OpError) as exc:
        build_op("join_lookup", SCHEMA, "Region", {"alias": "managers", "take": ["Salary"]}, lookups=LOOKUPS)
    assert exc.value.code == "UNKNOWN_COLUMN"
    with pytest.raises(OpError) as exc:
        build_op("join_lookup", SCHEMA, "Nope", {"alias": "managers"}, lookups=LOOKUPS)
    assert exc.value.code == "UNKNOWN_COLUMN"


def test_unmatched_count(orders, managers):
    from app.engine import count_on_current

    lookups.set_current({"managers": LookupView("managers", "lf", "m.csv", managers, [])})
    assert count_on_current(orders, [], unmatched_sql("Region", "managers", "Region")) == 2, "East and the empty one"


# ── What the model is told ───────────────────────────────────────────


def test_prompt_lists_the_other_tables_names_and_types_only():
    schema = {"columns": [{"name": "Region", "dtype": "VARCHAR", "sample_values": ["North"]}], "samples": [["North"]]}
    msg = build_user_message("add the manager", schema, privacy_mode=True, lookups=LOOKUPS)
    assert "Other tables you may JOIN" in msg and "managers: Region (VARCHAR), Manager (VARCHAR), Code (VARCHAR)" in msg
    assert "Ann" not in msg
    assert "Sample rows" not in msg
    receipt = sent_receipt(schema, privacy_mode=True, lookups=LOOKUPS)
    assert receipt["lookups_sent"] == {"managers": ["Region", "Manager", "Code"]}
    assert "lookups_sent" not in sent_receipt(schema, privacy_mode=True)


# ── What a recipe needs ──────────────────────────────────────────────


def test_recipe_requirements_come_from_the_steps():
    views = {"managers": LookupView("managers", "lf1", "managers.csv", "p", []), "rates": LookupView("rates", "lf2", "rates.csv", "p", [])}
    steps = [{"sql_query": "SELECT d.*, l.Manager FROM data d LEFT JOIN managers l ON 1=1"}, {"sql_query": "SELECT * FROM data"}]
    assert required_for(steps, views) == [{"alias": "managers", "lookup_file_id": "lf1", "lookup_file_name": "managers.csv"}]
    assert aliases_in("select * from data", ["managers"]) == []


def test_apply_links_the_recipes_lookups_or_names_the_missing_one(monkeypatch):
    added = []
    monkeypatch.setattr(db, "list_lookups", lambda fid: [])
    monkeypatch.setattr(db, "get_file", lambda fid, uid: {"id": fid} if fid in ("f1", "lf1") else None)
    monkeypatch.setattr(db, "add_lookup", lambda **kw: added.append(kw))
    missing = recipes_route._link_required_lookups("u1", "f1", [
        {"alias": "managers", "lookup_file_id": "lf1", "lookup_file_name": "managers.csv"},
        {"alias": "rates", "lookup_file_id": "gone", "lookup_file_name": "rates.csv"},
    ])
    assert added == [{"user_id": "u1", "file_id": "f1", "lookup_file_id": "lf1", "alias": "managers"}]
    assert missing == [{"alias": "rates", "lookup_file_id": "gone", "lookup_file_name": "rates.csv"}]


# ── The routes ───────────────────────────────────────────────────────


def _req(user_id="u1", body=None):
    async def _json():
        return body
    return types.SimpleNamespace(state=types.SimpleNamespace(user_id=user_id), json=_json)


def test_linking_a_file_as_a_lookup(monkeypatch, orders, managers):
    import asyncio

    files = {"f1": {"id": "f1", "r2_key": "k1", "name": "orders.csv", "row_count": 4}, "lf": {"id": "lf", "r2_key": "k2", "name": "Region Managers.csv", "row_count": 4}}
    monkeypatch.setattr(db, "get_file", lambda fid, uid: files.get(fid) if uid == "u1" else None)
    links = []
    monkeypatch.setattr(db, "list_lookups", lambda fid: [{"alias": l["alias"], "lookup_file_id": l["lookup_file_id"]} for l in links if l["file_id"] == fid])
    monkeypatch.setattr(db, "add_lookup", lambda **kw: (links.append(kw), kw)[1])
    monkeypatch.setattr(db, "remove_lookup", lambda fid, alias: bool([links.remove(l) for l in list(links) if l["alias"] == alias]))
    monkeypatch.setattr(db, "get_transformations", lambda fid: [])
    monkeypatch.setattr(lookups, "get_local_parquet", lambda key: managers if key == "k2" else orders)
    monkeypatch.setattr(events, "record", lambda *a, **kw: None)

    body = asyncio.run(files_route.add_file_lookup(_req(body={"lookup_file_id": "lf"}), "f1"))
    assert body["alias"] == "region_managers" and [c["name"] for c in body["columns"]] == ["Region", "Manager", "Code"]
    listed = files_route.list_file_lookups(_req(), "f1")
    assert listed["lookups"][0]["alias"] == "region_managers" and listed["lookups"][0]["name"] == "Region Managers.csv"

    assert asyncio.run(files_route.add_file_lookup(_req(body={"lookup_file_id": "f1"}), "f1")).status_code == 400
    assert asyncio.run(files_route.add_file_lookup(_req(body={"lookup_file_id": "lf", "alias": "data"}), "f1")).status_code == 400
    assert asyncio.run(files_route.add_file_lookup(_req(body={"lookup_file_id": "ghost"}), "f1")).status_code == 404
    assert files_route.remove_file_lookup(_req(), "f1", "region_managers")["removed"] is True
    assert files_route.remove_file_lookup(_req(), "f1", "region_managers").status_code == 404
