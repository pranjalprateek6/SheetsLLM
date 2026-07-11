"""POST /undo — Replay N-1 steps via CTE chain."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Request, Response

from app import db
from app.cache import get_local_parquet
from app.engine import execute_sql_from_local, replay_transformations_local

logger = logging.getLogger("sheetsllm.routes.undo")

router = APIRouter()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


@router.post("/undo")
async def undo(request: Request):
    user_id = getattr(request.state, "user_id", "anonymous")

    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")

    file_id = body.get("file_id")
    if not file_id:
        return _json_response(400, "MISSING_FILE_ID", "file_id is required")

    # ── Verify file ownership ──────────────────────────────────────────
    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    r2_key = file_rec["r2_key"]

    # ── Get transformation steps ───────────────────────────────────────
    steps = db.get_transformations(file_id)
    if not steps:
        return _json_response(400, "NOTHING_TO_UNDO", "No transformations to undo")

    # ── Delete the last step ───────────────────────────────────────────
    last_step = steps[-1]["step_number"]
    db.delete_transformations_after(file_id, last_step - 1)

    # ── Replay remaining steps (or original if none left) ──────────────
    local_path = get_local_parquet(r2_key)
    remaining_steps = steps[:-1]
    if remaining_steps:
        result = replay_transformations_local(local_path, remaining_steps)
    else:
        result = execute_sql_from_local(local_path, "SELECT * FROM data")

    # ── Update file metadata ───────────────────────────────────────────
    try:
        db.update_file(
            file_id,
            user_id,
            row_count=result["total_rows"],
            column_count=result["total_columns"],
        )
    except Exception:
        pass

    # ── Audit log ──────────────────────────────────────────────────────
    try:
        db.create_audit_entry(
            user_id=user_id,
            file_id=file_id,
            action="undo",
            metadata={"undone_step": last_step, "remaining_steps": len(remaining_steps)},
        )
    except Exception:
        pass

    return {
        "file_id": file_id,
        "undone_step": last_step,
        "remaining_steps": len(remaining_steps),
        "preview": {
            "columns": result["columns"],
            "rows": result["preview"],
            "total_rows": result["total_rows"],
            "total_columns": result["total_columns"],
        },
    }
