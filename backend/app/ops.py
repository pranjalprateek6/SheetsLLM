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


DECIMAL_MARKS = ("point", "comma")


def number_expr(column_sql: str, decimal: str = "point") -> str:
    """SQL reading money-ish text as a number: "$1,234.50" is 1234.5,
    "(12)" is -12, "12%" is 12, "1.234,50" with a decimal comma is 1234.5.
    Anything left that is not a number becomes NULL (TRY_CAST)."""
    v = f"TRIM(CAST({column_sql} AS VARCHAR))"
    # Accountants' negatives: (12) is -12
    v = f"regexp_replace({v}, '^[(](.*)[)]$', '-\\1')"
    if decimal == "comma":
        v = f"replace(replace({v}, '.', ''), ',', '.')"
    else:
        v = f"replace({v}, ',', '')"
    # Drop currency signs, spaces, percent and whatever else is not part of a number
    v = f"regexp_replace({v}, '[^0-9.eE+-]', '', 'g')"
    return f"TRY_CAST(NULLIF({v}, '') AS DOUBLE)"


def _clean_number(cols, column, args):
    c = _column(cols, column)
    if is_numeric(cols[c]):
        raise OpError("WRONG_TYPE", f"{c} already holds numbers.")
    decimal = str(args.get("decimal") or "point")
    if decimal not in DECIMAL_MARKS:
        raise OpError("INVALID_ARGS", "decimal must be point or comma.")
    label = f"Clean numbers in {c}" + (" (decimal comma)" if decimal == "comma" else "")
    return _select_replacing(cols, c, number_expr(quote_ident(c), decimal)), label


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


# How a filter compares, and the words the step is saved under
COMPARES = {
    "eq": "is", "ne": "is not",
    "gt": ">", "gte": ">=", "lt": "<", "lte": "<=",
    "contains": "contains", "not_contains": "doesn't contain",
    "starts_with": "starts with", "ends_with": "ends with",
    "empty": "is empty", "not_empty": "is not empty",
}
_NO_VALUE = ("empty", "not_empty")
_ORDERED = {"gt": ">", "gte": ">=", "lt": "<", "lte": "<="}


def _is_date(dtype: str) -> bool:
    return _base(dtype) in ("DATE", "TIMESTAMP", "TIMESTAMP_NS", "TIMESTAMP_MS", "TIMESTAMP_S", "DATETIME")


def _filter_rows(cols, column, args):
    """Keep (or remove) the rows where one column meets a plain condition.

    Text compares ignore case and surrounding spaces. Numbers and dates
    compare as what they are, so the value must read as one. A row whose
    cell is empty never meets a condition, so "is not" and "doesn't contain"
    keep it, and "Remove rows where" leaves it alone.
    """
    c = _column(cols, column)
    compare = str(args.get("compare") or "")
    if compare not in COMPARES:
        raise OpError("INVALID_ARGS", f"compare must be one of: {', '.join(COMPARES)}.")
    keep = args.get("keep", True)
    if not isinstance(keep, bool):
        raise OpError("INVALID_ARGS", "keep must be true or false.")
    q = quote_ident(c)
    dtype = cols[c]
    as_text = f"TRIM(CAST({q} AS VARCHAR))"

    if compare in _NO_VALUE:
        cond = f"{q} IS NULL" + (f" OR {as_text} = ''" if is_string(dtype) else "")
        cond = f"({cond})"
        if compare == "not_empty":
            cond = f"NOT {cond}"
        phrase = COMPARES[compare]
    else:
        value = _text(args.get("value"), "A value to compare with", MAX_VALUE)
        phrase = f"{COMPARES[compare]} {value}"
        lit = quote_literal(value)
        if compare in _ORDERED or (compare in ("eq", "ne") and not is_string(dtype)):
            if is_numeric(dtype):
                try:
                    number = float(value)
                except ValueError:
                    number = math.nan
                if not math.isfinite(number):
                    raise OpError("WRONG_TYPE", f"{c} holds numbers, so compare it with a number.")
                rhs = f"CAST({quote_literal(value.strip())} AS DOUBLE)"
                lhs = f"CAST({q} AS DOUBLE)"
            elif _is_date(dtype):
                import datetime as _dt

                try:
                    _dt.date.fromisoformat(value.strip()[:10])
                except ValueError:
                    raise OpError("WRONG_TYPE", f"{c} holds dates, so compare it with a date like 2026-10-31.")
                rhs = f"CAST({quote_literal(value.strip()[:10])} AS DATE)"
                lhs = f"CAST({q} AS DATE)"
            else:
                rhs, lhs = f"lower({lit})", f"lower({as_text})"
            op = _ORDERED.get(compare, "=")
            cond = f"({lhs} {op} {rhs})"
            if compare == "ne":
                cond = f"NOT COALESCE({cond}, FALSE)"
        else:
            low = f"lower({as_text})"
            needle = f"lower({lit})"
            if compare in ("eq", "ne"):
                cond = f"({low} = {needle})"
            elif compare in ("contains", "not_contains"):
                cond = f"contains({low}, {needle})"
            elif compare == "starts_with":
                cond = f"starts_with({low}, {needle})"
            else:
                cond = f"ends_with({low}, {needle})"
            if compare in ("ne", "not_contains"):
                cond = f"NOT COALESCE({cond}, FALSE)"

    where = f"COALESCE({cond}, FALSE)"
    if not keep:
        where = f"NOT {where}"
    verb = "Keep" if keep else "Remove"
    return f"SELECT * FROM data WHERE {where}", f"{verb} rows where {c} {phrase}"


