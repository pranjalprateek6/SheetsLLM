"""Recipes — save a file's transformation chain, re-apply it to new files.

POST   /recipes              save current chain of a file as a named recipe
GET    /recipes              list the user's recipes
GET    /recipes/{id}         recipe detail (steps included)
PATCH  /recipes/{id}         rename / edit description
DELETE /recipes/{id}         delete a recipe
POST   /recipes/{id}/apply   append the recipe's steps to another file, with
                             a run report, its checks, and column matching
PUT    /recipes/{id}/checks  replace the checks a recipe runs
PUT    /recipes/{id}/steps   remove or reorder steps, or take a file's steps
"""

from __future__ import annotations

import asyncio
import json
import logging
from time import perf_counter

from fastapi import APIRouter, Request, Response

from app import lookups
from app import db, events, usage
from app.cache import get_local_parquet
from app.engine import first_failing_step, get_schema_after_steps, measure_run, replay_transformations_local
from app.recipe_runs import (
    check_label,
    check_sql,
    mapping_step,
    remembered_columns,
    step_report,
    suggest_mapping,
    validate_checks,
)
from app.recipes import (
    RecipeError,
    missing_columns,
    renumber_after,
    reorder_steps,
    snapshot_steps,
    validate_recipe_steps,
)

logger = logging.getLogger("sheetsllm.routes.recipes")

router = APIRouter()

_MAX_NAME_LENGTH = 120


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


def _base_columns(file_rec: dict) -> list[dict]:
    """Source file's base columns as [{name, dtype}] for compatibility hints."""
    cols = (file_rec.get("schema_json") or {}).get("columns") or []
    return [
        {"name": c.get("name"), "dtype": c.get("dtype")}
        for c in cols
        if isinstance(c, dict) and c.get("name")
    ]


@router.post("/recipes")
async def create_recipe(request: Request):
    user_id = getattr(request.state, "user_id", "anonymous")

    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")

    file_id = body.get("file_id")
    name = (body.get("name") or "").strip()
    description = (body.get("description") or "").strip() or None

    if not file_id:
        return _json_response(400, "MISSING_FILE_ID", "file_id is required")
    if not name:
        return _json_response(400, "MISSING_NAME", "name is required")
    if len(name) > _MAX_NAME_LENGTH:
        return _json_response(
            400, "NAME_TOO_LONG", f"name exceeds {_MAX_NAME_LENGTH} characters"
        )

    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    steps = db.get_transformations(file_id)
    try:
        recipe_steps = snapshot_steps(steps)
    except RecipeError as exc:
        return _json_response(400, "EMPTY_RECIPE", str(exc))

    # Recipe count is the Pro gate: free tier is capped, Pro is unlimited.
    limit = usage.recipe_limit(user_id)
    # A recipe saved from a bundled sample is practice: it never takes a slot
    from app import onboarding

    if limit and len(onboarding.counted_recipes(db.list_recipes(user_id))) >= limit:
        events.record(user_id, "paywall_hit", action="recipes", limit=limit)
        return _json_response(
            402, "RECIPE_LIMIT_REACHED",
            f"The free plan includes {limit} saved recipe"
            f"{'s' if limit != 1 else ''}. Upgrade to Pro for unlimited recipes.",
        )

    recipe = db.create_recipe(
        user_id=user_id,
        name=name,
        description=description,
        source_file_id=file_id,
        steps=recipe_steps,
        required_columns=_base_columns(file_rec),
        required_lookups=lookups.required_for(recipe_steps, lookups.load(file_id, user_id)),
    )

    try:
        db.create_audit_entry(
            user_id=user_id, file_id=file_id, action="recipe_create",
            metadata={"recipe_id": recipe["id"], "name": name, "steps": len(recipe_steps)},
        )
    except Exception:
        logger.warning("Audit entry failed for recipe_create %s", recipe["id"])
    source = body.get("from") if body.get("from") in ("export_strip", "rail", "drawer") else None
    events.record(user_id, "recipe_saved", recipe_id=recipe["id"], steps=len(recipe_steps),
                  **({"from": source} if source else {}))

    return {
        "recipe_id": recipe["id"],
        "name": name,
        "steps": len(recipe_steps),
    }


