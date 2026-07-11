"""DuckDB query engine — connection factory, query execution, CTE replay, schema inference."""

from __future__ import annotations

import concurrent.futures
import io
import logging
import re
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
    MAX_ROWS,
)
from app.security import sanitize_column_names

logger = logging.getLogger("sheetsllm.engine")


def _sql_path(path: str | Path) -> str:
    """Normalize a filesystem path for safe interpolation into DuckDB SQL:
    forward slashes for DuckDB, single quotes doubled to prevent breaking
    out of the string literal."""
    return str(path).replace("\\", "/").replace("'", "''")


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
        lp = _sql_path(local_path)
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


_FROM_DATA_RE = re.compile(r"\bFROM\s+data\b", re.IGNORECASE)
# Single-quoted SQL string literals ('' is an escaped quote inside one)
_STRING_LITERAL_RE = re.compile(r"('(?:[^']|'')*')")


def _retarget_from_data(sql: str, replacement: str) -> str:
    """
    Rewrite references to the 'data' view to point at ``replacement``,
    case-insensitively and tolerant of extra whitespace, while leaving
    string literals untouched (e.g. WHERE note = 'FROM data').
    """
    segments = _STRING_LITERAL_RE.split(sql)
    return "".join(
        seg if seg.startswith("'")
        else _FROM_DATA_RE.sub(f"FROM {replacement}", seg)
        for seg in segments
    )


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
            # Subsequent steps: retarget FROM data to the previous step
            ctes.append(f"step_{i + 1} AS ({_retarget_from_data(sql, f'step_{i}')})")

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
    lp = _sql_path(local_path)
    con.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{lp}')")
    return con.execute(sql)


# ── Schema Inference ─────────────────────────────────────────────────


def _stringify_samples(sample_df) -> list[list]:
    """Sample rows as JSON-safe strings, mapping missing values to None.

    pandas 2.x ``astype(str)`` keeps NaN/NaT as floats, which later fails
    JSON serialization ("Out of range float values are not JSON compliant")
    and broke uploads of any file with NULLs in the first sample rows.
    """
    import pandas as pd

    return [
        [None if pd.isna(v) else str(v) for v in row]
        for row in sample_df.values.tolist()
    ]


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
    lp = _sql_path(local_path)
    source = f"read_parquet('{lp}')"

    columns = _enrich_columns(con, source)

    sample_df = con.execute(f"SELECT * FROM {source} LIMIT 5").fetchdf()
    samples = _stringify_samples(sample_df)

    return {"columns": columns, "samples": samples}


def get_schema_after_steps(
    local_path: str | Path,
    steps: list[dict],
    *,
    sample_rows: int = 3,
    timeout: int | None = None,
) -> dict[str, Any]:
    """
    Schema (real column names AND dtypes) plus sample rows as they exist after
    replaying the stored transformation steps.

    DESCRIBE on the CTE chain resolves names/types without executing the full
    query; only the small LIMIT sample runs the chain. With no steps this
    falls through to the enriched base-file schema.
    """
    if not steps:
        return get_schema_from_local(local_path)

    replay = build_replay_sql(steps)

    def _inner():
        con = get_connection()
        lp = _sql_path(local_path)
        con.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{lp}')")

        schema_df = con.execute(f"DESCRIBE {replay}").fetchdf()
        columns = [
            {"name": str(row["column_name"]), "dtype": str(row["column_type"])}
            for _, row in schema_df.iterrows()
        ]

        sample_df = con.execute(
            f"SELECT * FROM ({replay}) LIMIT {int(sample_rows)}"
        ).fetchdf()
        samples = _stringify_samples(sample_df)

        return {"columns": columns, "samples": samples}

    t = timeout if timeout is not None else DUCKDB_QUERY_TIMEOUT
    return _run_with_timeout(_inner, timeout=t)


# ── Parquet Conversion ───────────────────────────────────────────────


