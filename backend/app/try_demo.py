"""The try page: the real engine on a bundled sample, with no account.

A visitor opens October's orders, applies one-click fixes, and runs the
same steps on November's file. Nothing is stored: every request carries
the list of fixes so far as op requests (never SQL), and each step's SQL is
rebuilt here by the same templates and validator /transform/op uses, then
replayed on a Parquet copy of the sample made once per process. No AI is
called, so Chef stays behind sign-up.
"""
from __future__ import annotations

import hashlib
import logging
import tempfile
import threading
from pathlib import Path

from app.engine import convert_to_parquet, get_schema_after_steps, measure_run, page_rows
from app.insights import generate_insights
from app.ops import OpError, build_op
from app.sql_validator import validate_sql

logger = logging.getLogger("sheetsllm.try")

SAMPLES_DIR = Path(__file__).parent / "samples"
# The one sample the page runs, a month at a time
MONTHS = {"oct": "orders_oct.csv", "nov": "orders_nov.csv"}
# One-click fixes only: a join needs a linked lookup, which a visitor has none of
ALLOWED_OPS = frozenset({
    "trim", "drop_column", "rename", "fill_nulls", "drop_empty_rows", "dedupe", "cast",
    "standardise_date", "clean_number", "sort", "contains_any", "filter_rows", "replace_value",
})
MAX_STEPS = 12
PREVIEW_ROWS = 200

_lock = threading.Lock()
_parquet: dict[str, Path] = {}


class TryError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.status = code, status


def sample_path(month: str) -> Path:
    """The month's sample as Parquet, converted on first use."""
    if month not in MONTHS:
        raise TryError("UNKNOWN_SAMPLE", "That sample isn't one the try page has.")
    with _lock:
        path = _parquet.get(month)
        if path is None or not path.exists():
            data = (SAMPLES_DIR / MONTHS[month]).read_bytes()
            parquet, _rows, _cols = convert_to_parquet(data, MONTHS[month])
            path = Path(tempfile.gettempdir()) / f"sllm_try_{month}.parquet"
            path.write_bytes(parquet)
            _parquet[month] = path
        return path


def _clean_request(raw: object) -> dict:
    if not isinstance(raw, dict):
        raise TryError("INVALID_STEP", "Each step is an object with an op.")
    op = raw.get("op")
    if op not in ALLOWED_OPS:
        raise TryError("OP_NOT_ALLOWED", "The try page runs one-click fixes only.")
    column = raw.get("column")
    if column is not None and (not isinstance(column, str) or len(column) > 200):
        raise TryError("INVALID_STEP", "A step's column is a short name.")
    args = raw.get("args")
    if args is not None and not isinstance(args, dict):
        raise TryError("INVALID_STEP", "A step's args are an object.")
    return {"op": op, "column": column, "args": args}


def build_steps(path: Path, requests: list) -> list[dict]:
    """Each op request as a step, its SQL built against the columns the
    steps before it left."""
    if not isinstance(requests, list):
        raise TryError("INVALID_STEPS", "steps is a list.")
    if len(requests) > MAX_STEPS:
        raise TryError("TOO_MANY_STEPS", f"The try page keeps up to {MAX_STEPS} steps. Sign up to keep going.")
    steps: list[dict] = []
    for i, raw in enumerate(requests, start=1):
        req = _clean_request(raw)
        schema = get_schema_after_steps(path, steps)
        try:
            sql, instruction = build_op(req["op"], schema.get("columns", []), req["column"], req["args"])
            sql = validate_sql(sql)
        except OpError as exc:
            raise TryError(exc.code, f"Step {i}: {exc}") from exc
        steps.append({"step_number": i, "instruction": instruction, "sql_query": sql})
    return steps


def run(month: str, requests: list) -> dict:
    """The sample after the steps: a page of rows, the steps as words, the
    row count before and after each step, and what is still worth fixing."""
    path = sample_path(month)
    steps = build_steps(path, requests)
    try:
        page = page_rows(path, steps, limit=PREVIEW_ROWS)
        counts, _ = measure_run(path, steps, 0, [])
    except TryError:
        raise
    except Exception as exc:
        logger.warning("try: replay failed: %s", exc)
        raise TryError("EXECUTION_FAILED", "Those steps didn't run on this file.") from exc
    try:
        insights = generate_insights(path, steps, budget=4.0)
    except Exception as exc:
        logger.warning("try: insights failed: %s", exc)
        insights = {"suggestions": [], "null_columns": [], "duplicate_rows": 0}
    return {
        "month": month,
        "columns": page["columns"],
        "rows": page["rows"],
        "total_rows": page["total_rows"],
        "total_columns": page["total_columns"],
        "steps": [{"step_number": s["step_number"], "instruction": s["instruction"]} for s in steps],
        # counts[0] is the file as it came; counts[k] is after step k
        "row_counts": counts,
        "suggestions": insights.get("suggestions", []),
        "null_columns": insights.get("null_columns", []),
        "duplicate_rows": insights.get("duplicate_rows", 0),
    }


def visitor_key(ip: str | None) -> str:
    """A stable, non-identifying key for a visitor: never the address itself."""
    digest = hashlib.sha256(f"sllm-try:{ip or 'unknown'}".encode()).hexdigest()[:16]
    return f"try:{digest}"
