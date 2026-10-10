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
        "detail": "3 rows repeat another row exactly",
    }


def test_no_duplicates_no_suggestion(tmp_path):
    path = _parquet(tmp_path, "(1, 'x'), (2, 'y'), (3, 'z')")
    insights = generate_insights(path)
    assert insights["duplicate_rows"] == 0
    assert not any("duplicate" in s["text"] for s in insights["suggestions"])


def test_singular_wording(tmp_path):
    path = _parquet(tmp_path, "(1, 'x'), (1, 'x'), (2, 'y')")
    assert generate_insights(path)["suggestions"][0]["text"] == "Remove 1 duplicate row"


def _dates(tmp_path, dates: list[str]) -> str:
    rows = ", ".join(f"({i}, '{d}')" for i, d in enumerate(dates))
    return _parquet(tmp_path, rows)


def test_mixed_day_first_dates_get_the_one_click_fix(tmp_path):
    path = _dates(tmp_path, ["2026-10-14", "2026-10-02", "28/10/2026", "10/10/2026"])
    [s] = [s for s in generate_insights(path)["suggestions"] if "dates" in s["text"]]
    assert s == {
        "text": "Standardise dates in b",
        "instruction": "standardise dates in b",
        # Non-breaking hyphens keep the format on one line
        "detail": "2 written DD/MM/YYYY, 2 as YYYY‑MM‑DD",
    }


def test_month_first_dates_go_to_chef_with_the_order(tmp_path):
    path = _dates(tmp_path, ["2026-10-14", "10/28/2026"])
    [s] = [s for s in generate_insights(path)["suggestions"] if "dates" in s["text"]]
    assert "month/day/year" in s["instruction"]
    assert not s["instruction"].startswith("standardise")


def test_one_date_format_is_not_flagged(tmp_path):
    path = _dates(tmp_path, ["2026-10-14", "2026-10-02", "2026-09-30"])
    assert not any("dates" in s["text"] for s in generate_insights(path)["suggestions"])


def test_a_column_name_cannot_break_out_of_its_quotes(tmp_path):
    # Column names come from the file. One holding a double quote must stay a
    # name: before quoting was escaped this one failed (or worse, ran SQL).
    path = tmp_path / "evil.parquet"
    duckdb.connect().execute(
        "COPY (SELECT * FROM (VALUES (1, NULL), (1, NULL), (2, 'x')) "
        "t(a, \"b\"\") FROM data; --\")) "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    insights = generate_insights(str(path))
    assert insights["duplicate_rows"] == 1
    assert [c["column"] for c in insights["null_columns"]] == ['b") FROM data; --']
