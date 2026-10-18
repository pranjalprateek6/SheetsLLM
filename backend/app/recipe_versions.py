"""A recipe's history, and a recipe as a file.

History: every change to a recipe keeps it as it then was (migration 019),
so an older version can be read and brought back. A recipe from before the
history began gets its state at the first change recorded as the earliest
version. Recording never fails the change it records: before the migration
it only logs.

File: a recipe exported as JSON carries its steps (with their SQL), the
columns it needs, its checks and the names of the lookups it uses. Importing
one treats the file as untrusted: the shape, every step's SQL (through the
same validator a run uses), the checks and the sizes are checked before
anything is saved.
"""
from __future__ import annotations

import datetime as _dt
import logging

from app import db
from app.recipe_runs import validate_checks
from app.recipes import RecipeError, snapshot_steps, validate_recipe_steps

logger = logging.getLogger("sheetsllm.recipe_versions")

KEEP = 50

# What a version's reason reads as
REASONS = {
    "earliest": "As it was before history began",
    "saved": "Saved",
    "steps_edited": "Steps reordered or removed",
    "steps_replaced": "Steps taken from another file",
    "renamed": "Renamed",
    "checks_changed": "Checks changed",
    "restored": "Restored",
    "imported": "Imported",
}


def _state(recipe: dict) -> dict:
    return {
        "name": recipe.get("name") or "Recipe",
        "steps": recipe.get("steps") or [],
        "required_columns": recipe.get("required_columns") or [],
        "checks": recipe.get("checks") or [],
        "required_lookups": recipe.get("required_lookups") or [],
    }


def record(user_id: str, recipe: dict, reason: str, *, before: dict | None = None, restored_from: int | None = None) -> int | None:
    """Keep `recipe` (as it is after the change) as its next version. With
    `before`, a recipe with no history yet first gets that state as its
    earliest version. Returns the version number, or None when the history
    could not be kept."""
    recipe_id = recipe.get("id")
    if not recipe_id:
        return None
    try:
        latest = db.list_recipe_versions(recipe_id, user_id, limit=1)
        n = latest[0]["version"] if latest else 0
        if not latest and before is not None:
            n += 1
            db.add_recipe_version(recipe_id=recipe_id, user_id=user_id, version=n, reason="earliest", **_state(before))
        n += 1
        db.add_recipe_version(
            recipe_id=recipe_id, user_id=user_id, version=n, reason=reason,
            **({"restored_from": restored_from} if restored_from is not None else {}),
            **_state(recipe),
        )
        if n > KEEP:
            db.prune_recipe_versions(recipe_id, user_id, n - KEEP + 1)
        return n
    except db.MigrationMissing:
        logger.info("recipe history not kept for %s: migration 019 not applied", recipe_id)
    except Exception as exc:
        logger.warning("recipe history not kept for %s: %s", recipe_id, exc)
    return None


def describe(version: dict, current: dict) -> dict:
    """A version as the history list shows it."""
    steps = version.get("steps") or []
    reason = version.get("reason") or "saved"
    label = REASONS.get(reason, reason)
    if reason == "restored" and version.get("restored_from"):
        label = f"Restored version {version['restored_from']}"
    same = (
        (version.get("steps") or []) == (current.get("steps") or [])
        and (version.get("name") or "") == (current.get("name") or "")
        and (version.get("checks") or []) == (current.get("checks") or [])
    )
    return {
        "version": version.get("version"),
        "reason": reason,
        "label": label,
        "name": version.get("name"),
        "steps": [s.get("instruction") or f"Step {s.get('step_number')}" for s in steps],
        "checks": len(version.get("checks") or []),
        "created_at": version.get("created_at"),
        "matches_current": same,
    }


# ── The file ────────────────────────────────────────────────────────────

FORMAT = "sheetsllm-recipe"
FORMAT_VERSION = 1
MAX_FILE_BYTES = 512 * 1024
MAX_STEPS = 100
MAX_INSTRUCTION = 1_000
MAX_SQL = 20_000
MAX_COLUMNS = 1_000
MAX_NAME = 120


def to_file(recipe: dict) -> dict:
    """A recipe as the JSON a person downloads."""
    return {
        "format": FORMAT,
        "format_version": FORMAT_VERSION,
        "name": recipe.get("name"),
        "description": recipe.get("description"),
        "exported_at": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
        "steps": [
            {"step_number": s.get("step_number"), "instruction": s.get("instruction"), "sql_query": s.get("sql_query")}
            for s in recipe.get("steps") or []
        ],
        "required_columns": [
            {"name": c.get("name"), "type": c.get("type")}
            for c in recipe.get("required_columns") or [] if isinstance(c, dict) and c.get("name")
        ],
        "checks": recipe.get("checks") or [],
        # Only the names: the files behind them belong to this account
        "lookups": [l.get("alias") for l in recipe.get("required_lookups") or [] if isinstance(l, dict) and l.get("alias")],
    }


def from_file(data: object) -> dict:
    """The parts of a recipe file that are safe to save, or RecipeError
    saying what is wrong with it."""
    if not isinstance(data, dict) or data.get("format") != FORMAT:
        raise RecipeError("That isn't a SheetsLLM recipe file.")
    if not isinstance(data.get("format_version"), int) or data["format_version"] > FORMAT_VERSION:
        raise RecipeError("This recipe file is from a newer version of SheetsLLM.")

    name = data.get("name")
    name = name.strip()[:MAX_NAME] if isinstance(name, str) and name.strip() else "Imported recipe"
    description = data.get("description")
    description = description.strip()[:1_000] if isinstance(description, str) and description.strip() else None

    raw_steps = data.get("steps")
    if not isinstance(raw_steps, list) or not raw_steps:
        raise RecipeError("The recipe file has no steps.")
    if len(raw_steps) > MAX_STEPS:
        raise RecipeError(f"A recipe file can hold up to {MAX_STEPS} steps.")
    steps = []
    for i, s in enumerate(raw_steps, start=1):
        if not isinstance(s, dict):
            raise RecipeError(f"Step {i} isn't readable.")
        instruction, sql = s.get("instruction"), s.get("sql_query")
        if not isinstance(sql, str) or not sql.strip() or len(sql) > MAX_SQL:
            raise RecipeError(f"Step {i} has no SQL, or too much.")
        if instruction is not None and (not isinstance(instruction, str) or len(instruction) > MAX_INSTRUCTION):
            raise RecipeError(f"Step {i}'s description isn't readable.")
        number = s.get("step_number")
        steps.append({"step_number": number if isinstance(number, int) else i, "instruction": instruction or f"Step {i}", "sql_query": sql})
    steps = snapshot_steps(steps)
    # The same validator a run uses: one read-only statement over the data
    steps = validate_recipe_steps(steps)

    columns = []
    for c in (data.get("required_columns") or [])[:MAX_COLUMNS]:
        if isinstance(c, dict) and isinstance(c.get("name"), str) and c["name"].strip():
            col = {"name": c["name"][:200]}
            if isinstance(c.get("type"), str):
                col["type"] = c["type"][:60]
            columns.append(col)

    checks = validate_checks(data.get("checks") or [])

    lookups = []
    for alias in data.get("lookups") or []:
        if isinstance(alias, str) and alias.strip() and len(alias) <= 64 and alias not in [l["alias"] for l in lookups]:
            # No file yet: a run asks for one under this name
            lookups.append({"alias": alias.strip(), "lookup_file_id": None, "lookup_file_name": None})

    return {"name": name, "description": description, "steps": steps, "required_columns": columns, "checks": checks, "required_lookups": lookups}
