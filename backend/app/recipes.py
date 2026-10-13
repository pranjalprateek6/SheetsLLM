"""Recipe logic — snapshotting and re-applying transformation step chains.

A recipe is a named, ordered list of {step_number, instruction, sql_query}
captured from one file, replayable onto another. Pure functions live here so
they are unit-testable; route wiring (DB, storage) lives in routes/recipes.py.

Safety: stored SQL is re-validated with the CURRENT validator on every apply
(defense in depth — the validator may have been hardened since the recipe was
saved), and the combined chain gets a DuckDB EXPLAIN dry run before anything
is persisted to the target file.
"""

from __future__ import annotations

from typing import Any

from app.sql_validator import validate_sql


class RecipeError(Exception):
    """Raised when a recipe cannot be built or applied."""


def snapshot_steps(steps: list[dict]) -> list[dict[str, Any]]:
    """Normalize a file's transformation rows into recipe steps.

    Keeps only what a replay needs; renumbers defensively from 1.
    Raises RecipeError for an empty chain.
    """
    if not steps:
        raise RecipeError("File has no transformation steps to save")
    ordered = sorted(steps, key=lambda s: s.get("step_number", 0))
    return [
        {
            "step_number": i + 1,
            "instruction": (s.get("instruction") or "").strip(),
            "sql_query": s["sql_query"],
        }
        for i, s in enumerate(ordered)
    ]


def validate_recipe_steps(recipe_steps: list[dict]) -> list[dict[str, Any]]:
    """Re-validate every stored SQL step with the current validator.

    Returns cleaned steps. Raises RecipeError naming the failing step.
    """
    if not recipe_steps:
        raise RecipeError("Recipe contains no steps")
    cleaned: list[dict[str, Any]] = []
    for step in recipe_steps:
        sql = step.get("sql_query") or ""
        try:
            cleaned_sql = validate_sql(sql)
        except Exception as exc:
            n = step.get("step_number", "?")
            raise RecipeError(f"Recipe step {n} failed validation: {exc}") from exc
        cleaned.append({**step, "sql_query": cleaned_sql})
    return cleaned


def reorder_steps(recipe_steps: list[dict], keep: Any) -> list[dict[str, Any]]:
    """The steps numbered in ``keep``, in that order, renumbered from 1.

    Editing a recipe means removing steps and moving them; the SQL itself is
    never taken from the client. ``keep`` must name existing steps, each once,
    and at least one of them. Raises RecipeError otherwise.
    """
    if not isinstance(keep, list) or not keep:
        raise RecipeError("Keep at least one step, or delete the recipe instead")
    by_number = {int(s.get("step_number", 0)): s for s in recipe_steps}
    chosen: list[dict[str, Any]] = []
    seen: set[int] = set()
    for n in keep:
        if isinstance(n, bool) or not isinstance(n, int) or n not in by_number:
            raise RecipeError(f"There is no step {n!r} in this recipe")
        if n in seen:
            raise RecipeError(f"Step {n} is listed twice")
        seen.add(n)
        chosen.append(by_number[n])
    return [{**s, "step_number": i + 1} for i, s in enumerate(chosen)]


def renumber_after(recipe_steps: list[dict], existing_count: int) -> list[dict[str, Any]]:
    """Renumber recipe steps to append after a target file's existing steps."""
    return [
        {**step, "step_number": existing_count + i + 1}
        for i, step in enumerate(recipe_steps)
    ]


def missing_columns(required: list[dict], target_columns: list[str]) -> list[str]:
    """Columns the recipe's source file had that the target lacks.

    Advisory only (used for friendly error messages) — the EXPLAIN dry run is
    the authoritative compatibility check, since a chain may not reference
    every source column.
    """
    have = {c.lower() for c in target_columns}
    return [
        c["name"]
        for c in (required or [])
        if isinstance(c, dict) and c.get("name") and c["name"].lower() not in have
    ]
