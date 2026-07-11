"""Auto-insights engine — analyze uploaded data for quality and stats."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.engine import get_connection

logger = logging.getLogger("sheetsllm.insights")


def generate_insights(local_path: str | Path) -> dict[str, Any]:
    """
    Run a set of DuckDB queries against a local Parquet file to produce
    auto-insights: null counts, duplicates, numeric stats, and suggestions.
    """
    con = get_connection()
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
            qname = f'"{col_name}"'
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

        # Duplicate row count
        try:
            dup_result = con.execute(
                "SELECT COUNT(*) - COUNT(DISTINCT *) FROM data"
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
            qname = f'"{col_name}"'
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
            })

        high_null_cols = [c for c in insights["null_columns"] if c["null_pct"] > 10]
        for col_info in high_null_cols[:3]:  # max 3 suggestions
            insights["suggestions"].append({
                "text": f"Column '{col_info['column']}' has {col_info['null_pct']}% null values",
                "instruction": f"drop rows where {col_info['column']} is null",
            })

    except Exception as exc:
        logger.error("Insights generation failed: %s", exc)

    return insights
