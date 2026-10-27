"""DuckDB query engine — connection factory, query execution, CTE replay, schema inference."""

from __future__ import annotations

import concurrent.futures
import contextlib
import contextvars
import functools
import io
import logging
import re
import shutil
import tempfile
import threading
import weakref
from pathlib import Path
from typing import Any

import duckdb
import pyarrow.parquet as pq

from app.config import (
    CHECKPOINT_EVERY_N_STEPS,
    DUCKDB_MAX_TEMP_SIZE,
    DUCKDB_MEMORY_LIMIT,
    DUCKDB_QUERIES_AT_ONCE,
    DUCKDB_QUERY_TIMEOUT,
    DUCKDB_QUEUE_WAIT_SECONDS,
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


def get_connection(
    *, read: tuple[str | Path, ...] = (), write: tuple[str | Path, ...] = ()
) -> duckdb.DuckDBPyConnection:
    """Create a fresh in-memory DuckDB connection, locked to its files.

    The connection runs SQL a model wrote and reads names a file supplied, so
    it may touch only the files passed here: ``read`` to read, ``write`` to
    COPY into. Every other file, directory listing, ATTACH, extension install
    and network read is refused, and the lock itself cannot be undone from SQL.
    """
    from app import lookups as _lookups

    attached = _lookups.current()
    con = duckdb.connect(":memory:")
    con.execute(f"SET threads={DUCKDB_THREADS}")
    con.execute(f"SET max_memory='{DUCKDB_MEMORY_LIMIT}'")
    # Title case under the names models reach for first (Postgres' initcap,
    # Python's title). DuckDB has neither, so "north" -> "North" used to fail
    # twice and end the turn with an error.
    for name in _TITLE_CASE_NAMES:
        con.execute(f"CREATE OR REPLACE TEMP MACRO {name}(s) AS {_TITLE_CASE_SQL}")
    # The open file's lookup tables, each a view under its alias, as its
    # own steps have left it. Their files join the read list, nothing else.
    _lock_to_files(con, (*read, *(lv.local_path for lv in attached.values())), write)
    for alias, lv in attached.items():
        con.execute(f"CREATE VIEW raw__{alias} AS SELECT * FROM read_parquet('{_sql_path(lv.local_path)}')")
        con.execute(f"CREATE VIEW {alias} AS {_retarget_from_data(build_replay_sql(lv.steps), 'raw__' + alias)}")
    # Inside _run_with_timeout, remember it so the limit can interrupt it
    tracked = getattr(_opened, "cons", None)
    if tracked is not None:
        tracked.append(con)
    return con


# The connections opened by the current _run_with_timeout worker thread
_opened = threading.local()


_TITLE_CASE_NAMES = ("initcap", "title")
_TITLE_CASE_SQL = (
    "array_to_string(list_transform(string_split(lower(s), ' '), "
    "lambda w: upper(left(w, 1)) || substr(w, 2)), ' ')"
)

# Where DuckDB may spill when a query outgrows max_memory: its own directory,
# so allowing it opens nothing else. Each connection spills into a folder of
# its own inside it: two databases spilling into one folder crash the process
# (DuckDB 1.5.3, four 5M-row DISTINCTs at once, every time).
_SPILL_DIR = Path(tempfile.gettempdir()) / "sheetsllm-duckdb-spill"


def _lock_to_files(con, read, write) -> None:
    paths = [_sql_path(p) for p in read]
    for p in write:
        # COPY writes some formats (JSON) to a tmp_ sibling, then renames it
        p = Path(p)
        paths += [_sql_path(p), _sql_path(p.with_name(f"tmp_{p.name}"))]
    _SPILL_DIR.mkdir(parents=True, exist_ok=True)
    own = tempfile.mkdtemp(prefix="con-", dir=_SPILL_DIR)
    # Gone with the connection, whoever closes it
    weakref.finalize(con, shutil.rmtree, own, True)
    spill = _sql_path(own)
    listed = ", ".join(f"'{p}'" for p in paths)
    con.execute(f"SET temp_directory = '{spill}'")
    con.execute(f"SET max_temp_directory_size = '{DUCKDB_MAX_TEMP_SIZE}'")
    con.execute(f"SET allowed_paths = [{listed}]")
    con.execute(f"SET allowed_directories = ['{spill}/']")
    con.execute("SET enable_external_access = false")
    con.execute("SET lock_configuration = true")


_TITLE_CASE_NAMES = ("initcap", "title")
_TITLE_CASE_SQL = (
    "array_to_string(list_transform(string_split(lower(s), ' '), "
    "lambda w: upper(left(w, 1)) || substr(w, 2)), ' ')"
)


class QueryTimeoutError(Exception):
    """Raised when a DuckDB query exceeds the time limit."""


# ── One query at a time ──────────────────────────────────────────────
# Each query may use DUCKDB_MEMORY_LIMIT and more besides, so the queries
# running at once are capped. Work that already holds a turn (insights
# replaying its steps, say) never waits on itself: the turn travels with
# the context into the threads it starts.

_turns = threading.BoundedSemaphore(DUCKDB_QUERIES_AT_ONCE)
_has_turn: contextvars.ContextVar[bool] = contextvars.ContextVar("duckdb_has_turn", default=False)


def _take_turn() -> bool:
    """Wait for a turn. False when this context already has one."""
    if _has_turn.get():
        return False
    if not _turns.acquire(timeout=DUCKDB_QUEUE_WAIT_SECONDS):
        raise QueryTimeoutError("The server is busy with another large file. Try again in a minute.")
    return True


@contextlib.contextmanager
def query_turn():
    """Hold a turn for the queries inside the block."""
    taken = _take_turn()
    token = _has_turn.set(True)
    try:
        yield
    finally:
        _has_turn.reset(token)
        if taken:
            _turns.release()


def one_at_a_time(func):
    """Run ``func`` holding a turn."""

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        with query_turn():
            return func(*args, **kwargs)

    return wrapper


def _run_with_timeout(func, *args, timeout: int = DUCKDB_QUERY_TIMEOUT, interrupt=()):
    """Run a synchronous function, and stop its queries when time runs out.

    Leaving a ``with ThreadPoolExecutor`` block waits for the worker, so the
    old version raised only once the slow query had finished by itself: a
    1s limit on a 17s cross join returned after 17s. Now every connection
    the function opens, and any passed in ``interrupt``, is interrupted at
    the limit, and nothing waits on it.
    """
    opened: list[duckdb.DuckDBPyConnection] = list(interrupt)
    # The time limit counts from the turn, not from joining the queue
    taken = _take_turn()
    # The worker thread gets this request's context (its lookups among it)
    ctx = contextvars.copy_context()
    ctx.run(_has_turn.set, True)

    def run():
        _opened.cons = opened
        try:
            return func(*args)
        finally:
            _opened.cons = None
            # Given back when the queries stop, which may be after the caller
            # has stopped waiting for them
            if taken:
                _turns.release()

    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        return pool.submit(ctx.run, run).result(timeout=timeout)
    except concurrent.futures.TimeoutError:
        for con in opened:
            con.interrupt()
        raise QueryTimeoutError(
            f"Query exceeded {timeout}s time limit. Try a simpler instruction."
        )
    finally:
        pool.shutdown(wait=False)


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
        con = get_connection(read=(local_path,))
        lp = _sql_path(local_path)
        con.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{lp}')")

        # EXPLAIN dry run — catch errors before full execution
        con.execute(f"EXPLAIN {sql}")

        # Never materialize the full result for a preview: a 1M-row result
        # into pandas can OOM the instance. Count server-side, fetch only
        # the preview slice.
        # Newline before the closing paren so a trailing "-- comment" in the
        # query can't comment out the wrapper's syntax.
        total_rows = con.execute(
            f"SELECT COUNT(*) FROM (\n{sql}\n) AS _preview_count"
        ).fetchone()[0]
        # date_as_object: a DATE stays a date ("2026-10-28"); through pandas'
        # datetime64 it would reach the grid as "2026-10-28T00:00:00"
        result = con.execute(
            f"SELECT * FROM (\n{sql}\n) AS _preview LIMIT {int(preview_limit)}"
        ).fetchdf(date_as_object=True)

        total_columns = len(result.columns)
        columns = [str(c) for c in result.columns]

        import numpy as np

        preview = result.replace({np.nan: None})
        preview_rows = preview.to_dict(orient="records")

        return {
            "preview": preview_rows,
            "columns": columns,
            "total_rows": int(total_rows),
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
    """Replay transformation steps using a local Parquet file (cached).

    Long chains resume from the nearest materialized checkpoint instead of
    replaying everything from base (see _resolve_checkpoint)."""
    target_steps = steps[:up_to] if up_to is not None else steps
    source, remaining = _resolve_checkpoint(local_path, target_steps)
    sql = build_replay_sql(remaining)
    return execute_sql_from_local(source, sql, preview_limit=preview_limit)


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


# ── What an expression would lose ────────────────────────────────────


def values_lost_by(
    local_path: str | Path, steps: list[dict], column: str, expr: str,
    *, examples: int = 3, timeout: int | None = None,
) -> dict[str, Any]:
    """How many filled values of ``column`` become NULL under ``expr`` (an
    expression over the table data, as the steps so far have left it), with
    a few distinct examples. The examples are the user's own cells, shown
    back to them; they go nowhere else."""
    from app.ops import quote_ident

    def _inner():
        con = get_connection(read=(local_path,))
        con.execute(f"CREATE VIEW raw AS SELECT * FROM read_parquet('{_sql_path(local_path)}')")
        con.execute(f"CREATE VIEW data AS {_retarget_from_data(build_replay_sql(steps), 'raw')}")
        q = quote_ident(column)
        lost = f"{q} IS NOT NULL AND TRIM(CAST({q} AS VARCHAR)) <> '' AND ({expr}) IS NULL"
        count = con.execute(f"SELECT COUNT(*) FROM data WHERE {lost}").fetchone()[0]
        sample = con.execute(
            f"SELECT DISTINCT CAST({q} AS VARCHAR) FROM data WHERE {lost} ORDER BY 1 LIMIT {int(examples)}"
        ).fetchall()
        return {"count": int(count), "examples": [str(r[0]) for r in sample]}

    return _run_with_timeout(_inner, timeout=timeout if timeout is not None else DUCKDB_QUERY_TIMEOUT)


def count_on_current(local_path: str | Path, steps: list[dict], count_sql: str, *, timeout: int | None = None) -> int:
    """One COUNT query over the table data as the steps have left it."""

    def _inner():
        con = get_connection(read=(local_path,))
        con.execute(f"CREATE VIEW raw AS SELECT * FROM read_parquet('{_sql_path(local_path)}')")
        con.execute(f"CREATE VIEW data AS {_retarget_from_data(build_replay_sql(steps), 'raw')}")
        return int(con.execute(count_sql).fetchone()[0] or 0)

    return _run_with_timeout(_inner, timeout=timeout if timeout is not None else DUCKDB_QUERY_TIMEOUT)


# ── Paging the grid ──────────────────────────────────────────────────


def _qi(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def page_rows(
    local_path: str | Path,
    steps: list[dict],
    *,
    offset: int = 0,
    limit: int = MAX_PREVIEW_ROWS,
    sort: str | None = None,
    descending: bool = False,
    q: str | None = None,
    empty: str | None = None,
    timeout: int | None = None,
) -> dict[str, Any]:
    """A page of the file as the steps left it, optionally sorted, filtered
    to rows containing `q` in any column, or to rows where `empty` has no
    value. A view only: nothing is saved. Column names are checked against
    the result's own columns; `q` is bound as a parameter."""
    source, remaining = _resolve_checkpoint(local_path, steps)
    sql = build_replay_sql(remaining)

    def _inner():
        con = get_connection(read=(source,))
        con.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{_sql_path(source)}')")
        columns = [str(r[0]) for r in con.execute(f"DESCRIBE SELECT * FROM (\n{sql}\n) AS _d").fetchall()]
        where: list[str] = []
        params: list[Any] = []
        if q:
            where.append("(" + " OR ".join(f"CAST({_qi(c)} AS VARCHAR) ILIKE ?" for c in columns) + ")")
            params.extend([f"%{q}%"] * len(columns))
        if empty:
            if empty not in columns:
                raise ValueError(f"No column named {empty!r}")
            where.append(f"({_qi(empty)} IS NULL OR TRIM(CAST({_qi(empty)} AS VARCHAR)) = '')")
        order = "_rn"
        if sort:
            if sort not in columns:
                raise ValueError(f"No column named {sort!r}")
            order = f"{_qi(sort)} {'DESC' if descending else 'ASC'} NULLS LAST, _rn"
        clause = f"WHERE {' AND '.join(where)}" if where else ""
        base = f"SELECT *, row_number() OVER () AS _rn FROM (\n{sql}\n) AS _v"
        total = con.execute(f"SELECT COUNT(*) FROM ({base}) AS _b {clause}", params).fetchone()[0]
        frame = con.execute(
            f"SELECT * EXCLUDE (_rn) FROM ({base}) AS _b {clause} ORDER BY {order} "
            f"LIMIT {max(1, min(int(limit), 2000))} OFFSET {max(0, int(offset))}",
            params,
        ).fetchdf(date_as_object=True)
        import numpy as np

        rows = frame.replace({np.nan: None}).to_dict(orient="records")
        return {"columns": columns, "rows": rows, "total_rows": int(total), "total_columns": len(columns), "offset": int(offset)}

    return _run_with_timeout(_inner, timeout=timeout if timeout is not None else DUCKDB_QUERY_TIMEOUT)


def changed_cells(
    local_path: str | Path, steps: list[dict], step_sql: str, column: str, *, timeout: int | None = None
) -> int | None:
    """How many cells of `column` the step changed, row for row, or None
    when the step changed the row count or dropped the column. Compared as
    text, so a type change that keeps the value is not a change."""

    def _inner():
        con = get_connection(read=(local_path,))
        con.execute(f"CREATE VIEW raw AS SELECT * FROM read_parquet('{_sql_path(local_path)}')")
        before = _retarget_from_data(build_replay_sql(steps), "raw")
        con.execute(f"CREATE VIEW data AS {before}")
        after = step_sql
        cols_after = [str(r[0]) for r in con.execute(f"DESCRIBE SELECT * FROM (\n{after}\n) AS _d").fetchall()]
        cols_before = [str(r[0]) for r in con.execute("DESCRIBE SELECT * FROM data").fetchall()]
        if column not in cols_after or column not in cols_before:
            return None
        n_before = con.execute("SELECT COUNT(*) FROM data").fetchone()[0]
        n_after = con.execute(f"SELECT COUNT(*) FROM (\n{after}\n) AS _a").fetchone()[0]
        if n_before != n_after:
            return None
        c = _qi(column)
        return int(con.execute(
            f"SELECT COUNT(*) FROM (SELECT row_number() OVER () AS rn, CAST({c} AS VARCHAR) AS v FROM data) AS a "
            f"JOIN (SELECT row_number() OVER () AS rn, CAST({c} AS VARCHAR) AS v FROM (\n{after}\n) AS _a) AS b "
            f"USING (rn) WHERE a.v IS DISTINCT FROM b.v"
        ).fetchone()[0])

    return _run_with_timeout(_inner, timeout=timeout if timeout is not None else DUCKDB_QUERY_TIMEOUT)


# ── Checking a chain before it is saved ──────────────────────────────


def first_failing_step(
    local_path: str | Path, steps: list[dict], *, timeout: int | None = None
) -> int | None:
    """The 1-based position of the first step that cannot run on this file
    after the steps before it, or None when the whole chain plans. An
    EXPLAIN per prefix: a step that uses a column a later step adds, or one
    a removed step used to add, fails to bind and is named."""

    def _inner():
        con = get_connection(read=(local_path,))
        con.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{_sql_path(local_path)}')")
        for k in range(1, len(steps) + 1):
            try:
                con.execute(f"EXPLAIN {build_replay_sql(steps, up_to=k)}")
            except Exception:
                return k
        return None

    return _run_with_timeout(_inner, timeout=timeout if timeout is not None else DUCKDB_QUERY_TIMEOUT)


# ── Measuring a run ──────────────────────────────────────────────────


def measure_run(
    local_path: str | Path,
    steps: list[dict],
    start: int,
    check_queries: list[str | None],
    *,
    timeout: int | None = None,
) -> tuple[list[int], list[int | None]]:
    """Rows before steps[start] and after each later step, and the count of
    rows breaking each check (None for a check whose SQL is None).

    The checks read the fully cleaned rows as a view named r.
    """

    def _inner():
        con = get_connection(read=(local_path,))
        lp = _sql_path(local_path)
        con.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{lp}')")
        counts = [
            int(con.execute(f"SELECT COUNT(*) FROM ({build_replay_sql(steps, up_to=k)})").fetchone()[0])
            for k in range(start, len(steps) + 1)
        ]
        con.execute(f"CREATE VIEW r AS {build_replay_sql(steps)}")
        failed = [
            None if q is None else int(con.execute(q).fetchone()[0] or 0)
            for q in check_queries
        ]
        return counts, failed

    return _run_with_timeout(_inner, timeout=timeout if timeout is not None else DUCKDB_QUERY_TIMEOUT)


# ── Chain checkpoints ─────────────────────────────────────────────────


def _materialize_segment(
    source_path: str | Path, steps: list[dict], out_path: str
) -> None:
    """COPY the replay of ``steps`` over ``source_path`` to a Parquet file."""
    sql = build_replay_sql(steps)

    def _inner():
        con = get_connection(read=(source_path,), write=(out_path,))
        sp = _sql_path(source_path)
        con.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{sp}')")
        op = _sql_path(out_path)
        con.execute(f"COPY (\n{sql}\n) TO '{op}' (FORMAT PARQUET, COMPRESSION ZSTD)")

    _run_with_timeout(_inner)


def _resolve_checkpoint(
    local_path: str | Path, steps: list[dict]
) -> tuple[str, list[dict]]:
    """Reduce a replay to (source_parquet, remaining_steps).

    Every CHECKPOINT_EVERY_N_STEPS steps the intermediate result is
    materialized to a local Parquet (content-addressed by base path +
    the exact SQL prefix, so undo/revert/edit hashes differently and
    just misses — no invalidation logic). Replays then run at most
    ~N steps from the nearest checkpoint instead of the whole chain.
    Fails open to a full replay from base on any error.
    """
    n = len(steps)
    k_interval = CHECKPOINT_EVERY_N_STEPS
    if k_interval <= 0 or n < k_interval:
        return str(local_path), steps
    k = (n // k_interval) * k_interval

    from app import cache  # deferred: cache imports storage; keep engine light

    try:
        # Nearest existing checkpoint at a multiple of the interval
        base_path, base_k = str(local_path), 0
        for kk in range(k, 0, -k_interval):
            hit = cache.get_checkpoint(cache.checkpoint_key(local_path, steps[:kk]))
            if hit:
                base_path, base_k = hit, kk
                break

        if base_k < k:
            # Advance the checkpoint to k with one bounded query
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".parquet")
            tmp.close()
            _materialize_segment(base_path, steps[base_k:k], tmp.name)
            cache.set_checkpoint(
                cache.checkpoint_key(local_path, steps[:k]), tmp.name
            )
            logger.info(
                "Chain checkpoint materialized at step %d (from %d)", k, base_k
            )
            base_path, base_k = tmp.name, k

        return base_path, steps[base_k:]
    except Exception as exc:
        logger.warning(
            "Checkpoint resolution failed, falling back to full replay: %s", exc
        )
        return str(local_path), steps


# ── Full result (for downloads) ──────────────────────────────────────


def execute_full_result_local(
    local_path: str | Path,
    steps: list[dict],
) -> "duckdb.DuckDBPyConnection":
    """Replay all steps from a local Parquet file. Returns DuckDB result."""
    source, remaining = _resolve_checkpoint(local_path, steps)
    sql = build_replay_sql(remaining)
    con = get_connection(read=(source,))
    lp = _sql_path(source)
    con.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{lp}')")
    return con.execute(sql)


# COPY options per export format. JSON uses ARRAY true so the output is a
# single array of records, matching the shape pandas to_json(orient='records')
# used to produce.
_EXPORT_COPY_OPTIONS = {
    "csv": "FORMAT CSV, HEADER",
    "tsv": "FORMAT CSV, HEADER, DELIMITER '\\t'",
    "json": "FORMAT JSON, ARRAY true",
    "parquet": "FORMAT PARQUET, COMPRESSION ZSTD",
}


def export_full_result_local(
    local_path: str | Path,
    steps: list[dict],
    fmt: str,
    out_path: str | Path,
    *,
    timeout: int | None = None,
) -> None:
    """Replay all steps and COPY the result straight to ``out_path``.

    The result set goes DuckDB → disk without ever materializing in Python
    memory (a 1M-row fetchdf() could OOM the instance)."""
    options = _EXPORT_COPY_OPTIONS.get(fmt)
    if options is None:
        raise ValueError(f"Unsupported export format: {fmt}")
    source, remaining = _resolve_checkpoint(local_path, steps)
    sql = build_replay_sql(remaining)

    def _inner():
        con = get_connection(read=(source,), write=(out_path,))
        lp = _sql_path(source)
        con.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{lp}')")
        op = _sql_path(out_path)
        con.execute(f"COPY (\n{sql}\n) TO '{op}' ({options})")

    t = timeout if timeout is not None else DUCKDB_QUERY_TIMEOUT
    _run_with_timeout(_inner, timeout=t)


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
    con = get_connection(read=(local_path,))
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

    source, remaining = _resolve_checkpoint(local_path, steps)
    replay = build_replay_sql(remaining)

    def _inner():
        con = get_connection(read=(source,))
        lp = _sql_path(source)
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


class TooManyRowsError(UnreadableFileError):
    """The file is over the per-file row limit. Refused whole: keeping the
    first MAX_ROWS rows would quietly drop the rest of someone's data."""

    def __init__(self, rows: int | None = None):
        size = f"{rows:,} rows" if rows and rows > MAX_ROWS + 1 else f"more than {MAX_ROWS:,} rows"
        super().__init__(
            f"This file has {size}, over the {MAX_ROWS:,} row limit per file. "
            "Upload its first rows, or split it into smaller files and upload each one."
        )


def _csv_source(path: str, delim: str | None, *, lenient: bool) -> str:
    delim_arg = f", delim='{delim}'" if delim else ""
    # The parallel reader cannot pad short rows when a cell holds a newline:
    # DuckDB 1.x read such a file as one column, 2.0 refuses it
    extra = ", strict_mode=false, null_padding=true, parallel=false" if lenient else ""
    return f"SELECT * FROM read_csv_auto('{path}'{delim_arg}{extra})"


_UNREADABLE_CSV = (
    "We couldn't read this file as a CSV. It may use inconsistent "
    "formatting: mixed line endings, uneven columns, or an unusual "
    "delimiter. Re-saving it as a standard CSV from your spreadsheet "
    "tool usually fixes this."
)


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


# A workbook whose parts unzip to more than this is refused unread: a small
# crafted file can otherwise inflate to fill the disk or the memory
_WORKBOOK_MAX_UNZIPPED = 2 * 1024 * 1024 * 1024


def _workbook_to_csv(src: str, sheet_name: str | None) -> tuple[str, list[str], set[int]]:
    """Copy one sheet of a workbook to a CSV, a row at a time.

    pandas.read_excel holds the whole sheet as cells and then as a frame:
    about 25 MB of memory per MB of .xlsx (a 24.7 MB workbook peaked at
    746 MB). Read-only openpyxl hands over one row at a time, so only the
    shared strings stay in memory (the same workbook peaked at 223 MB).

    Returns the CSV's path, the header row's names, and the columns holding
    any text: those are read back as text, so "00123" keeps its zeros.
    """
    import csv
    import datetime as dt
    import zipfile

    from openpyxl import load_workbook

    if sum(i.file_size for i in zipfile.ZipFile(src).infolist()) > _WORKBOOK_MAX_UNZIPPED:
        raise UnreadableFileError("This workbook unpacks to more than 2 GB, so it can't be opened safely.")

    def cell(v):
        if v is None:
            return ""
        if isinstance(v, dt.datetime):
            return v.isoformat(sep=" ")
        if isinstance(v, (dt.date, dt.time)):
            return v.isoformat()
        return v

    wb = load_workbook(src, read_only=True, data_only=True)
    out = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="", encoding="utf-8")
    header: list | None = None
    text: set[int] = set()
    width = 0
    blank = 0  # empty rows held back: written only if a row follows them
    try:
        ws = wb[sheet_name] if sheet_name else wb.worksheets[0]
        # "\n" throughout: a line break inside a cell is "\n", and DuckDB
        # refuses a file that mixes it with "\r\n" row ends
        writer = csv.writer(out, lineterminator="\n")
        for row in ws.iter_rows(values_only=True):
            if header is None:
                header = list(row)
                continue
            if all(v is None for v in row):
                blank += 1
                continue
            for _ in range(blank):
                writer.writerow([""])
            blank = 0
            width = max(width, len(row))
            for i, v in enumerate(row):
                if isinstance(v, str):
                    text.add(i)
            writer.writerow([cell(v) for v in row])
    finally:
        out.close()
        wb.close()
    header = header or []
    width = max(width, len(header))
    # Named as pandas named them, so a file reads the same as it used to
    names = [f"Unnamed: {i}" if i >= len(header) or header[i] is None else str(header[i]) for i in range(width)]
    return out.name, names, text


@one_at_a_time
def convert_path_to_parquet(
    src_path: str | Path, filename: str, *, sheet_name: str | None = None
) -> tuple[bytes, int, int]:
    """Convert a CSV/TSV/JSON/XLSX/Parquet file on disk to Parquet.
    Returns (parquet_bytes, row_count, column_count).

    DuckDB reads the file and writes the Parquet straight to disk, so a
    large upload is never held whole in memory (a 1M-row CSV used to peak
    at over 500 MB this way). It reads at most MAX_ROWS + 1 rows: a file
    over the cap is refused as soon as that is known, not after a full read.
    Column names get the same cleaning as before.
    """
    lower = filename.lower()
    src = str(src_path)
    sql_src = _sql_path(src)

    if lower.endswith(".parquet") or lower.endswith(".pq"):
        meta = pq.ParquetFile(src).metadata
        if meta.num_rows > MAX_ROWS:
            raise TooManyRowsError(meta.num_rows)
        names = [str(n) for n in pq.ParquetFile(src).schema_arrow.names]
        if sanitize_column_names(names) == names:
            return Path(src).read_bytes(), meta.num_rows, meta.num_columns

    labels: list[str] | None = None
    sheet_csv: str | None = None
    if lower.endswith((".xlsx", ".xlsm")):
        sheet_csv, labels, text = _workbook_to_csv(src, sheet_name)
    out = tempfile.NamedTemporaryFile(delete=False, suffix=".parquet")
    out.close()
    con = get_connection(read=(src, *([sheet_csv] if sheet_csv else [])), write=(out.name,))
    try:
        if lower.endswith(".parquet") or lower.endswith(".pq"):
            sources = [f"SELECT * FROM read_parquet('{sql_src}')"]
        elif sheet_csv is not None:
            columns = [f"c{i}" for i in range(len(labels))]
            as_text = ", ".join(f"'c{i}': 'VARCHAR'" for i in sorted(text) if i < len(columns))
            types = f"types={{{as_text}}}, " if as_text else ""
            sources = [
                f"SELECT * FROM read_csv('{_sql_path(sheet_csv)}', header=false, names={columns!r}, "
                f"{types}delim=',', quote='\"', escape='\"', new_line='\\n', null_padding=true, parallel=false, sample_size=-1)"
            ] if columns else ["SELECT 1 WHERE false"]
        elif lower.endswith(".xls"):
            import pandas as pd

            df = pd.read_excel(src, sheet_name=sheet_name or 0)
            con.register("staging", df)
            sources = ["SELECT * FROM staging"]
        elif lower.endswith(".json") or lower.endswith(".jsonl"):
            sources = [f"SELECT * FROM read_json_auto('{sql_src}')"]
        else:
            delim = "\\t" if lower.endswith(".tsv") else None
            # Strict first; real-world exports (mixed line endings, ragged
            # rows) get a lenient second attempt
            sources = [_csv_source(sql_src, delim, lenient=False), _csv_source(sql_src, delim, lenient=True)]

        last_exc: Exception | None = None
        for i, source in enumerate(sources):
            try:
                names = [str(r[0]) for r in con.execute(f"DESCRIBE {source}").fetchall()]
                clean = sanitize_column_names(labels if labels is not None and len(labels) == len(names) else names)
                select = ", ".join(f"{_quote(n)} AS {_quote(c)}" for n, c in zip(names, clean))
                con.execute(
                    f"COPY (SELECT {select} FROM ({source}) LIMIT {MAX_ROWS + 1}) "
                    f"TO '{_sql_path(out.name)}' (FORMAT parquet, COMPRESSION zstd)"
                )
                break
            except Exception as exc:
                last_exc = exc
                if i + 1 < len(sources):
                    logger.warning("csv strict parse failed, retrying leniently: %s", exc)
        else:
            if lower.endswith((".csv", ".tsv", ".txt")) or not lower.endswith((".json", ".jsonl", ".xlsx", ".xlsm", ".xls", ".parquet", ".pq")):
                raise UnreadableFileError(_UNREADABLE_CSV) from last_exc
            raise last_exc  # type: ignore[misc]

        meta = pq.ParquetFile(out.name).metadata
        if meta.num_rows > MAX_ROWS:
            raise TooManyRowsError()
        return Path(out.name).read_bytes(), meta.num_rows, meta.num_columns
    finally:
        con.close()
        Path(out.name).unlink(missing_ok=True)
        if sheet_csv:
            Path(sheet_csv).unlink(missing_ok=True)


def convert_to_parquet(
    file_bytes: bytes, filename: str, *, sheet_name: str | None = None
) -> tuple[bytes, int, int]:
    """Convert CSV/XLSX/JSON/TSV/Parquet bytes to Parquet.
    Returns (parquet_bytes, row_count, column_count). For a file already on
    disk, convert_path_to_parquet avoids holding it in memory."""
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix)
    try:
        tmp.write(file_bytes)
        tmp.close()
        return convert_path_to_parquet(tmp.name, filename, sheet_name=sheet_name)
    finally:
        Path(tmp.name).unlink(missing_ok=True)


def detect_sheets(file_bytes: bytes, filename: str) -> list[str] | None:
    """
    If the file is a multi-sheet XLSX, return sheet names.
    Otherwise return None.
    """
    lower = filename.lower()
    if not (lower.endswith(".xlsx") or lower.endswith(".xls")):
        return None

    import pandas as pd

    try:
        excel = pd.ExcelFile(io.BytesIO(file_bytes))
    except Exception as exc:
        # Corrupt/truncated workbook — don't 500 here; let the conversion
        # path produce its friendly CONVERSION_FAILED error instead.
        logger.warning("Sheet detection failed for %s: %s", filename, exc)
        return None
    if len(excel.sheet_names) > 1:
        return excel.sheet_names
    return None


def sheet_row_counts(file_bytes: bytes, filename: str) -> dict[str, int | None]:
    """Rows per sheet of an .xlsx, below a header row, read from each
    sheet's recorded dimensions without loading the cells. None where a
    sheet does not record them; {} for anything that is not an .xlsx."""
    if not filename.lower().endswith(".xlsx"):
        return {}
    try:
        from openpyxl import load_workbook

        wb = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    except Exception as exc:
        logger.warning("Sheet row count failed for %s: %s", filename, exc)
        return {}
    counts: dict[str, int | None] = {}
    try:
        for ws in wb.worksheets:
            rows = ws.max_row
            counts[ws.title] = None if rows is None else max(rows - 1, 0)
    finally:
        wb.close()
    return counts


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

    con = get_connection(read=(local_path,))
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
