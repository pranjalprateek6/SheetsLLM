"""Recipes — save a file's transformation chain, re-apply it to new files.

POST   /recipes              save current chain of a file as a named recipe
GET    /recipes              list the user's recipes
GET    /recipes/{id}         recipe detail (steps included)
DELETE /recipes/{id}         delete a recipe
POST   /recipes/{id}/apply   append the recipe's steps to another file
"""

from __future__ import annotations

import asyncio
import json
import logging
from time import perf_counter

from fastapi import APIRouter, Request, Response

from app import db, events, usage
from app.cache import get_local_parquet
from app.engine import replay_transformations_local
from app.recipes import (
    RecipeError,
    missing_columns,
    renumber_after,
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
    if limit and len(db.list_recipes(user_id)) >= limit:
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
    )

    try:
        db.create_audit_entry(
            user_id=user_id, file_id=file_id, action="recipe_create",
            metadata={"recipe_id": recipe["id"], "name": name, "steps": len(recipe_steps)},
        )
    except Exception:
        logger.warning("Audit entry failed for recipe_create %s", recipe["id"])

    return {
        "recipe_id": recipe["id"],
        "name": name,
        "steps": len(recipe_steps),
    }


@router.get("/recipes")
def list_recipes(request: Request):
    user_id = getattr(request.state, "user_id", "anonymous")
    recipes = db.list_recipes(user_id)
    return {
        "recipes": [
            {
                "id": r["id"],
                "name": r["name"],
                "description": r.get("description"),
                "steps": len(r.get("steps") or []),
                "created_at": r.get("created_at"),
            }
            for r in recipes
        ],
        "total": len(recipes),
    }


@router.get("/recipes/{recipe_id}")
def get_recipe(request: Request, recipe_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")
    recipe = db.get_recipe(recipe_id, user_id)
    if not recipe:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    return {"recipe": recipe}


@router.delete("/recipes/{recipe_id}")
def delete_recipe(request: Request, recipe_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")
    if not db.delete_recipe(recipe_id, user_id):
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    return {"deleted": True, "recipe_id": recipe_id}


@router.post("/recipes/{recipe_id}/apply")
async def apply_recipe(request: Request, recipe_id: str):
    """Append the recipe's steps to a target file and replay the full chain.

    No LLM call is involved — that is the point of recipes — so this consumes
    no transform quota; only rows_processed is recorded.
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

    existing = db.get_transformations(file_id)
    new_steps = renumber_after(recipe_steps, len(existing))
    combined = existing + new_steps

    # Dry run + execute: replay includes an EXPLAIN before execution, which is
    # the authoritative compatibility check for the target file's schema.
    try:
        local_path = await asyncio.to_thread(get_local_parquet, file_rec["r2_key"])
        result = await asyncio.to_thread(replay_transformations_local, local_path, combined)
    except Exception as exc:
        target_cols = [c.get("name") for c in _base_columns(file_rec)]
        missing = missing_columns(recipe.get("required_columns") or [], target_cols)
        hint = (
            f" The recipe's source file had columns this file lacks: {missing}."
            if missing else ""
        )
        return _json_response(
            400, "RECIPE_INCOMPATIBLE",
            f"Recipe could not be applied to this file: {exc}.{hint}",
        )

    # Persist the appended steps (counts recorded on the final step)
    try:
        last_number = len(existing) + len(new_steps)
        for step in new_steps:
            is_last = step["step_number"] == last_number
            db.create_transformation(
                file_id=file_id,
                step_number=step["step_number"],
                instruction=step["instruction"],
                sql_query=step["sql_query"],
                explain=f"recipe: {recipe['name']}",
                row_count_after=result["total_rows"] if is_last else None,
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

    usage.record(user_id, rows_processed=result["total_rows"])
    try:
        db.create_audit_entry(
            user_id=user_id, file_id=file_id, action="recipe_apply",
            metadata={
                "recipe_id": recipe_id,
                "recipe_name": recipe["name"],
                "steps_added": len(new_steps),
                "elapsed_ms": round((perf_counter() - start_time) * 1000, 2),
            },
        )
    except Exception:
        logger.warning("Audit entry failed for recipe_apply %s", recipe_id)

    return {
        "file_id": file_id,
        "recipe_id": recipe_id,
        "steps_added": len(new_steps),
        "total_steps": len(combined),
        "preview": {
            "columns": result["columns"],
            "rows": result["preview"],
            "total_rows": result["total_rows"],
            "total_columns": result["total_columns"],
        },
    }
