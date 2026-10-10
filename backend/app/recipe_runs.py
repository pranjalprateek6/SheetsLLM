"""What a recipe run does beyond replaying steps, as pure functions.

- Column matching: when a column the recipe needs was renamed, the run asks
  which column it is now and adds a rename step first, instead of stopping.
- Checks: rules the cleaned rows must meet, counted after every run.
- The run report: rows in and out of each step, beside the last run's.

Route wiring (database, storage) lives in routes/recipes.py.
"""

from __future__ import annotations

from difflib import SequenceMatcher
from typing import Any

from app.ops import quote_ident, quote_literal
from app.recipes import RecipeError
from app.sql_validator import validate_sql

# ── Column matching: a renamed column is matched, not a dead end ──────


def _words(name: str) -> set[str]:
    return {w for w in "".join(ch.lower() if ch.isalnum() else " " for ch in name).split() if w}


def suggest_mapping(missing: list[str], target_columns: list[str], required: list[str]) -> dict[str, str]:
    """A best guess at the new name of each missing column, when one is clear.

    Candidates are the file's columns the recipe does not already use:
    "order_date" -> "Order Date" (same words), "Customer Email" -> "Email"
    (one name's words inside the other's). Each candidate is offered for one
    missing column at most.
    """
    used = {r.lower() for r in required}
    free = [c for c in target_columns if c.lower() not in used]
    out: dict[str, str] = {}
    for m in missing:
        best, best_score = None, 0.0
        for c in free:
            if c in out.values():
                continue
            mw, cw = _words(m), _words(c)
            if mw and mw == cw:
                score = 1.0
            elif mw and cw and (mw <= cw or cw <= mw):
                score = 0.8
            else:
                score = SequenceMatcher(None, m.lower(), c.lower()).ratio()
            if score > best_score:
                best, best_score = c, score
        if best is not None and best_score >= 0.6:
            out[m] = best
    return out


def mapping_step(column_map: dict[str, str], target_columns: list[str], required: list[str]) -> dict[str, Any]:
    """A first step that renames this file's columns to the recipe's names.

    ``column_map`` is {recipe's name: this file's name}. The rest of the
    recipe then runs unchanged, and the output keeps the names it always had,
    which is what reads the cleaned file next expects.
    """
    if not isinstance(column_map, dict) or not column_map:
        raise RecipeError("Pick a column for each one the recipe needs")
    have = set(target_columns)
    required_set = set(required)
    pairs: list[tuple[str, str]] = []
    for old, new in column_map.items():
        if not isinstance(old, str) or not isinstance(new, str) or not old or not new:
            raise RecipeError("Each match needs a recipe column and a file column")
        if old not in required_set:
            raise RecipeError(f"The recipe does not use a column called {old}")
        if new not in have:
            raise RecipeError(f"This file has no column called {new}")
        if old in have:
            raise RecipeError(f"This file already has a column called {old}")
        pairs.append((new, old))
    if len({new for new, _ in pairs}) != len(pairs):
        raise RecipeError("Each file column can stand in for one recipe column")
    renames = ", ".join(f"{quote_ident(new)} AS {quote_ident(old)}" for new, old in pairs)
    label = ", ".join(f"{new} as {old}" for new, old in pairs)
    return {
        "instruction": f"Match columns: {label}",
        "sql_query": validate_sql(f"SELECT * RENAME ({renames}) FROM data"),
    }


def remembered_columns(required: list[dict], column_map: dict[str, str]) -> list[dict]:
    """The recipe's required columns once a match is remembered: the file's
    new names stand where the old ones were."""
    return [
        {**c, "name": column_map.get(c.get("name"), c.get("name"))} if isinstance(c, dict) else c
        for c in required
    ]


# ── Checks: rules the cleaned rows must meet ──────────────────────────

CHECK_TYPES = ("unique", "not_empty", "at_least", "one_of")
MAX_CHECKS = 20


