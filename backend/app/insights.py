"""Auto-insights engine — analyze uploaded data for quality and stats."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.engine import _run_with_timeout, get_connection
from app.ops import quote_ident  # column names come from the file

logger = logging.getLogger("sheetsllm.insights")


def generate_insights(local_path: str | Path) -> dict[str, Any]:
    """
    Run a set of DuckDB queries against a local Parquet file to produce
    auto-insights: null counts, duplicates, numeric stats, and suggestions.
    """
    con = get_connection(read=(local_path,))
    lp = str(local_path).replace("\\", "/")
    con.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{lp}')")

    insights: dict[str, Any] = {
        "null_columns": [],
        "duplicate_rows": 0,
        "numeric_stats": [],
        "suggestions": [],
        "row_count": 0,
        "column_count": 0,
    }

    try:
        # Basic counts
        count_result = con.execute("SELECT COUNT(*) FROM data").fetchone()
        insights["row_count"] = count_result[0] if count_result else 0

        schema_df = con.execute("DESCRIBE SELECT * FROM data").fetchdf()
        col_names = schema_df["column_name"].tolist()
        col_types = schema_df["column_type"].tolist()
        insights["column_count"] = len(col_names)

        if insights["row_count"] == 0:
            return insights

        # Null analysis per column
        for col_name in col_names:
            qname = quote_ident(col_name)
            try:
                null_result = con.execute(f"""
                    SELECT
                        COUNT(*) FILTER (WHERE {qname} IS NULL) AS null_count,
                        ROUND(100.0 * COUNT(*) FILTER (WHERE {qname} IS NULL) / COUNT(*), 1) AS null_pct
                    FROM data
                """).fetchone()
                if null_result and null_result[0] > 0:
                    insights["null_columns"].append({
                        "column": col_name,
                        "null_count": int(null_result[0]),
                        "null_pct": float(null_result[1]),
                    })
            except Exception:
                pass

        # Duplicate row count. SELECT DISTINCT * treats NULLs as equal, the
        # same rows "remove duplicate rows" drops. (COUNT(DISTINCT *) is a
        # binder error in DuckDB, which this used to swallow into 0.)
        try:
            dup_result = con.execute(
                "SELECT (SELECT COUNT(*) FROM data)"
                " - (SELECT COUNT(*) FROM (SELECT DISTINCT * FROM data))"
            ).fetchone()
            if dup_result:
                insights["duplicate_rows"] = int(dup_result[0])
        except Exception:
            pass

        # Numeric column stats
        numeric_types = {"BIGINT", "INTEGER", "SMALLINT", "TINYINT", "FLOAT", "DOUBLE", "DECIMAL", "HUGEINT", "NUMERIC"}
        for col_name, col_type in zip(col_names, col_types):
            base_type = col_type.split("(")[0].upper()
            if base_type not in numeric_types:
                continue
            qname = quote_ident(col_name)
            try:
                stats = con.execute(f"""
                    SELECT
                        MIN({qname})::DOUBLE AS min_val,
                        MAX({qname})::DOUBLE AS max_val,
                        ROUND(AVG({qname})::DOUBLE, 2) AS avg_val,
                        ROUND(MEDIAN({qname})::DOUBLE, 2) AS median_val
                    FROM data
                    WHERE {qname} IS NOT NULL
                """).fetchone()
                if stats and stats[0] is not None:
                    insights["numeric_stats"].append({
                        "column": col_name,
                        "min": stats[0],
                        "max": stats[1],
                        "avg": stats[2],
                        "median": stats[3],
                    })
            except Exception:
                pass

        # Generate suggestions
        if insights["duplicate_rows"] > 0:
            n = insights["duplicate_rows"]
            insights["suggestions"].append({
                "text": f"Remove {n} duplicate row{'s' if n != 1 else ''}",
                "instruction": "remove duplicate rows",
                "detail": f"{n} row{'s repeat' if n != 1 else ' repeats'} another row exactly",
            })

        high_null_cols = [c for c in insights["null_columns"] if c["null_pct"] > 10]
        for col_info in high_null_cols[:3]:  # max 3 suggestions
            insights["suggestions"].append({
                # Lead with what clicking does; the finding is the reason
                "text": f"Drop rows where {col_info['column']} is empty",
                "instruction": f"drop rows where {col_info['column']} is null",
                "detail": f"{col_info['null_pct']}% of {col_info['column']} is empty",
            })

        # Mixed date formats in a text column: "2026-10-14" beside "10/10/2026".
        # Bounded: a cheap look at the first rows picks the date-like columns,
        # and only those few are counted in full, under a time limit.
        text_cols = [c for c, t in zip(col_names, col_types) if t.upper().startswith("VARCHAR")]
        for col_name in _date_like(con, text_cols):
            try:
                found = _run_with_timeout(
                    _mixed_dates, con, col_name, timeout=_DATE_PROBE_SECONDS, interrupt=(con,)
                )
            except Exception:
                found = None
            if found:
                insights["suggestions"].append(found)

    except Exception as exc:
        logger.error("Insights generation failed: %s", exc)

    return insights


_ISO = r"^\d{4}-\d{1,2}-\d{1,2}$"
_SLASHED = r"^\d{1,2}/\d{1,2}/\d{4}$"


_DATE_PROBE_ROWS = 1000
_DATE_PROBE_COLUMNS = 10
_DATE_PROBE_SECONDS = 5


def _date_like(con, text_cols: list[str]) -> list[str]:
    """Text columns whose first rows are mostly dates, at most a handful."""
    if not text_cols:
        return []
    either = f"'{_ISO}|{_SLASHED}'"
    parts = ", ".join(
        f"COUNT(*) FILTER (WHERE regexp_matches(TRIM(CAST({quote_ident(c)} AS VARCHAR)), {either}))"
        f" / GREATEST(COUNT({quote_ident(c)}), 1)"
        for c in text_cols
    )
    shares = con.execute(
        f"SELECT {parts} FROM (SELECT * FROM data LIMIT {_DATE_PROBE_ROWS})"
    ).fetchone()
    return [c for c, share in zip(text_cols, shares) if (share or 0) >= 0.5][:_DATE_PROBE_COLUMNS]


def _mixed_dates(con, col_name: str) -> dict[str, str] | None:
    """A suggestion when a text column holds dates written two ways.

    Day-first slashed dates ("28/10/2026") are what the one-click fix assumes
    when it has to guess, so it is offered only when a day over 12 proves
    that order. Otherwise Chef gets the job, told which order the data shows.
    """
    q = quote_ident(col_name)
    v = f"TRIM(CAST({q} AS VARCHAR))"
    row = con.execute(f"""
        SELECT
            COUNT({q}) AS filled,
            COUNT(*) FILTER (WHERE regexp_matches({v}, '{_ISO}')) AS iso,
            COUNT(*) FILTER (WHERE regexp_matches({v}, '{_SLASHED}')) AS slashed,
            COUNT(*) FILTER (WHERE regexp_matches({v}, '{_SLASHED}')
                AND TRY_CAST(split_part({v}, '/', 1) AS INTEGER) > 12) AS day_first,
            COUNT(*) FILTER (WHERE regexp_matches({v}, '{_SLASHED}')
                AND TRY_CAST(split_part({v}, '/', 2) AS INTEGER) > 12) AS month_first
        FROM data
    """).fetchone()
    filled, iso, slashed, day_first, month_first = (int(x or 0) for x in row)
    # Mostly dates, and both ways of writing them present
    if not filled or not iso or not slashed or (iso + slashed) < 0.9 * filled:
        return None
    if day_first and not month_first:
        order, instruction = "DD/MM/YYYY", f"standardise dates in {col_name}"
    elif month_first and not day_first:
        order = "MM/DD/YYYY"
        instruction = f"Convert {col_name} to YYYY-MM-DD. The slashed dates are month/day/year"
    else:
        order = "with slashes"
        instruction = f"Convert {col_name} to YYYY-MM-DD"
    # Non-breaking hyphens (U+2011) keep "YYYY-MM-DD" on one line in the chip
    return {
        "text": f"Standardise dates in {col_name}",
        "instruction": instruction,
        "detail": f"{slashed:,} written {order}, {iso:,} as YYYY‑MM‑DD",
    }
