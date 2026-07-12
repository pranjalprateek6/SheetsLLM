"""POST /reset — Clear all transformations and return original data."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Request, Response

from app import db
from app.cache import get_local_parquet
from app.engine import execute_sql_from_local

logger = logging.getLogger("sheetsllm.routes.reset")

router = APIRouter()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


@router.post("/reset")
async def reset(request: Request):
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

    # ── Delete all transformations ─────────────────────────────────────
    deleted_count = db.delete_all_transformations(file_id)

    # ── Return original data ───────────────────────────────────────────
    local_path = await asyncio.to_thread(get_local_parquet, r2_key)
    result = await asyncio.to_thread(execute_sql_from_local, local_path, "SELECT * FROM data")

    # ── Update file metadata to original counts ────────────────────────
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
            action="reset",
            metadata={"deleted_steps": deleted_count},
        )
    except Exception:
        pass

    return {
        "file_id": file_id,
        "deleted_steps": deleted_count,
        "preview": {
            "columns": result["columns"],
            "rows": result["preview"],
            "total_rows": result["total_rows"],
            "total_columns": result["total_columns"],
        },
    }
