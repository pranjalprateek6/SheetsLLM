"""Tier 3: paged rows as views, cells a fix changed, the rows behind a
warning, and Chef proposals applied without a second AI call."""
from __future__ import annotations

import types

import duckdb
import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import db, events, usage
from app.engine import changed_cells, page_rows
from app.main import app
from app.routes import chat as chat_module
from app.routes import files as files_module
from app.routes import transform as transform_module

F1 = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def parquet(tmp_path):
    path = tmp_path / "data.parquet"
    duckdb.connect().execute(
        "COPY (SELECT * FROM (VALUES (1, ' Ann ', 'North'), (2, 'Ben', NULL), (3, 'cy', 'South'), "
        "(4, 'Dee', ''), (5, 'Eve', 'north')) t(id, name, region)) "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return str(path)


# ── the engine ───────────────────────────────────────────────────────


def test_a_page_is_a_slice_of_the_view(parquet):
    page = page_rows(parquet, [], offset=2, limit=2)
    assert page["total_rows"] == 5 and [r["id"] for r in page["rows"]] == [3, 4]
    assert page["columns"] == ["id", "name", "region"]


def test_sort_and_filter_cover_every_row_not_a_preview(parquet):
    page = page_rows(parquet, [], sort="id", descending=True, limit=2)
    assert [r["id"] for r in page["rows"]] == [5, 4]
    page = page_rows(parquet, [], q="NORTH")
    assert page["total_rows"] == 2 and {r["id"] for r in page["rows"]} == {1, 5}
    page = page_rows(parquet, [], empty="region")
    assert {r["id"] for r in page["rows"]} == {2, 4}


def test_the_view_reads_the_file_as_its_steps_left_it(parquet):
    steps = [{"step_number": 1, "sql_query": "SELECT * FROM data WHERE id > 2"}]
    assert page_rows(parquet, steps)["total_rows"] == 3


def test_unknown_columns_and_quotes_are_refused_or_bound(parquet):
    with pytest.raises(ValueError):
        page_rows(parquet, [], sort='id"; DROP TABLE x; --')
    with pytest.raises(ValueError):
        page_rows(parquet, [], empty="nope")
    assert page_rows(parquet, [], q="' OR 1=1 --")["total_rows"] == 0


def test_changed_cells_counts_what_a_fix_rewrote(parquet):
    trim = "SELECT * REPLACE (TRIM(name) AS name) FROM data"
    assert changed_cells(parquet, [], trim, "name") == 1
    assert changed_cells(parquet, [], "SELECT * FROM data WHERE id > 1", "name") is None
    assert changed_cells(parquet, [], "SELECT id, region FROM data", "name") is None


# ── the routes ───────────────────────────────────────────────────────


@pytest.fixture
def seams(monkeypatch, parquet):
    st = types.SimpleNamespace(steps=[], messages=[], events=[], usage=[])
    file_rec = {"id": F1, "user_id": "anonymous", "r2_key": "k", "name": "d.csv", "row_count": 5,
                "column_count": 3, "schema_json": {"columns": [{"name": "id", "dtype": "INTEGER"},
                                                               {"name": "name", "dtype": "VARCHAR"},
                                                               {"name": "region", "dtype": "VARCHAR"}]}}
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    monkeypatch.setattr(db, "get_file", lambda fid, uid: file_rec if fid == F1 else None)
    monkeypatch.setattr(db, "get_transformations", lambda fid: list(st.steps))
    monkeypatch.setattr(db, "get_next_step_number", lambda fid: len(st.steps) + 1)
    monkeypatch.setattr(db, "create_transformation", lambda **kw: st.steps.append(kw) or kw)
    monkeypatch.setattr(db, "update_file", lambda *a, **kw: {})
    monkeypatch.setattr(db, "create_audit_entry", lambda **kw: kw)
    monkeypatch.setattr(db, "create_chat_message", lambda **kw: st.messages.append(kw) or kw)
    monkeypatch.setattr(db, "get_chat_messages", lambda fid, limit=None: [])
    monkeypatch.setattr(db, "get_privacy_mode", lambda uid: True)
    for target in (transform_module, chat_module, files_module):
        monkeypatch.setattr(target, "get_local_parquet", lambda key: parquet, raising=False)
    import app.cache as cache

    monkeypatch.setattr(cache, "get_local_parquet", lambda key: parquet)
    monkeypatch.setattr(usage, "enforce", lambda *a, **kw: None)
    monkeypatch.setattr(usage, "record", lambda uid, **c: st.usage.append(c))
    monkeypatch.setattr(events, "record", lambda uid, name, **p: st.events.append((name, p)))
    st.client = TestClient(app, raise_server_exceptions=False)
    return st


def test_the_rows_route_pages_sorts_and_views_history(seams):
    body = seams.client.get(f"/files/{F1}/rows?limit=2&sort=id&dir=desc").json()
    assert body["total_rows"] == 5 and [r["id"] for r in body["rows"]] == [5, 4]
    seams.steps.append({"step_number": 1, "sql_query": "SELECT * FROM data WHERE id > 3"})
    assert seams.client.get(f"/files/{F1}/rows").json()["total_rows"] == 2
    assert seams.client.get(f"/files/{F1}/rows?upto=0").json()["total_rows"] == 5
    assert seams.client.get(f"/files/{F1}/rows?sort=nope").json()["code"] == "UNKNOWN_COLUMN"
    assert seams.client.get("/files/22222222-2222-2222-2222-222222222222/rows").status_code == 404


def test_a_trim_says_how_many_cells_it_changed(seams):
    body = seams.client.post("/transform/op", json={"file_id": F1, "op": "trim", "column": "name"}).json()
    assert body["changed"] == {"column": "name", "cells": 1}


class LLM:
    def __init__(self, reply):
        self.reply = reply

    def generate_sql(self, system, user):
        return self.reply


def test_a_proposal_shows_the_step_and_saves_nothing(seams, monkeypatch):
    monkeypatch.setattr(chat_module, "get_llm", lambda: LLM("SELECT * FROM data WHERE region IS NOT NULL"))
    body = seams.client.post("/chat", json={"file_id": F1, "message": "drop rows with no region", "propose": True}).json()
    assert body["type"] == "proposal"
    assert body["preview"]["total_rows"] == 4 and body["before"]["total_rows"] == 5
    assert body["sql"].startswith("SELECT") and body["sent"]["source"] == "llm"
    assert seams.steps == [], "nothing saved"
    assert seams.messages[-1]["message_type"] == "proposal"

    # applying it goes through the step route: no AI call, the receipt kept
    applied = seams.client.post(f"/files/{F1}/steps", json={
        "instruction": "drop rows with no region", "sql": body["sql"],
        "sent": {**body["sent"], "injected": "x", "source": "llm"},
    })
    assert applied.status_code == 200
    saved = seams.steps[-1]
    assert saved["explain"] == "chef" and saved["sent"]["source"] == "llm" and "injected" not in saved["sent"]
    assert ("chef_proposal_applied", {}) in seams.events


def test_without_propose_chef_still_applies_at_once(seams, monkeypatch):
    monkeypatch.setattr(chat_module, "get_llm", lambda: LLM("SELECT * FROM data WHERE id > 1"))
    body = seams.client.post("/chat", json={"file_id": F1, "message": "drop the first row"}).json()
    assert body["type"] == "transform" and len(seams.steps) == 1
