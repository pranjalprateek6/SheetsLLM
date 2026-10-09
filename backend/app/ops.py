"""Deterministic operations: the fixes that need no AI.

Each op turns {column, args} into one SELECT over `data` from a server-side
template, never from client SQL, plus the human instruction the step is
saved under ("Trim whitespace in Email"). The step then goes through the
same validator, replay and history as an AI step, so it can be undone,
saved into a recipe and replayed with no AI call.

Steps are stored and replayed as SQL text, so values cannot stay bound
parameters: identifiers are quoted with quote_ident and values with
quote_literal (quotes doubled), and everything else comes from allow-lists.
"""

from __future__ import annotations

import math
from typing import Any, Callable

STRING_TYPES = ("VARCHAR", "TEXT", "STRING", "CHAR", "BPCHAR")
NUMERIC_TYPES = (
    "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT", "UTINYINT", "USMALLINT",
    "UINTEGER", "UBIGINT", "FLOAT", "REAL", "DOUBLE", "DECIMAL", "NUMERIC",
)

CAST_TYPES = {"INTEGER": "BIGINT", "DOUBLE": "DOUBLE", "DATE": "DATE", "VARCHAR": "VARCHAR"}

# strptime formats a user can pick; "auto" tries them in order.
DATE_FORMATS = {
    "%Y-%m-%d": "2026-10-31",
    "%d/%m/%Y": "31/10/2026",
    "%m/%d/%Y": "10/31/2026",
    "%d-%m-%Y": "31-10-2026",
    "%d.%m.%Y": "31.10.2026",
    "%Y/%m/%d": "2026/10/31",
    "%d %b %Y": "31 Oct 2026",
    "%b %d, %Y": "Oct 31, 2026",
}

MAX_NAME = 100
MAX_VALUE = 500