class UnreadableFileError(Exception):
    """File could not be parsed even leniently. str() is safe to show users."""


def _read_csv_lenient(con, tmp_path: str, *, delim: str | None = None) -> None:
    """CSV ingest with a lenient second attempt.

    Real-world exports (mixed line endings, ragged rows) can fail DuckDB's
    strict sniffer with a wall-of-text error. Retry with strict mode off and
    null padding before giving up with a message a human can act on.
    """
    delim_arg = f", delim='{delim}'" if delim else ""
    try:
        con.execute(
            f"CREATE TABLE staging AS SELECT * FROM read_csv_auto('{tmp_path}'{delim_arg})"
        )
        return
    except Exception as first_exc:
        logger.warning("csv strict parse failed, retrying leniently: %s", first_exc)
        try:
            con.execute(
                "CREATE TABLE staging AS SELECT * FROM read_csv_auto("
                f"'{tmp_path}'{delim_arg}, strict_mode=false, null_padding=true)"
            )
            return
        except Exception:
            raise UnreadableFileError(
                "We couldn't read this file as a CSV. It may use inconsistent "
                "formatting — mixed line endings, uneven columns, or an unusual "
                "delimiter. Re-saving it as a standard CSV from your spreadsheet "
                "tool usually fixes this."
            ) from first_exc


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
    tmp_path = _sql_path(tmp.name)  # forward slashes + quote-escaped for DuckDB

    try:
        if lower.endswith(".parquet") or lower.endswith(".pq"):
            # Already parquet — enforce the row cap, else pass through
            arrow_table = pq.read_table(tmp.name)
            if arrow_table.num_rows > MAX_ROWS:
                arrow_table = arrow_table.slice(0, MAX_ROWS)
                buf = io.BytesIO()
                pq.write_table(arrow_table, buf, compression="zstd")
                logger.warning(
                    "Parquet upload truncated to MAX_ROWS=%d", MAX_ROWS
                )
                return buf.getvalue(), arrow_table.num_rows, arrow_table.num_columns
            return file_bytes, arrow_table.num_rows, arrow_table.num_columns

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
            _read_csv_lenient(con, tmp_path, delim="\\t")
        else:
            # Default: CSV
            _read_csv_lenient(con, tmp_path)

        arrow_table = con.execute("SELECT * FROM staging").fetch_arrow_table()
    finally:
        Path(tmp.name).unlink(missing_ok=True)

    # Sanitize column names (strip control chars, deduplicate)
    original_names = [str(c) for c in arrow_table.column_names]
    clean_names = sanitize_column_names(original_names)
    if clean_names != original_names:
        arrow_table = arrow_table.rename_columns(clean_names)

    # Enforce the row cap for real — metadata and stored data must agree
    if arrow_table.num_rows > MAX_ROWS:
        arrow_table = arrow_table.slice(0, MAX_ROWS)
        logger.warning("Upload truncated to MAX_ROWS=%d", MAX_ROWS)

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
    lp = _sql_path(local_path)
    source = f"read_parquet('{lp}')"

    schema_df = con.execute(f"DESCRIBE SELECT * FROM {source}").fetchdf()
    col_names = schema_df["column_name"].tolist()

    if not col_names:
        return None

    # Build a query that scores each column name (escape quotes — ``typo``
    # and column names are untrusted input interpolated into SQL)
    def _lit(s: str) -> str:
        return s.replace("'", "''")

    def _ident(s: str) -> str:
        return s.replace('"', '""')

    cases = ", ".join(
        f"jaro_winkler_similarity('{_lit(typo)}', '{_lit(name)}') AS \"{_ident(name)}\""
        for name in col_names
    )
    row = con.execute(f"SELECT {cases}").fetchone()
    if not row:
        return None

    best_idx = max(range(len(row)), key=lambda i: row[i])
    if row[best_idx] >= threshold:
        return col_names[best_idx]
    return None
