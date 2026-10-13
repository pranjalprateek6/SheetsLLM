"""Questions answered by running a query, not by guessing from samples.

When someone asks "which region sold most" or "how many rows have no
email", Chef writes a read-only query and the server runs it on the whole
file as the steps so far have left it. The result, not the file, is what the
person sees, and nothing from the file goes to the model. That is what makes
a question answerable in strict privacy mode at all.
"""

from __future__ import annotations

import datetime as _dt
import decimal
import json
import math
from pathlib import Path
from typing import Any

from app.engine import (
    DUCKDB_QUERY_TIMEOUT,
    _retarget_from_data,
    _run_with_timeout,
    _sql_path,
    build_replay_sql,
    get_connection,
)

# How many result rows a question may show. A question wants an answer, not
# a second grid; the model is told to aggregate.
ANSWER_MAX_ROWS = 50
ANSWER_MAX_COLUMNS = 12


def extract_query(raw: str) -> str | None:
    """The query inside a {"query": "..."} reply, or None when the reply is
    not one. The model answers a question about values this way."""
    stripped = raw.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`").removeprefix("json").strip()
    if not (stripped.startswith("{") and "query" in stripped):
        return None
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        return None
    query = parsed.get("query") if isinstance(parsed, dict) else None
    return query.strip() if isinstance(query, str) and query.strip() else None


def run_question(
    local_path: str | Path,
    steps: list[dict],
    sql: str,
    *,
    limit: int = ANSWER_MAX_ROWS,
    timeout: int | None = None,
) -> dict[str, Any]:
    """Run ``sql``, which reads a table named data, against the file as the
    steps have left it. Returns columns, at most ``limit`` rows, and the full
    row count. Nothing is written and no step is saved."""

    def _inner():
        con = get_connection(read=(local_path,))
        con.execute(f"CREATE VIEW raw AS SELECT * FROM read_parquet('{_sql_path(local_path)}')")
        # "data" is the current state, so the question's SQL needs no rewriting
        con.execute(f"CREATE VIEW data AS {_retarget_from_data(build_replay_sql(steps), 'raw')}")
        con.execute(f"EXPLAIN {sql}")
        total = con.execute(f"SELECT COUNT(*) FROM (\n{sql}\n) AS _answer_count").fetchone()[0]
        frame = con.execute(f"SELECT * FROM (\n{sql}\n) AS _answer LIMIT {int(limit)}").fetchdf(date_as_object=True)
        columns = [str(c) for c in frame.columns][:ANSWER_MAX_COLUMNS]
        rows = [
            {c: _jsonable(v) for c, v in zip(columns, record)}
            for record in frame.itertuples(index=False, name=None)
        ]
        return {"columns": columns, "rows": rows, "total_rows": int(total)}

    return _run_with_timeout(_inner, timeout=timeout if timeout is not None else DUCKDB_QUERY_TIMEOUT)


def _jsonable(value: Any) -> Any:
    """A cell as plain JSON: numbers, strings, booleans or None."""
    if value is None:
        return None
    try:
        import pandas as pd

        # pandas marks a missing date as NaT and a missing number as NaN
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, bool):
        return value
    if isinstance(value, float):
        return None if math.isnan(value) else value
    if isinstance(value, int):
        return value
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, (_dt.date, _dt.datetime)):
        return value.isoformat()
    if hasattr(value, "item"):  # numpy scalars
        try:
            return _jsonable(value.item())
        except Exception:
            pass
    return str(value)


def format_value(value: Any) -> str:
    """A cell for the answer line: thousands separated, two decimals at most."""
    if value is None:
        return "empty"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, int):
        return f"{value:,}"
    if isinstance(value, float):
        if value.is_integer():
            return f"{int(value):,}"
        return f"{value:,.2f}"
    return str(value)


def answer_text(columns: list[str], rows: list[dict], total_rows: int) -> str:
    """The line above the result: the value itself when there is one, the
    pairs when there is one row, and the row count otherwise."""
    if total_rows == 0 or not rows:
        return "No rows match that."
    if total_rows == 1 and len(columns) == 1:
        return f"{columns[0]}: {format_value(rows[0].get(columns[0]))}"
    if total_rows == 1:
        return " · ".join(f"{c}: {format_value(rows[0].get(c))}" for c in columns)
    if total_rows > len(rows):
        return f"{total_rows:,} rows. Here are the first {len(rows)}."
    return f"{total_rows:,} rows."
