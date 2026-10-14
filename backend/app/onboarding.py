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

# The bundled samples (frontend/public/samples): the name each uploads
# under, its exact header and its row count. A recipe is practice only
# when its source file matches all three, so renaming a file is not enough.
SAMPLE_SHAPES = {
    "orders_oct.csv": (("Order ID", "Customer Email", "Region", "Order Date", "MRP", "Landing Cost", "Status"), 1012),
    "orders_nov.csv": (("Order ID", "Customer Email", "Region", "Order Date", "MRP", "Landing Cost", "Status"), 1040),
    "sample_sales.csv": (("order_id", "order_date", "product", "category", "region", "units", "unit_price", "revenue"), 1000),
    "sample_employees.csv": (("employee_id", "name", "department", "city", "salary", "hire_date"), 500),
    "sample_survey.csv": (("response_id", "age_group", "gender", "rating", "would_recommend", "submitted_at"), 200),
}
SAMPLE_FILE_NAMES = frozenset(SAMPLE_SHAPES)
# At most this many practice recipes go uncounted
MAX_PRACTICE_RECIPES = 1

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


def is_sample_file(file_row: dict | None) -> bool:
    """True when a file is a bundled sample: its name, its header and its
    row count all match. Read from the stored upload record, not the name."""
    if not file_row:
        return False
    shape = SAMPLE_SHAPES.get(file_row.get("name") or "")
    if not shape:
        return False
    header, rows = shape
    schema = file_row.get("schema_json") or {}
    columns = tuple(c.get("name") for c in schema.get("columns") or [] if isinstance(c, dict))
    return columns == header and int(file_row.get("row_count") or -1) == rows


def counted_recipes(recipes: list[dict]) -> list[dict]:
    """The recipes that count against the plan: all but one practice
    recipe saved from a bundled sample."""
    try:
        files = db.file_rows([r["source_file_id"] for r in recipes if r.get("source_file_id")])
    except Exception:
        return recipes
    out, exempted = [], 0
    # Oldest first, so the tutorial recipe is the one exempted
    for r in sorted(recipes, key=lambda r: str(r.get("created_at") or "")):
        if exempted < MAX_PRACTICE_RECIPES and is_sample_file(files.get(r.get("source_file_id") or "")):
            exempted += 1
            continue
        out.append(r)
    return out
