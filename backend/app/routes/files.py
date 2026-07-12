"""GET/PATCH/DELETE /files — File management + duplicate, history, revert."""

from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, Query, Request, Response

from app import db, storage
from app.cache import get_local_parquet, invalidate_file
from app.engine import execute_sql_from_local, replay_transformations_local

logger = logging.getLogger("sheetsllm.routes.files")

router = APIRouter()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


@router.get("/files")
def list_files(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    user_id = getattr(request.state, "user_id", "anonymous")
    result = db.list_files(user_id, page=page, page_size=page_size)
    return {
        "files": result["items"],
        "total": result["total"],
        "page": page,
        "page_size": page_size,
    }


@router.get("/files/{file_id}")
def get_file(request: Request, file_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")
    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    steps = db.get_transformations(file_id)
    return {
        "file": file_rec,
        "transformations": steps,
        "step_count": len(steps),
    }


@router.patch("/files/{file_id}")
async def update_file(request: Request, file_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")

    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")

    name = body.get("name")
    if not name or not name.strip():
        return _json_response(400, "MISSING_NAME", "name is required")

    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    updated = db.update_file(file_id, user_id, name=name.strip())
    if not updated:
        return _json_response(500, "UPDATE_FAILED", "Failed to update file")

    return {"file": updated}


@router.delete("/files/{file_id}")
def delete_file(request: Request, file_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")

    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    r2_key = file_rec["r2_key"]

    invalidate_file(r2_key)
    db.delete_all_transformations(file_id)
    db.delete_file(file_id, user_id)

    try:
        storage.delete_object(r2_key)
    except Exception as exc:
        logger.warning("R2 cleanup failed for key=%s: %s", r2_key, exc)

    # The files row is already gone, so an audit row referencing it would
    # violate the FK. Insert with file_id=NULL and keep the id in metadata.
    try:
        db.create_audit_entry(
            user_id=user_id, file_id=None, action="delete",
            metadata={"filename": file_rec.get("name"), "file_id": file_id},
        )
    except Exception as exc:
        logger.warning("Audit entry failed for delete of %s: %s", file_id, exc)

    return {"deleted": True, "file_id": file_id}


# ── Duplicate ─────────────────────────────────────────────────────────


@router.post("/files/{file_id}/duplicate")
def duplicate_file(request: Request, file_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")

    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    # Create new IDs
    new_file_id = str(uuid.uuid4())
    new_r2_key = storage.r2_key_for_file(user_id, new_file_id)

    # Copy R2 object
    try:
        storage.copy_object(file_rec["r2_key"], new_r2_key)
    except Exception as exc:
        logger.error("R2 copy failed: %s", exc)
        return _json_response(500, "STORAGE_FAILED", "Failed to copy file")

    # Create new DB record
    original_name = file_rec.get("name", "file")
    base, _, ext = original_name.rpartition(".")
    new_name = f"{base or original_name} (copy).{ext}" if ext else f"{original_name} (copy)"

    try:
        db.create_file(
            file_id=new_file_id,
            user_id=user_id,
            name=new_name,
            r2_key=new_r2_key,
            original_format=file_rec.get("original_format", "csv"),
            row_count=file_rec.get("row_count", 0),
            column_count=file_rec.get("column_count", 0),
            schema_json=file_rec.get("schema_json", {}),
            size_bytes=file_rec.get("size_bytes", 0),
        )
    except Exception as exc:
        logger.error("DB duplicate failed: %s", exc)
        try:
            storage.delete_object(new_r2_key)
        except Exception:
            pass
        return _json_response(500, "DB_FAILED", "Failed to create duplicate record")

    try:
        db.create_audit_entry(
            user_id=user_id, file_id=new_file_id, action="duplicate",
            metadata={"source_file_id": file_id},
        )
    except Exception:
        pass

    return {"file_id": new_file_id, "name": new_name}


# ── History ───────────────────────────────────────────────────────────


@router.get("/files/{file_id}/history")
def get_history(request: Request, file_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")

    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    steps = db.get_transformations(file_id)
    return {
        "file_id": file_id,
        "steps": steps,
        "total_steps": len(steps),
    }


# ── Revert ────────────────────────────────────────────────────────────


@router.post("/files/{file_id}/revert/{step_num}")
def revert_to_step(request: Request, file_id: str, step_num: int):
    user_id = getattr(request.state, "user_id", "anonymous")

    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    r2_key = file_rec["r2_key"]
    steps = db.get_transformations(file_id)

    if step_num < 0 or step_num > len(steps):
        return _json_response(
            400, "INVALID_STEP",
            f"Step must be between 0 and {len(steps)}",
        )

    # Delete steps after the target
    deleted = db.delete_transformations_after(file_id, step_num)

    # Replay remaining steps (or original if step_num == 0)
    local_path = get_local_parquet(r2_key)
    remaining_steps = [s for s in steps if s["step_number"] <= step_num]

    if remaining_steps:
        result = replay_transformations_local(local_path, remaining_steps)
    else:
        result = execute_sql_from_local(local_path, "SELECT * FROM data")

    # Update file metadata
    try:
        db.update_file(
            file_id, user_id,
            row_count=result["total_rows"],
            column_count=result["total_columns"],
        )
    except Exception:
        pass

    try:
        db.create_audit_entry(
            user_id=user_id, file_id=file_id, action="revert",
            metadata={"reverted_to_step": step_num, "deleted_steps": deleted},
        )
    except Exception:
        pass

    return {
        "file_id": file_id,
        "reverted_to_step": step_num,
        "deleted_steps": deleted,
        "remaining_steps": len(remaining_steps),
        "preview": {
            "columns": result["columns"],
            "rows": result["preview"],
            "total_rows": result["total_rows"],
            "total_columns": result["total_columns"],
        },
    }
