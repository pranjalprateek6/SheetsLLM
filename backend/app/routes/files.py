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


_ALLOWED_SORTS = {"updated_at", "created_at", "name", "row_count"}
_ALLOWED_DIRS = {"asc", "desc"}


def _normalize_sort(sort: str | None, direction: str | None) -> tuple[str, str]:
    """Validate sort/dir against allowlists, falling back to defaults."""
    sort = (sort or "").strip().lower()
    direction = (direction or "").strip().lower()
    if sort not in _ALLOWED_SORTS:
        sort = "updated_at"
    if direction not in _ALLOWED_DIRS:
        direction = "desc"
    return sort, direction


@router.get("/files")
def list_files(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = Query(None),
    sort: str = Query("updated_at"),
    dir: str = Query("desc"),
):
    user_id = getattr(request.state, "user_id", "anonymous")
    sort_field, direction = _normalize_sort(sort, dir)
    result = db.list_files(
        user_id,
        page=page,
        page_size=page_size,
        q=q,
        sort=sort_field,
        direction=direction,
    )
    # What state each file is in, in a fixed number of queries for the page
    files = result["items"]
    try:
        states = db.file_states([f["id"] for f in files])
    except Exception as exc:
        logger.warning("file states unavailable: %s", exc)
        states = {}
    files = [{**f, **states.get(f["id"], {})} for f in files]
    return {
        "files": files,
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
    try:
        original_rows = db.get_upload_row_count(file_id)
    except Exception:
        original_rows = None
    base_columns = [
        c.get("name") for c in (file_rec.get("schema_json") or {}).get("columns") or []
        if isinstance(c, dict) and c.get("name")
    ]
    return {
        "file_id": file_id,
        "steps": with_deltas(steps, base_columns),
        "total_steps": len(steps),
        "original_row_count": original_rows,
        "base_columns": base_columns,
    }


def step_source(step: dict) -> str:
    """Where a step came from: llm, cache, recipe, op or redo."""
    sent = step.get("sent") or {}
    if isinstance(sent, dict) and sent.get("source"):
        return str(sent["source"])
    explain = step.get("explain") or ""
    for prefix, source in (("recipe: ", "recipe"), ("op: ", "op"), ("redo", "redo")):
        if explain.startswith(prefix):
            return source
    return "llm"


def with_deltas(steps: list[dict], base_columns: list[str]) -> list[dict]:
    """Each step with the columns it added and removed, from the stored
    columns_after of the step and the last step before it that has them.
    Unknown (null) when either side was not recorded."""
    out = []
    prev: list[str] | None = list(base_columns) if base_columns else None
    for step in steps:
        cols = step.get("columns_after")
        added = removed = None
        if isinstance(cols, list) and prev is not None:
            added = [c for c in cols if c not in prev]
            removed = [c for c in prev if c not in cols]
        if isinstance(cols, list):
            prev = cols
        out.append({**step, "columns_added": added, "columns_removed": removed, "source": step_source(step)})
    return out


# ── POST /files/{id}/steps: put back a step you know the SQL of ──────


@router.post("/files/{file_id}/steps")
async def add_step(request: Request, file_id: str):
    """Redo: re-apply a step from its stored SQL. Validated exactly as a
    recipe step is, replayed, saved. No AI call, no AI request metered."""
    from app import usage
    from app.sql_validator import SQLValidationError, validate_sql

    user_id = getattr(request.state, "user_id", "anonymous")
    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")
    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")
    instruction = str((body or {}).get("instruction") or "").strip()
    sql = str((body or {}).get("sql") or "")
    if not instruction or not sql:
        return _json_response(400, "MISSING_FIELDS", "instruction and sql are required")
    try:
        sql = validate_sql(sql)
    except SQLValidationError as exc:
        return _json_response(400, "INVALID_SQL", str(exc))

    steps = db.get_transformations(file_id)
    step_number = len(steps) + 1
    try:
        local_path = get_local_parquet(file_rec["r2_key"])
        result = replay_transformations_local(
            local_path, steps + [{"step_number": step_number, "sql_query": sql}]
        )
    except Exception as exc:
        return _json_response(400, "EXECUTION_FAILED", f"That step no longer runs on this file: {exc}")

    db.create_transformation(
        file_id=file_id, step_number=step_number, instruction=instruction, sql_query=sql,
        explain="redo", row_count_after=result["total_rows"],
        column_count_after=result["total_columns"], columns_after=result["columns"],
        sent={"source": "redo"},
    )
    try:
        db.update_file(file_id, user_id, row_count=result["total_rows"], column_count=result["total_columns"])
    except Exception:
        pass
    usage.record(user_id, transforms=1, rows_processed=result["total_rows"])
    return {
        "file_id": file_id,
        "step_number": step_number,
        "instruction": instruction,
        "sql": sql,
        "preview": {
            "columns": result["columns"],
            "rows": result["preview"],
            "total_rows": result["total_rows"],
            "total_columns": result["total_columns"],
        },
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