def _key_expr(table_alias: str, col: str) -> str:
    """A key as text, trimmed, case folded: "North " matches "north"."""
    return f"lower(TRIM(CAST({table_alias}.{quote_ident(col)} AS VARCHAR)))"


def join_lookup_sql(cols: dict[str, str], lookup_cols: list[str], alias: str, data_key: str, lookup_key: str, take: list[str]) -> str:
    """One row of data, with columns from the lookup row whose key matches.
    A LEFT JOIN, so every row of data stays; the lookup is reduced to one
    row per key first, so the file cannot grow. A taken column whose name
    the file already has comes in as "name (alias)"."""
    lk = _key_expr("l", lookup_key)
    dedup = (
        f"SELECT * EXCLUDE (__rn) FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY {_key_expr(alias, lookup_key)}) AS __rn "
        f"FROM {alias} AS {alias}) WHERE __rn = 1"
    )
    taken = []
    for c in take:
        name = c if c not in cols else f"{c} ({alias})"
        taken.append(f"l.{quote_ident(c)} AS {quote_ident(name)}")
    return (
        f"SELECT d.*, {', '.join(taken)} FROM data AS d LEFT JOIN ({dedup}) AS l "
        f"ON {_key_expr('d', data_key)} = {lk}"
    )


def unmatched_sql(data_key: str, alias: str, lookup_key: str) -> str:
    """How many rows of data have no lookup row for their key."""
    # NOT EXISTS, so an empty key counts as unmatched too (NOT IN would skip it)
    return (
        f"SELECT COUNT(*) FROM data AS d WHERE NOT EXISTS ("
        f"SELECT 1 FROM {alias} AS {alias} WHERE {_key_expr(alias, lookup_key)} = {_key_expr('d', data_key)})"
    )


