"""A recipe's history, and recipes as files.

GET  /recipes/{id}/versions                 the versions, newest first
POST /recipes/{id}/versions/{n}/restore     bring version n back (a new version)
GET  /recipes/{id}/export                   the recipe as a JSON file
POST /recipes/import-file                   a recipe file into this account
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Request, Response

from app import db, events, recipe_versions
from app.recipes import RecipeError

logger = logging.getLogger("sheetsllm.routes.recipe_history")

router = APIRouter()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    return Response(json.dumps({"code": code, "message": message, **extra}), status_code=status, media_type="application/json")


def _user(request: Request) -> str:
    return getattr(request.state, "user_id", "anonymous")


@router.get("/recipes/{recipe_id}/versions")
def list_versions(request: Request, recipe_id: str):
    user_id = _user(request)
    recipe = db.get_recipe(recipe_id, user_id)
    if not recipe:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    try:
        versions = db.list_recipe_versions(recipe_id, user_id, limit=recipe_versions.KEEP)
    except db.MigrationMissing:
        # Not an error to show in the browser: there is simply no history yet
        return {"recipe_id": recipe_id, "versions": [], "kept": False}
    return {"recipe_id": recipe_id, "versions": [recipe_versions.describe(v, recipe) for v in versions], "kept": True}


@router.post("/recipes/{recipe_id}/versions/{version}/restore")
def restore_version(request: Request, recipe_id: str, version: int):
    user_id = _user(request)
    recipe = db.get_recipe(recipe_id, user_id)
    if not recipe:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    try:
        old = db.get_recipe_version(recipe_id, user_id, version)
    except db.MigrationMissing:
        return _json_response(503, "MIGRATION_REQUIRED", "A recipe's history is kept once migration 019 is applied.")
    if not old:
        return _json_response(404, "VERSION_NOT_FOUND", f"This recipe has no version {version}.")
    updates = {
        "name": old.get("name") or recipe.get("name"),
        "steps": old.get("steps") or [],
        "required_columns": old.get("required_columns") or [],
        "checks": old.get("checks") or [],
        "required_lookups": old.get("required_lookups") or [],
    }
    updated = db.update_recipe(recipe_id, user_id, **updates)
    if not updated:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    n = recipe_versions.record(user_id, updated, "restored", before=recipe, restored_from=version)
    events.record(user_id, "recipe_version_restored", recipe_id=recipe_id, version=version)
    return {
        "recipe_id": recipe_id,
        "restored": version,
        "version": n,
        "name": updated.get("name"),
        "steps": [{"step_number": s.get("step_number"), "instruction": s.get("instruction", "")} for s in updated.get("steps") or []],
    }


@router.get("/recipes/{recipe_id}/export")
def export_recipe(request: Request, recipe_id: str):
    user_id = _user(request)
    recipe = db.get_recipe(recipe_id, user_id)
    if not recipe:
        return _json_response(404, "RECIPE_NOT_FOUND", "Recipe not found")
    events.record(user_id, "recipe_exported", recipe_id=recipe_id)
    return recipe_versions.to_file(recipe)


@router.post("/recipes/import-file")
async def import_file(request: Request):
    from app import onboarding, usage

    user_id = _user(request)
    raw = await request.body()
    if len(raw) > recipe_versions.MAX_FILE_BYTES:
        return _json_response(413, "RECIPE_FILE_TOO_LARGE", "A recipe file is at most 512 KB.")
    try:
        data = json.loads(raw or b"null")
    except Exception:
        return _json_response(400, "INVALID_RECIPE_FILE", "That file isn't valid JSON.")
    try:
        parsed = recipe_versions.from_file(data)
    except RecipeError as exc:
        return _json_response(400, "INVALID_RECIPE_FILE", str(exc))

    limit = usage.recipe_limit(user_id)
    if limit and len(onboarding.counted_recipes(db.list_recipes(user_id))) >= limit:
        events.record(user_id, "paywall_hit", action="recipes", limit=limit)
        return _json_response(
            402, "RECIPE_LIMIT_REACHED",
            f"The free plan includes {limit} saved recipe{'s' if limit != 1 else ''}. Upgrade to Pro for unlimited recipes.",
        )

    recipe = db.create_recipe(
        user_id=user_id,
        name=parsed["name"],
        description=parsed["description"],
        source_file_id=None,
        steps=parsed["steps"],
        required_columns=parsed["required_columns"],
        required_lookups=parsed["required_lookups"],
    )
    if parsed["checks"]:
        try:
            recipe = db.save_recipe_checks(recipe["id"], user_id, parsed["checks"]) or recipe
        except db.MigrationMissing:
            logger.info("checks not imported: migration 011 not applied")
    recipe_versions.record(user_id, recipe, "imported")
    events.record(user_id, "recipe_imported", via="file", steps=len(parsed["steps"]))
    return {
        "recipe_id": recipe["id"],
        "name": recipe.get("name"),
        "steps": len(parsed["steps"]),
        "lookups": [l["alias"] for l in parsed["required_lookups"]],
    }