@router.get("/recipes")
def list_recipes(request: Request):
    user_id = getattr(request.state, "user_id", "anonymous")
    recipes = db.list_recipes(user_id)
    try:
        names = db.file_names([r["source_file_id"] for r in recipes if r.get("source_file_id")])
    except Exception:
        names = {}
    return {
        "recipes": [
            {
                "id": r["id"],
                "name": r["name"],
                "description": r.get("description"),
                "steps": len(r.get("steps") or []),
                "created_at": r.get("created_at"),
                "source_file_id": r.get("source_file_id"),
                "source_file_name": names.get(r.get("source_file_id") or ""),
                "required_columns": [
                    c.get("name") for c in (r.get("required_columns") or [])
                    if isinstance(c, dict) and c.get("name")
                ],
            }
            for r in recipes
        ],
        "total": len(recipes),
    }


@router.get("/recipes/due")
def recipes_due(request: Request):
    """The user's recipes with how long since each ran, due ones first."""
    from app import reminders

    user_id = getattr(request.state, "user_id", "anonymous")
    return {"days": reminders.REMINDER_DAYS, "recipes": reminders.due_for_user(user_id)}


@router.get("/recipes/{recipe_id}")
def get_recipe(request: Request, recipe_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")
    recipe = db.get_recipe(recipe_id, user_id)
    if not recipe:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    return {"recipe": recipe}


@router.patch("/recipes/{recipe_id}")
async def update_recipe(request: Request, recipe_id: str):
    """Rename a recipe or edit its description — the steps are immutable
    (a recipe is a snapshot; edit the chain and save a new one)."""
    user_id = getattr(request.state, "user_id", "anonymous")

    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")

    updates: dict = {}
    if "name" in body:
        name = (body.get("name") or "").strip()
        if not name:
            return _json_response(400, "MISSING_NAME", "name cannot be empty")
        if len(name) > _MAX_NAME_LENGTH:
            return _json_response(
                400, "NAME_TOO_LONG", f"name exceeds {_MAX_NAME_LENGTH} characters"
            )
        updates["name"] = name
    if "description" in body:
        updates["description"] = (body.get("description") or "").strip() or None

    if not updates:
        return _json_response(
            400, "NO_FIELDS", "Provide name and/or description to update"
        )

    updated = db.update_recipe(recipe_id, user_id, **updates)
    if not updated:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")

    try:
        db.create_audit_entry(
            user_id=user_id, file_id=updated.get("source_file_id"),
            action="recipe_update",
            metadata={"recipe_id": recipe_id, "fields": sorted(updates)},
        )
    except Exception:
        logger.warning("Audit entry failed for recipe_update %s", recipe_id)

    return {
        "recipe_id": recipe_id,
        "name": updated["name"],
        "description": updated.get("description"),
    }


@router.delete("/recipes/{recipe_id}")
def delete_recipe(request: Request, recipe_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")
    if not db.delete_recipe(recipe_id, user_id):
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    return {"deleted": True, "recipe_id": recipe_id}


def _link_required_lookups(user_id: str, file_id: str, required: list[dict]) -> list[dict]:
    """Give the target file every lookup the recipe needs, under the same
    alias, when the lookup file still exists. Returns the ones that do not."""
    if not required:
        return []
    try:
        have = {l["alias"]: l for l in db.list_lookups(file_id)}
    except Exception as exc:  # the table is missing (migration 015 not applied): nothing to link
        logger.warning("lookups unavailable for %s: %s", file_id, exc)
        return list(required)
    missing = []
    for need in required:
        alias, lookup_id = need.get("alias"), need.get("lookup_file_id")
        if not alias or alias in have:
            continue
        if lookup_id and lookup_id != file_id and db.get_file(lookup_id, user_id):
            db.add_lookup(user_id=user_id, file_id=file_id, lookup_file_id=lookup_id, alias=alias)
        else:
            missing.append(need)
    return missing


def _checks_of(recipe: dict) -> list[dict]:
    """A recipe's checks; none before migration 011 adds the column."""
    try:
        return validate_checks(recipe.get("checks") or [])
    except RecipeError:
        logger.warning("Recipe %s has malformed checks; ignoring them", recipe.get("id"))
        return []


def _baseline(user_id: str, recipe: dict, n_steps: int) -> tuple[list[int] | None, dict | None]:
    """Row counts to compare this run with: the recipe's last run, or the
    file it was made from. Each is the rows before the first step, then after
    each step, so it has n_steps + 1 values; anything else is not comparable."""
    try:
        last = db.last_recipe_run(user_id, recipe["id"])
        if last:
            counts = last["metadata"]["counts"]
            if len(counts) == n_steps + 1 and all(isinstance(c, int) for c in counts):
                name = db.file_names([last["file_id"]]).get(last["file_id"]) if last.get("file_id") else None
                return counts, {"kind": "last_run", "file_name": name}
        src = recipe.get("source_file_id")
        if src:
            steps = db.get_transformations(src)
            counts = [db.get_upload_row_count(src)] + [s.get("row_count_after") for s in steps]
            if len(counts) == n_steps + 1 and all(isinstance(c, int) for c in counts):
                return counts, {"kind": "source", "file_name": db.file_names([src]).get(src)}
    except Exception as exc:
        logger.warning("No baseline for recipe %s: %s", recipe.get("id"), exc)
    return None, None


@router.post("/recipes/{recipe_id}/apply")
async def apply_recipe(request: Request, recipe_id: str):
    """Append the recipe's steps to a target file and replay the full chain.

    No LLM call is involved, which is the point of recipes, so this costs no
    AI request; only rows_processed is recorded.

    Body: file_id, and optionally column_map {recipe's column: this file's
    column} with remember, when a column the recipe needs was renamed. The
    response carries a report (each step's rows beside the last run's) and
    the result of every check the recipe has.
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    start_time = perf_counter()

    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")

    file_id = body.get("file_id")
    if not file_id:
        return _json_response(400, "MISSING_FILE_ID", "file_id is required")
    column_map = body.get("column_map") or None
    remember = bool(body.get("remember")) and bool(column_map)

    recipe = db.get_recipe(recipe_id, user_id)
    if not recipe:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")

    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    # Re-validate stored SQL with the CURRENT validator (defense in depth)
    try:
        recipe_steps = validate_recipe_steps(recipe.get("steps") or [])
    except RecipeError as exc:
        return _json_response(400, "RECIPE_INVALID", str(exc))

    required = recipe.get("required_columns") or []
    required_names = [c["name"] for c in required if isinstance(c, dict) and c.get("name")]
    # The lookups the recipe's steps name: link the same ones to this file
    # first, so the steps find their tables
    missing_lookups = _link_required_lookups(user_id, file_id, recipe.get("required_lookups") or [])
    if missing_lookups:
        gone = ", ".join(f"{m['alias']} ({m.get('lookup_file_name') or 'a deleted file'})" for m in missing_lookups)
        return _json_response(
            400, "RECIPE_NEEDS_LOOKUP",
            f"This recipe uses the lookup {gone}, which is no longer in your files. "
            "Link a file under that name to this file first, then run it again.",
            lookups=missing_lookups,
        )
    lookups.use(file_id, user_id)
    existing = db.get_transformations(file_id)

    try:
        local_path = await asyncio.to_thread(get_local_parquet, file_rec["r2_key"])
        # The columns the recipe's first step will see
        if existing:
            schema = await asyncio.to_thread(get_schema_after_steps, local_path, existing)
            file_columns = [c["name"] for c in schema.get("columns", [])]
        else:
            file_columns = [c["name"] for c in _base_columns(file_rec)]
    except Exception as exc:
        logger.error("Could not read file %s for recipe %s: %s", file_id, recipe_id, exc)
        return _json_response(500, "FILE_UNREADABLE", "This file could not be read. Try again.")

    prefix: list[dict] = []
    if column_map:
        try:
            prefix = [mapping_step(column_map, file_columns, required_names)]
        except RecipeError as exc:
            return _json_response(400, "INVALID_MAPPING", str(exc))

    new_steps = renumber_after(prefix + recipe_steps, len(existing))
    combined = existing + new_steps

    # Replay includes an EXPLAIN before execution: the authoritative check of
    # whether the recipe fits this file
    try:
        result = await asyncio.to_thread(replay_transformations_local, local_path, combined)
    except Exception as exc:
        mapped = set(column_map or {})
        missing = [m for m in missing_columns(required, file_columns) if m not in mapped]
        logger.info("Recipe %s did not fit file %s: %s", recipe_id, file_id, exc)
        events.record(user_id, "recipe_incompatible", recipe_id=recipe_id, missing=missing)
        if missing:
            message = f"This file is missing columns the recipe needs: {', '.join(missing)}."
        else:
            message = "The recipe's steps didn't run on this file."
        return _json_response(
            400, "RECIPE_INCOMPATIBLE", message,
            missing=missing,
            suggested_map=suggest_mapping(missing, file_columns, required_names),
            file_columns=file_columns,
            recipe_name=recipe["name"],
        )

    # Rows before the recipe and after each of its steps, and the checks,
    # measured on the same chain the preview came from
    checks = _checks_of(recipe)
    try:
        counts, failed = await asyncio.to_thread(
            measure_run, local_path, combined, len(existing),
            [check_sql(c, result["columns"]) for c in checks],
        )
    except Exception as exc:
        logger.warning("Could not measure recipe run %s on %s: %s", recipe_id, file_id, exc)
        counts, failed = None, [None] * len(checks)

    # Persist the appended steps, each with the rows it left
    try:
        last_number = len(existing) + len(new_steps)
        for i, step in enumerate(new_steps):
            is_last = step["step_number"] == last_number
            db.create_transformation(
                file_id=file_id,
                step_number=step["step_number"],
                instruction=step["instruction"],
                sql_query=step["sql_query"],
                explain=f"recipe: {recipe['name']}",
                sent={"source": "recipe"},
                row_count_after=counts[i + 1] if counts else (result["total_rows"] if is_last else None),
                column_count_after=result["total_columns"] if is_last else None,
                columns_after=result["columns"] if is_last else None,
            )
        db.update_file(
            file_id, user_id,
            row_count=result["total_rows"],
            column_count=result["total_columns"],
        )
    except Exception as exc:
        logger.error("Failed to persist recipe steps: %s", exc)
        # Roll back any partially-inserted steps so the chain stays coherent
        try:
            db.delete_transformations_after(file_id, len(existing))
        except Exception:
            logger.error("Rollback of partial recipe steps failed for %s", file_id)
        return _json_response(500, "DB_FAILED", "Failed to save recipe steps")

    # A remembered match becomes part of the recipe: next month's file, with
    # the new names, then fits as it is
    remembered = False
    if remember:
        try:
            db.update_recipe(
                recipe_id, user_id,
                steps=renumber_after(prefix + recipe_steps, 0),
                required_columns=remembered_columns(required, column_map),
            )
            remembered = True
        except Exception as exc:
            logger.warning("Could not remember the match on recipe %s: %s", recipe_id, exc)

    # The report: this run beside the last one, step by step
    report = None
    stored_counts = None
    if counts:
        baseline, compared_with = _baseline(user_id, recipe, len(recipe_steps))
        if baseline and prefix:
            # A match renames, it removes no rows: give it last time's count too
            baseline = [baseline[0]] + baseline
        steps_report = step_report([s["instruction"] for s in new_steps], counts, baseline)
        report = {
            "steps": steps_report,
            "flagged": sum(1 for s in steps_report if s["flag"]),
            "compared_with": compared_with if baseline else None,
        }
        # Saved aligned with the recipe as it now stands, for the next run
        stored_counts = counts if (remembered or not prefix) else [counts[0]] + counts[2:]

    check_results = [
        {
            **c,
            "label": check_label(c),
            "failed": f,
            "ok": f == 0,
            "column_missing": c["column"] not in result["columns"],
        }
        for c, f in zip(checks, failed)
    ]

    usage.record(user_id, rows_processed=result["total_rows"])
    # Where the apply came from: the hint over a fresh file, or the drawer
    source = body.get("from") if body.get("from") in ("hint", "drawer", "rerun", "recipes_page") else None
    events.record(
        user_id, "recipe_applied", recipe_id=recipe_id, steps=len(new_steps),
        **({"from": source} if source else {}),
    )
    if source == "hint":
        events.record(user_id, "recipe_hint_applied", recipe_id=recipe_id)
    if column_map:
        events.record(user_id, "recipe_columns_matched", recipe_id=recipe_id,
                      columns=len(column_map), remembered=remembered)
    if report and report["flagged"]:
        events.record(user_id, "recipe_run_flagged", recipe_id=recipe_id, flagged=report["flagged"])
    failing = [c for c in check_results if c["failed"]]
    if failing:
        events.record(user_id, "recipe_check_failed", recipe_id=recipe_id, checks=len(failing))
    try:
        db.create_audit_entry(
            user_id=user_id, file_id=file_id, action="recipe_apply",
            metadata={
                "recipe_id": recipe_id,
                "recipe_name": recipe["name"],
                "steps_added": len(new_steps),
                "counts": stored_counts,
                "elapsed_ms": round((perf_counter() - start_time) * 1000, 2),
            },
        )
    except Exception:
        logger.warning("Audit entry failed for recipe_apply %s", recipe_id)

    return {
        "file_id": file_id,
        "recipe_id": recipe_id,
        "recipe_name": recipe["name"],
        "steps_added": len(new_steps),
        "total_steps": len(combined),
        "matched": column_map or None,
        "remembered": remembered,
        "report": report,
        "checks": check_results,
        "preview": {
            "columns": result["columns"],
            "rows": result["preview"],
            "total_rows": result["total_rows"],
            "total_columns": result["total_columns"],
        },
    }


@router.put("/recipes/{recipe_id}/steps")
async def put_recipe_steps(request: Request, recipe_id: str):
    """Change what a recipe does, without the client ever sending SQL.

    Body is one of:
      {"keep": [3, 1, 2]}   the step numbers to keep, in their new order
      {"file_id": "..."}    replace the steps with that file's steps, and
                            its columns as the ones the recipe needs

    A reordered chain is planned on the recipe's source file before it is
    saved, so a step moved ahead of the one it depends on is refused by
    name rather than failing on next month's run.
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")
    if not isinstance(body, dict):
        return _json_response(400, "INVALID_JSON", "Request body must be a JSON object")

    recipe = db.get_recipe(recipe_id, user_id)
    if not recipe:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    before = recipe.get("steps") or []
    updates: dict = {}

    if body.get("file_id"):
        file_rec = db.get_file(body["file_id"], user_id)
        if not file_rec:
            return _json_response(404, "FILE_NOT_FOUND", "File not found")
        try:
            updates["steps"] = snapshot_steps(db.get_transformations(body["file_id"]))
        except RecipeError as exc:
            return _json_response(400, "EMPTY_RECIPE", str(exc))
        updates["required_columns"] = _base_columns(file_rec)
        updates["source_file_id"] = body["file_id"]
        change = {"from_file": body["file_id"]}
    elif "keep" in body:
        try:
            updates["steps"] = reorder_steps(before, body.get("keep"))
        except RecipeError as exc:
            return _json_response(400, "INVALID_STEPS", str(exc))
        order_changed = [s["sql_query"] for s in updates["steps"]] != [
            s["sql_query"] for s in before if s.get("step_number") in set(body["keep"])
        ]
        # Plan the new chain on the file the recipe came from, when it is still here
        src = recipe.get("source_file_id")
        src_rec = db.get_file(src, user_id) if src else None
        if src_rec:
            try:
                local_path = await asyncio.to_thread(get_local_parquet, src_rec["r2_key"])
                broken = await asyncio.to_thread(first_failing_step, local_path, updates["steps"])
            except Exception as exc:
                logger.warning("Could not plan edited recipe %s on its source: %s", recipe_id, exc)
                broken = None
            if broken is not None:
                step = updates["steps"][broken - 1]
                return _json_response(
                    400, "STEPS_DO_NOT_RUN",
                    f"In this order, step {broken} ({step.get('instruction') or 'untitled'}) can't run "
                    "on the file this recipe came from. Put it back after the step it needs, or remove it.",
                    step=broken,
                )
        change = {"kept": len(updates["steps"]), "removed": len(before) - len(updates["steps"]),
                  "reordered": order_changed}
    else:
        return _json_response(400, "NO_FIELDS", "Send keep (step numbers in order) or file_id")

    updated = db.update_recipe(recipe_id, user_id, **updates)
    if not updated:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    try:
        db.create_audit_entry(
            user_id=user_id, file_id=updated.get("source_file_id"), action="recipe_update",
            metadata={"recipe_id": recipe_id, "fields": ["steps"], **change},
        )
    except Exception:
        logger.warning("Audit entry failed for recipe_update %s", recipe_id)
    events.record(user_id, "recipe_steps_edited", recipe_id=recipe_id, steps=len(updates["steps"]), **change)
    return {
        "recipe_id": recipe_id,
        "steps": [
            {"step_number": s["step_number"], "instruction": s.get("instruction", "")}
            for s in updates["steps"]
        ],
        "required_columns": [
            c.get("name") for c in (updated.get("required_columns") or [])
            if isinstance(c, dict) and c.get("name")
        ],
    }


@router.put("/recipes/{recipe_id}/checks")
async def put_recipe_checks(request: Request, recipe_id: str):
    """Replace the checks a recipe runs after its steps."""
    user_id = getattr(request.state, "user_id", "anonymous")
    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")
    if not isinstance(body, dict):
        return _json_response(400, "INVALID_JSON", "Request body must be a JSON object")
    try:
        checks = validate_checks(body.get("checks"))
    except RecipeError as exc:
        return _json_response(400, "INVALID_CHECKS", str(exc))
    if not db.get_recipe(recipe_id, user_id):
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    try:
        updated = db.save_recipe_checks(recipe_id, user_id, checks)
    except db.MigrationMissing as exc:
        return _json_response(503, "MIGRATION_REQUIRED", str(exc))
    if not updated:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    events.record(user_id, "recipe_checks_saved", recipe_id=recipe_id, checks=len(checks))
    return {
        "recipe_id": recipe_id,
        "checks": [{**c, "label": check_label(c)} for c in checks],
    }