def validate_checks(checks: Any) -> list[dict[str, Any]]:
    """Normalise a list of checks, or raise RecipeError saying what is wrong."""
    if not isinstance(checks, list):
        raise RecipeError("checks must be a list")
    if len(checks) > MAX_CHECKS:
        raise RecipeError(f"A recipe can have up to {MAX_CHECKS} checks")
    out: list[dict[str, Any]] = []
    for i, c in enumerate(checks, 1):
        if not isinstance(c, dict):
            raise RecipeError(f"Check {i} is not an object")
        kind, column = c.get("type"), c.get("column")
        if kind not in CHECK_TYPES:
            raise RecipeError(f"Check {i}: type must be one of {', '.join(CHECK_TYPES)}")
        if not isinstance(column, str) or not column.strip() or len(column) > 200:
            raise RecipeError(f"Check {i} needs a column")
        item: dict[str, Any] = {"type": kind, "column": column}
        if kind == "at_least":
            value = c.get("value")
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise RecipeError(f"Check {i}: at least needs a number")
            item["value"] = value
        elif kind == "one_of":
            values = c.get("value")
            if (
                not isinstance(values, list) or not values or len(values) > 50
                or not all(isinstance(v, str) and v.strip() and len(v) <= 200 for v in values)
            ):
                raise RecipeError(f"Check {i}: one of needs 1 to 50 allowed values")
            item["value"] = [v.strip() for v in values]
        out.append(item)
    return out


def check_label(check: dict) -> str:
    col, kind = check["column"], check["type"]
    if kind == "unique":
        return f"{col} is unique"
    if kind == "not_empty":
        return f"{col} is never empty"
    if kind == "at_least":
        return f"{col} is at least {check['value']:g}"
    return f"{col} is one of {', '.join(check['value'])}"


def check_sql(check: dict, columns: list[str]) -> str | None:
    """SQL over the cleaned rows (a view named r) counting the rows that
    break the check. None when the column is not in the output."""
    if check["column"] not in columns:
        return None
    q = quote_ident(check["column"])
    text = f"NULLIF(TRIM(CAST({q} AS VARCHAR)), '')"
    kind = check["type"]
    if kind == "unique":
        # Every row whose value another row also has, empty cells aside
        return (
            f"SELECT COALESCE(SUM(n), 0) FROM (SELECT COUNT(*) AS n FROM r "
            f"WHERE {text} IS NOT NULL GROUP BY {text} HAVING COUNT(*) > 1)"
        )
    if kind == "not_empty":
        return f"SELECT COUNT(*) FROM r WHERE {text} IS NULL"
    if kind == "at_least":
        number = f"TRY_CAST({text} AS DOUBLE)"
        return (
            f"SELECT COUNT(*) FROM r WHERE {text} IS NOT NULL "
            f"AND ({number} IS NULL OR {number} < {float(check['value'])!r})"
        )
    allowed = ", ".join(quote_literal(v) for v in check["value"])
    return f"SELECT COUNT(*) FROM r WHERE {text} IS NOT NULL AND {text} NOT IN ({allowed})"


# ── The run report: this run beside the last one ──────────────────────

# A step whose change moves by this many points of the rows it saw is flagged
FLAG_POINTS = 10.0


def _change(before: int | None, after: int | None) -> float | None:
    if before is None or after is None or before <= 0:
        return None
    return round(100.0 * (after - before) / before, 1)


def step_report(
    instructions: list[str], counts: list[int], baseline: list[int | None] | None,
) -> list[dict[str, Any]]:
    """Per step: rows in, rows out, the change, and last time's change.

    ``counts`` is the rows before the first step, then after each step
    (one more value than ``instructions``). ``baseline`` is the same for the
    run it is compared with, or None. A step is flagged when its change moved
    by FLAG_POINTS or more, or when it left no rows.
    """
    usable = baseline if baseline and len(baseline) == len(counts) else None
    out = []
    for i, instruction in enumerate(instructions):
        before, after = counts[i], counts[i + 1]
        now = _change(before, after)
        then = _change(usable[i], usable[i + 1]) if usable else None
        flag = None
        if after == 0 and before:
            flag = "Left no rows"
        elif now is not None and then is not None and abs(now - then) >= FLAG_POINTS:
            flag = f"Changed {abs(now):g}% of rows, {abs(then):g}% last time"
        out.append({
            "instruction": instruction,
            "rows_before": before,
            "rows_after": after,
            "change_pct": now,
            "last_change_pct": then,
            "flag": flag,
        })
    return out
