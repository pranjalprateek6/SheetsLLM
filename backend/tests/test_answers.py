"""Questions answered by running a query on the data, with no step saved."""

from __future__ import annotations

import duckdb
import pytest

from app import answers
from app.answers import answer_text, extract_query, format_value, run_question


@pytest.fixture
def orders(tmp_path):
    path = tmp_path / "orders.parquet"
    duckdb.connect().execute(
        "COPY (SELECT * FROM (VALUES "
        "('North', 100, DATE '2026-10-01'), ('North', 50, DATE '2026-10-02'), "
        "('South', 70, DATE '2026-10-03'), ('', 5, NULL), ('West', 120, DATE '2026-10-04')"
        ") t(region, mrp, d)) "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return str(path)


# ── Reading the model's reply ────────────────────────────────────────


def test_extract_query_reads_the_json_shape():
    assert extract_query('{"query": "SELECT COUNT(*) FROM data"}') == "SELECT COUNT(*) FROM data"
    assert extract_query('```json\n{"query": " SELECT 1 "}\n```') == "SELECT 1"


def test_extract_query_ignores_other_replies():
    assert extract_query("SELECT * FROM data") is None
    assert extract_query('{"insight": "two columns"}') is None
    assert extract_query('{"needs_clarification": true, "question": "which?"}') is None
    assert extract_query('{"query": ""}') is None
    assert extract_query("{not json") is None


# ── Running it ───────────────────────────────────────────────────────


def test_question_runs_on_the_whole_file(orders):
    out = run_question(orders, [], "SELECT region, SUM(mrp) AS total FROM data WHERE region <> '' GROUP BY 1 ORDER BY 2 DESC")
    assert out["columns"] == ["region", "total"]
    assert out["total_rows"] == 3
    assert out["rows"][0] == {"region": "North", "total": 150}
    assert out["rows"][-1] == {"region": "South", "total": 70}


def test_question_sees_the_data_as_the_steps_left_it(orders):
    steps = [{"step_number": 1, "sql_query": "SELECT * FROM data WHERE region <> ''"},
             {"step_number": 2, "sql_query": "SELECT * FROM data WHERE mrp >= 70"}]
    out = run_question(orders, steps, "SELECT COUNT(*) AS n FROM data")
    assert out["rows"] == [{"n": 3}]


def test_question_rows_are_capped_but_counted(orders):
    out = run_question(orders, [], "SELECT * FROM data", limit=2)
    assert len(out["rows"]) == 2
    assert out["total_rows"] == 5


def test_question_cells_are_plain_json(orders):
    out = run_question(orders, [], "SELECT d, mrp * 1.5 AS x FROM data ORDER BY d NULLS LAST LIMIT 1")
    assert out["rows"] == [{"d": "2026-10-01", "x": 150.0}]
    out = run_question(orders, [], "SELECT d FROM data WHERE d IS NULL")
    assert out["rows"] == [{"d": None}]


def test_question_sql_must_run(orders):
    with pytest.raises(Exception):
        run_question(orders, [], "SELECT nope FROM data")


# ── The line above the result ────────────────────────────────────────


def test_format_value():
    assert format_value(None) == "empty"
    assert format_value(1234567) == "1,234,567"
    assert format_value(1234.5) == "1,234.50"
    assert format_value(12.0) == "12"
    assert format_value(True) == "yes"
    assert format_value("West") == "West"


def test_answer_text_shapes():
    assert answer_text(["n"], [], 0) == "No rows match that."
    assert answer_text(["n"], [{"n": 912}], 1) == "n: 912"
    assert answer_text(["region", "total"], [{"region": "West", "total": 120}], 1) == "region: West · total: 120"
    assert answer_text(["region"], [{"region": "a"}, {"region": "b"}], 2) == "2 rows."
    assert answer_text(["region"], [{"region": "a"}], 1200) == "1,200 rows. Here are the first 1."


def test_limits_are_modest():
    assert answers.ANSWER_MAX_ROWS <= 100


# ── The prompt ───────────────────────────────────────────────────────


def test_prompt_leaves_empty_values_out_of_a_breakdown():
    # Asked "which region has the most orders", the model counted the blank
    # Region as the biggest group. Blanks are a cleaning problem, not an answer.
    from app.llm.prompts import CHAT_SYSTEM_PROMPT

    rule = CHAT_SYSTEM_PROMPT.split("**Query answer**")[1].split("**Insight**")[0]
    assert "Leave out empty values" in rule
    assert "NULL" in rule and "blank" in rule
    assert "unless the question is about the empty ones" in rule
