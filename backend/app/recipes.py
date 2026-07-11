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
