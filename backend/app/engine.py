"""DuckDB query engine — connection factory, query execution, CTE replay, schema inference."""

from __future__ import annotations

import concurrent.futures
import io
import logging
import tempfile
from pathlib import Path
from typing import Any

import duckdb
import pyarrow.parquet as pq

from app.config import (
    DUCKDB_MEMORY_LIMIT,
    DUCKDB_QUERY_TIMEOUT,
    DUCKDB_THREADS,
    MAX_PREVIEW_ROWS,
)
from app.security import sanitize_column_names

logger = logging.getLogger("sheetsllm.engine")


# ── Connection ───────────────────────────────────────────────────────


def get_connection() -> duckdb.DuckDBPyConnection:
    """Create a fresh in-memory DuckDB connection."""
    con = duckdb.connect(":memory:")
    con.execute(f"SET threads={DUCKDB_THREADS}")
    con.execute(f"SET max_memory='{DUCKDB_MEMORY_LIMIT}'")
    return con


class QueryTimeoutError(Exception):
    """Raised when a DuckDB query exceeds the time limit."""


def _run_with_timeout(func, *args, timeout: int = DUCKDB_QUERY_TIMEOUT):
    """Run a synchronous function with a thread-pool timeout."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(func, *args)
        try:
            return future.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            future.cancel()
            raise QueryTimeoutError(
                f"Query exceeded {timeout}s time limit. Try a simpler instruction."
            )


# ── Query Execution ──────────────────────────────────────────────────


def execute_sql_from_local(
    local_path: str | Path,
    sql: str,
    *,
    preview_limit: int = MAX_PREVIEW_ROWS,
    timeout: int | None = None,
) -> dict[str, Any]:
    """Execute SQL against a local Parquet file with optional timeout."""

    def _inner():
        con = get_connection()
        lp = str(local_path).replace("\\", "/")
        con.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{lp}')")

        # EXPLAIN dry run — catch errors before full execution
        con.execute(f"EXPLAIN {sql}")

        result = con.execute(sql).fetchdf()

        total_rows = len(result)
        total_columns = len(result.columns)
        columns = [str(c) for c in result.columns]

        import numpy as np

        preview = result.head(preview_limit).replace({np.nan: None})
        preview_rows = preview.to_dict(orient="records")

        return {
            "preview": preview_rows,
            "columns": columns,
            "total_rows": total_rows,
            "total_columns": total_columns,
        }

    t = timeout if timeout is not None else DUCKDB_QUERY_TIMEOUT
    return _run_with_timeout(_inner, timeout=t)


# ── CTE Replay ───────────────────────────────────────────────────────


def replay_transformations_local(
    local_path: str | Path,
    steps: list[dict],
    *,
    up_to: int | None = None,
    preview_limit: int = MAX_PREVIEW_ROWS,
) -> dict[str, Any]:
    """Replay transformation steps using a local Parquet file (cached)."""
    sql = build_replay_sql(steps, up_to=up_to)
    return execute_sql_from_local(local_path, sql, preview_limit=preview_limit)


def build_replay_sql(
    steps: list[dict], *, up_to: int | None = None
) -> str:
    """
    Build a CTE chain from stored transformation steps.
    Returns the final SQL string.
    """
    if not steps:
        return "SELECT * FROM data"

    target_steps = steps[:up_to] if up_to is not None else steps
    if not target_steps:
        return "SELECT * FROM data"

    ctes: list[str] = []
    for i, step in enumerate(target_steps):
        sql = step["sql_query"]
        if i == 0:
            # First step reads from 'data' (the original Parquet)
            ctes.append(f"step_{i + 1} AS ({sql})")
        else:
            # Subsequent steps: replace FROM data with previous step
            modified_sql = sql.replace("FROM data", f"FROM step_{i}")
            ctes.append(f"step_{i + 1} AS ({modified_sql})")

    last_step = len(target_steps)
    return f"WITH {', '.join(ctes)} SELECT * FROM step_{last_step}"


# ── Full result (for downloads) ──────────────────────────────────────


def execute_full_result_local(
    local_path: str | Path,
    steps: list[dict],
) -> "duckdb.DuckDBPyConnection":
    """Replay all steps from a local Parquet file. Returns DuckDB result."""
    sql = build_replay_sql(steps)
    con = get_connection()
    lp = str(local_path).replace("\\", "/")
    con.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{lp}')")
    return con.execute(sql)


# ── Schema Inference ─────────────────────────────────────────────────


def _enrich_columns(con: "duckdb.DuckDBPyConnection", source: str) -> list[dict]:
    """
    Build enriched column metadata: name, dtype, null_pct, unique_count, sample_values.
    ``source`` is the FROM clause (e.g. a read_parquet(...) expression or view name).
    """
    schema_df = con.execute(f"DESCRIBE SELECT * FROM {source}").fetchdf()
    total_rows_result = con.execute(f"SELECT COUNT(*) AS cnt FROM {source}").fetchone()
    total_rows = total_rows_result[0] if total_rows_result else 0

    columns: list[dict] = []
    for _, row in schema_df.iterrows():
        col_name = row["column_name"]
        col_type = row["column_type"]
        col_info: dict[str, Any] = {"name": col_name, "dtype": col_type}

        if total_rows > 0:
            try:
                # Quoted identifier to handle spaces/reserved words
                qname = f'"{col_name}"'
                stats = con.execute(f"""
                    SELECT
                        ROUND(100.0 * COUNT(*) FILTER (WHERE {qname} IS NULL) / COUNT(*), 1) AS null_pct,
                        COUNT(DISTINCT {qname}) AS unique_count
                    FROM {source}
                """).fetchone()
                if stats:
                    col_info["null_pct"] = float(stats[0])
                    col_info["unique_count"] = int(stats[1])

                # Sample distinct values (up to 5)
                sample_vals = con.execute(f"""
                    SELECT DISTINCT {qname}::VARCHAR
                    FROM {source}
                    WHERE {qname} IS NOT NULL
                    LIMIT 5
                """).fetchall()
                col_info["sample_values"] = [v[0] for v in sample_vals]
            except Exception:
                pass  # Stats are best-effort

        columns.append(col_info)
    return columns


def get_schema_from_local(local_path: str | Path) -> dict[str, Any]:
    """Get enriched column metadata and sample rows from a local Parquet file."""
    con = get_connection()
    lp = str(local_path).replace("\\", "/")
    source = f"read_parquet('{lp}')"

    columns = _enrich_columns(con, source)

    sample_df = con.execute(f"SELECT * FROM {source} LIMIT 5").fetchdf()
    samples = sample_df.astype(str).values.tolist()

    return {"columns": columns, "samples": samples}


# ── Parquet Conversion ───────────────────────────────────────────────


def convert_to_parquet(
    file_bytes: bytes, filename: str, *, sheet_name: str | None = None
) -> tuple[bytes, int, int]:
    """
    Convert CSV/XLSX/JSON/TSV to Parquet using DuckDB + PyArrow.
    Returns (parquet_bytes, row_count, column_count).
    """
    con = get_connection()
    lower = filename.lower()

    # Write to a temp file for DuckDB to read
    suffix = Path(filename).suffix
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(file_bytes)
    tmp.flush()
    tmp.close()
    tmp_path = tmp.name.replace("\\", "/")  # DuckDB needs forward slashes

    try:
        if lower.endswith(".parquet") or lower.endswith(".pq"):
            # Already parquet — just get counts
            arrow_table = pq.read_table(tmp.name)
            row_count = arrow_table.num_rows
            col_count = arrow_table.num_columns
            return file_bytes, row_count, col_count

        if lower.endswith(".xlsx") or lower.endswith(".xls"):
            import pandas as pd

            df = pd.read_excel(
                io.BytesIO(file_bytes),
                sheet_name=sheet_name or 0,
            )
            con.register("staging", df)
        elif lower.endswith(".json") or lower.endswith(".jsonl"):
            con.execute(
                f"CREATE TABLE staging AS SELECT * FROM read_json_auto('{tmp_path}')"
            )
        elif lower.endswith(".tsv"):
            con.execute(
                f"CREATE TABLE staging AS SELECT * FROM read_csv_auto('{tmp_path}', delim='\\t')"
            )
        else:
            # Default: CSV
            con.execute(
                f"CREATE TABLE staging AS SELECT * FROM read_csv_auto('{tmp_path}')"
            )

        arrow_table = con.execute("SELECT * FROM staging").fetch_arrow_table()
    finally:
        Path(tmp.name).unlink(missing_ok=True)

    # Sanitize column names (strip control chars, deduplicate)
    original_names = [str(c) for c in arrow_table.column_names]
    clean_names = sanitize_column_names(original_names)
    if clean_names != original_names:
        arrow_table = arrow_table.rename_columns(clean_names)

    row_count = arrow_table.num_rows
    col_count = arrow_table.num_columns

    buf = io.BytesIO()
    pq.write_table(arrow_table, buf, compression="zstd")
    return buf.getvalue(), row_count, col_count


def detect_sheets(file_bytes: bytes, filename: str) -> list[str] | None:
    """
    If the file is a multi-sheet XLSX, return sheet names.
    Otherwise return None.
    """
    lower = filename.lower()
    if not (lower.endswith(".xlsx") or lower.endswith(".xls")):
        return None

    import pandas as pd

    excel = pd.ExcelFile(io.BytesIO(file_bytes))
    if len(excel.sheet_names) > 1:
        return excel.sheet_names
    return None


# ── Fuzzy Column Matching ─────────────────────────────────────────────


def suggest_column(
    typo: str,
    local_path: str | Path | None = None,
    threshold: float = 0.7,
) -> str | None:
    """
    Use DuckDB's jaro_winkler_similarity to find the closest column name.
    Returns the best match above ``threshold``, or None.
    """
    if not local_path:
        return None

    con = get_connection()
    lp = str(local_path).replace("\\", "/")
    source = f"read_parquet('{lp}')"

    schema_df = con.execute(f"DESCRIBE SELECT * FROM {source}").fetchdf()
    col_names = schema_df["column_name"].tolist()

    if not col_names:
        return None

    # Build a query that scores each column name
    cases = ", ".join(
        f"jaro_winkler_similarity('{typo}', '{name}') AS \"{name}\""
        for name in col_names
    )
    row = con.execute(f"SELECT {cases}").fetchone()
    if not row:
        return None

    best_idx = max(range(len(row)), key=lambda i: row[i])
    if row[best_idx] >= threshold:
        return col_names[best_idx]
    return None