class OpError(ValueError):
    """A request the op cannot run: unknown op, column, type or format."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def quote_ident(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def quote_literal(value: Any) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _base(dtype: str) -> str:
    return str(dtype or "").split("(")[0].strip().upper()


def is_string(dtype: str) -> bool:
    return _base(dtype) in STRING_TYPES


def is_numeric(dtype: str) -> bool:
    return _base(dtype) in NUMERIC_TYPES


def _column(cols: dict[str, str], column: Any) -> str:
    if not isinstance(column, str) or column not in cols:
        raise OpError("UNKNOWN_COLUMN", f"There is no column named {column!r} in this file.")
    return column


def _columns(cols: dict[str, str], columns: Any) -> list[str]:
    if columns in (None, [], ""):
        return []
    if not isinstance(columns, list):
        raise OpError("INVALID_ARGS", "columns must be a list of column names.")
    return [_column(cols, c) for c in columns]


def _text(value: Any, what: str, limit: int) -> str:
    if not isinstance(value, (str, int, float)) or isinstance(value, bool):
        raise OpError("INVALID_ARGS", f"{what} is required.")
    text = str(value)
    if not text.strip():
        raise OpError("INVALID_ARGS", f"{what} is required.")
    if len(text) > limit:
        raise OpError("INVALID_ARGS", f"{what} is longer than {limit} characters.")
    return text


def _select_replacing(cols: dict[str, str], column: str, expr: str) -> str:
    return f"SELECT * REPLACE ({expr} AS {quote_ident(column)}) FROM data"


# ── The ops ──────────────────────────────────────────────────────────


def _trim(cols, column, args):
    c = _column(cols, column)
    if not is_string(cols[c]):
        raise OpError("WRONG_TYPE", f"{c} is not a text column, so there is no whitespace to trim.")
    return _select_replacing(cols, c, f"TRIM({quote_ident(c)})"), f"Trim whitespace in {c}"


def _drop_column(cols, column, args):
    c = _column(cols, column)
    if len(cols) <= 1:
        raise OpError("INVALID_ARGS", "A file needs at least one column.")
    return f"SELECT * EXCLUDE ({quote_ident(c)}) FROM data", f"Drop column {c}"


def _rename(cols, column, args):
    c = _column(cols, column)
    new = _text(args.get("new_name"), "A new name", MAX_NAME).strip()
    if new == c:
        raise OpError("INVALID_ARGS", f"{c} already has that name.")
    if new in cols:
        raise OpError("INVALID_ARGS", f"There is already a column named {new}.")
    # An explicit list keeps the column where it was
    parts = [
        f"{quote_ident(name)} AS {quote_ident(new)}" if name == c else quote_ident(name)
        for name in cols
    ]
    return f"SELECT {', '.join(parts)} FROM data", f"Rename {c} to {new}"


def _fill_nulls(cols, column, args):
    c = _column(cols, column)
    raw = _text(args.get("value"), "A value to fill with", MAX_VALUE)
    q = quote_ident(c)
    if is_numeric(cols[c]):
        try:
            number = float(raw)
        except ValueError:
            raise OpError("WRONG_TYPE", f"{c} holds numbers, so the fill value must be a number.")
        if not math.isfinite(number):
            raise OpError("WRONG_TYPE", f"{c} holds numbers, so the fill value must be a number.")
        expr = f"COALESCE({q}, CAST({quote_literal(raw.strip())} AS {cols[c]}))"
    elif is_string(cols[c]):
        # Blank text counts as empty too
        expr = f"COALESCE(NULLIF(TRIM({q}), ''), {quote_literal(raw)})"
    else:
        expr = f"COALESCE({q}, CAST({quote_literal(raw)} AS {cols[c]}))"
    return _select_replacing(cols, c, expr), f"Fill empty cells in {c} with {raw}"


def _drop_empty_rows(cols, column, args):
    c = _column(cols, column)
    q = quote_ident(c)
    cond = f"{q} IS NOT NULL"
    if is_string(cols[c]):
        cond += f" AND TRIM({q}) <> ''"
    return f"SELECT * FROM data WHERE {cond}", f"Drop rows where {c} is empty"


def _dedupe(cols, column, args):
    keys = _columns(cols, args.get("columns"))
    if column:
        keys = [_column(cols, column)] + [k for k in keys if k != column]
    # Keep the first row of each group, in file order (DISTINCT reshuffles).
    # PARTITION BY treats NULLs as equal, like DISTINCT does.
    partition = ", ".join(quote_ident(k) for k in (keys or list(cols)))
    sql = (
        "SELECT * EXCLUDE (__row) FROM ("
        "SELECT *, ROW_NUMBER() OVER () AS __row FROM data"
        f") QUALIFY ROW_NUMBER() OVER (PARTITION BY {partition} ORDER BY __row) = 1 "
        "ORDER BY __row"
    )
    if not keys:
        return sql, "Remove duplicate rows"
    return sql, f"Remove rows with a duplicate {', '.join(keys)}"


def _cast(cols, column, args):
    c = _column(cols, column)
    target = str(args.get("type") or "").upper()
    if target not in CAST_TYPES:
        raise OpError("INVALID_ARGS", f"Cast to one of: {', '.join(CAST_TYPES)}.")
    sql_type = CAST_TYPES[target]
    label = {"INTEGER": "whole number", "DOUBLE": "number", "DATE": "date", "VARCHAR": "text"}[target]
    return _select_replacing(cols, c, f"TRY_CAST({quote_ident(c)} AS {sql_type})"), f"Change {c} to {label}"


def _standardise_date(cols, column, args):
    c = _column(cols, column)
    fmt = str(args.get("format") or "auto")
    as_text = f"TRIM(CAST({quote_ident(c)} AS VARCHAR))"
    if fmt == "auto":
        tries = ", ".join(f"TRY_STRPTIME({as_text}, {quote_literal(f)})" for f in DATE_FORMATS)
        expr = f"CAST(COALESCE(TRY_CAST({as_text} AS DATE), {tries}) AS DATE)"
        label = f"Standardise dates in {c}"
    elif fmt in DATE_FORMATS:
        expr = f"CAST(TRY_STRPTIME({as_text}, {quote_literal(fmt)}) AS DATE)"
        label = f"Read {c} as dates like {DATE_FORMATS[fmt]}"
    else:
        raise OpError("INVALID_ARGS", "Pick a date format from the list.")
    return _select_replacing(cols, c, expr), label


def _sort(cols, column, args):
    c = _column(cols, column)
    direction = str(args.get("direction") or "asc").lower()
    if direction not in ("asc", "desc"):
        raise OpError("INVALID_ARGS", "direction must be asc or desc.")
    word = "ascending" if direction == "asc" else "descending"
    return (
        f"SELECT * FROM data ORDER BY {quote_ident(c)} {direction.upper()} NULLS LAST",
        f"Sort all rows by {c}, {word}",
    )


def _contains_any(cols, column, args):
    needle = _text(args.get("needle"), "Text to look for", MAX_VALUE)
    targets = _columns(cols, args.get("columns")) or [n for n, t in cols.items() if is_string(t)]
    if column:
        targets = [_column(cols, column)]
    if not targets:
        raise OpError("INVALID_ARGS", "There are no text columns to search.")
    lit = quote_literal(needle.lower())
    cond = " OR ".join(f"contains(lower(CAST({quote_ident(t)} AS VARCHAR)), {lit})" for t in targets)
    where = targets[0] if len(targets) == 1 else f"{len(targets)} columns"
    return f"SELECT * FROM data WHERE {cond}", f"Keep rows where {where} contains {needle}"


OPS: dict[str, Callable[[dict[str, str], Any, dict], tuple[str, str]]] = {
    "trim": _trim,
    "drop_column": _drop_column,
    "rename": _rename,
    "fill_nulls": _fill_nulls,
    "drop_empty_rows": _drop_empty_rows,
    "dedupe": _dedupe,
    "cast": _cast,
    "standardise_date": _standardise_date,
    "sort": _sort,
    "contains_any": _contains_any,
}


def build_op(op: str, schema_columns: list[dict], column: Any = None, args: dict | None = None) -> tuple[str, str]:
    """(sql, instruction) for an op against the current schema. Raises OpError."""
    builder = OPS.get(op)
    if builder is None:
        raise OpError("UNKNOWN_OP", f"Unknown operation {op!r}.")
    if args is not None and not isinstance(args, dict):
        raise OpError("INVALID_ARGS", "args must be an object.")
    cols = {str(c["name"]): str(c.get("dtype") or "") for c in schema_columns}
    return builder(cols, column, args or {})
