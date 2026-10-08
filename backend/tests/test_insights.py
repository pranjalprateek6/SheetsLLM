"""Upload-time insights: the counts behind the suggestion chips."""

from __future__ import annotations

import duckdb

from app.insights import generate_insights


def _parquet(tmp_path, values_sql: str) -> str:
    path = tmp_path / "data.parquet"
    duckdb.connect().execute(
        f"COPY (SELECT * FROM (VALUES {values_sql}) t(a, b)) "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return str(path)


def test_counts_exact_duplicate_rows(tmp_path):
    # Two extra copies of (1, 'x'), and one of (2, NULL): NULLs compare equal
    path = _parquet(tmp_path, "(1, 'x'), (1, 'x'), (1, 'x'), (2, NULL), (2, NULL), (3, 'z')")
    insights = generate_insights(path)
    assert insights["duplicate_rows"] == 3
    assert insights["suggestions"][0] == {
        "text": "Remove 3 duplicate rows",
        "instruction": "remove duplicate rows",
    }


def test_no_duplicates_no_suggestion(tmp_path):
    path = _parquet(tmp_path, "(1, 'x'), (2, 'y'), (3, 'z')")
    insights = generate_insights(path)
    assert insights["duplicate_rows"] == 0
    assert not any("duplicate" in s["text"] for s in insights["suggestions"])


def test_singular_wording(tmp_path):
    path = _parquet(tmp_path, "(1, 'x'), (1, 'x'), (2, 'y')")
    assert generate_insights(path)["suggestions"][0]["text"] == "Remove 1 duplicate row"
