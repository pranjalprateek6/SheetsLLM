"""Where a person is on the first loop, from what the account holds.

The checklist used to live in localStorage, so a new browser reset it and
the backend could not see the funnel. The four milestones are read from
the events the routes already record: an upload, a first step, a saved
recipe, a recipe run on another file.

Also: a recipe saved from a bundled sample is practice, so it does not
count against the free plan's recipe slots.
"""
from __future__ import annotations

import logging

from app import db

logger = logging.getLogger("sheetsllm.onboarding")

# The file names the bundled samples upload under (frontend/lib/samples.ts)
SAMPLE_FILE_NAMES = frozenset({
    "orders_oct.csv", "orders_nov.csv", "regions.csv",
    "sample_sales.csv", "sample_employees.csv", "sample_survey.csv",
})

MILESTONE_EVENTS = (
    "upload_completed", "op_applied", "insight_fix_applied", "chat_sent",
    "recipe_saved", "recipe_applied",
)


def milestones(user_id: str) -> dict[str, bool]:
    """{"upload", "transform", "recipe", "rerun"} for this user."""
    try:
        rows = db.user_events(user_id, list(MILESTONE_EVENTS))
    except Exception as exc:
        logger.warning("onboarding: events unavailable for %s: %s", user_id, exc)
        rows = []
    names = {r.get("event") for r in rows}
    chat_transform = any(
        r.get("event") == "chat_sent" and (r.get("properties") or {}).get("kind") == "transform" for r in rows
    )
    return {
        "upload": "upload_completed" in names,
        "transform": bool(names & {"op_applied", "insight_fix_applied", "recipe_applied"}) or chat_transform,
        "recipe": "recipe_saved" in names,
        "rerun": "recipe_applied" in names,
    }


def is_sample_recipe(recipe: dict, names: dict[str, str]) -> bool:
    return names.get(recipe.get("source_file_id") or "") in SAMPLE_FILE_NAMES


def counted_recipes(recipes: list[dict]) -> list[dict]:
    """The recipes that count against the plan: all but practice ones
    saved from a bundled sample."""
    try:
        names = db.file_names([r["source_file_id"] for r in recipes if r.get("source_file_id")])
    except Exception:
        return recipes
    return [r for r in recipes if not is_sample_recipe(r, names)]