def _join_lookup(cols, column, args, lookups):
    """Bring columns from a lookup table into the file, matched on a key."""
    alias = str(args.get("alias") or "")
    if alias not in (lookups or {}):
        raise OpError("UNKNOWN_LOOKUP", "Pick a lookup table linked to this file.")
    lookup_cols = [c["name"] for c in lookups[alias]]
    data_key = _column(cols, column or args.get("on"))
    lookup_key = str(args.get("lookup_on") or data_key)
    if lookup_key not in lookup_cols:
        raise OpError("UNKNOWN_COLUMN", f"There is no column named {lookup_key!r} in {alias}.")
    take = args.get("take")
    if take in (None, [], ""):
        take = [c for c in lookup_cols if c != lookup_key]
    if not isinstance(take, list) or not take:
        raise OpError("INVALID_ARGS", "Pick at least one column to bring in.")
    for c in take:
        if c not in lookup_cols:
            raise OpError("UNKNOWN_COLUMN", f"There is no column named {c!r} in {alias}.")
    sql = join_lookup_sql(cols, lookup_cols, alias, data_key, lookup_key, [str(c) for c in take])
    what = ", ".join(str(c) for c in take[:3]) + (f" and {len(take) - 3} more" if len(take) > 3 else "")
    on = data_key if data_key == lookup_key else f"{data_key} to {lookup_key}"
    return sql, f"Add {what} from {alias}, matched on {on}"


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


def _replace_value(cols, column, args):
    """Every cell of a column holding one value, rewritten to another, as a
    step that replays next month. An empty "from" means the empty cells;
    an empty "to" empties them."""
    c = _column(cols, column)
    q = quote_ident(c)
    old = "" if args.get("from") is None else str(args.get("from"))
    new = "" if args.get("to") is None else str(args.get("to"))
    if len(old) > MAX_VALUE or len(new) > MAX_VALUE:
        raise OpError("INVALID_ARGS", f"A value can be at most {MAX_VALUE} characters.")
    if old == new:
        raise OpError("INVALID_ARGS", "The new value is the same as the old one.")
    match = (
        f"({q} IS NULL OR TRIM(CAST({q} AS VARCHAR)) = '')" if not old.strip()
        else f"CAST({q} AS VARCHAR) = {quote_literal(old)}"
    )
    if is_numeric(cols[c]):
        if not new.strip():
            value = "NULL"
        else:
            try:
                number = float(new)
            except ValueError:
                raise OpError("WRONG_TYPE", f"{c} holds numbers, so the new value must be a number. Change its type to text first to write words.")
            if not math.isfinite(number):
                raise OpError("WRONG_TYPE", f"{c} holds numbers, so the new value must be a number.")
            value = f"CAST({quote_literal(new.strip())} AS {cols[c]})"
    elif is_string(cols[c]):
        value = "NULL" if new == "" else quote_literal(new)
    else:
        value = "NULL" if not new.strip() else f"TRY_CAST({quote_literal(new)} AS {cols[c]})"
    expr = f"CASE WHEN {match} THEN {value} ELSE {q} END"
    shown_old = f"\u201c{old}\u201d" if old.strip() else "empty cells"
    shown_new = f"\u201c{new}\u201d" if new != "" else "empty"
    return _select_replacing(cols, c, expr), f"Replace {shown_old} with {shown_new} in {c}"


OPS: dict[str, Callable[[dict[str, str], Any, dict], tuple[str, str]]] = {
    "trim": _trim,
    "drop_column": _drop_column,
    "rename": _rename,
    "fill_nulls": _fill_nulls,
    "drop_empty_rows": _drop_empty_rows,
    "dedupe": _dedupe,
    "cast": _cast,
    "standardise_date": _standardise_date,
    "clean_number": _clean_number,
    "sort": _sort,
    "contains_any": _contains_any,
    "filter_rows": _filter_rows,
    "replace_value": _replace_value,
}


def build_op(
    op: str, schema_columns: list[dict], column: Any = None, args: dict | None = None,
    lookups: dict[str, list[dict]] | None = None,
) -> tuple[str, str]:
    """(sql, instruction) for an op against the current schema. Raises OpError.
    ``lookups`` is {alias: [{name, dtype}]} for the file's lookup tables."""
    if args is not None and not isinstance(args, dict):
        raise OpError("INVALID_ARGS", "args must be an object.")
    cols = {str(c["name"]): str(c.get("dtype") or "") for c in schema_columns}
    if op == "join_lookup":
        return _join_lookup(cols, column, args or {}, lookups or {})
    builder = OPS.get(op)
    if builder is None:
        raise OpError("UNKNOWN_OP", f"Unknown operation {op!r}.")
    return builder(cols, column, args or {})
