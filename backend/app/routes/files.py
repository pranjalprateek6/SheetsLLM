"""GET/PATCH/DELETE /files — File management + duplicate, history, revert."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Query, Request, Response

import datetime as _dt

from app import lookups
from app import db, events, storage
from app.share import SHARE_TTL_SECONDS, make_token
from app.cache import get_local_parquet, invalidate_file
from app.engine import first_failing_step, execute_sql_from_local, replay_transformations_local

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


_RECEIPT_KEYS = ("source", "mode", "columns_sent", "sample_rows_sent", "values_per_column", "lookups_sent")


@router.get("/files/{file_id}/rows")
async def file_rows(
    request: Request, file_id: str, offset: int = 0, limit: int = 500,
    sort: str | None = None, dir: str = "asc", q: str | None = None,
    empty: str | None = None, upto: int | None = None,
):
    """A page of the grid: the file as its steps left it (or as step
    `upto` left it), sorted, filtered or narrowed to empty cells as a view.
    Nothing is saved; a sort or filter the person wants to keep is a step."""
    from app.engine import page_rows

    user_id = getattr(request.state, "user_id", "anonymous")
    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")
    if q is not None and len(q) > 100:
        return _json_response(400, "INVALID_ARGS", "The filter is too long.")
    steps = db.get_transformations(file_id)
    if upto is not None:
        steps = [s for s in steps if int(s.get("step_number") or 0) <= upto]
    lookups.use(file_id, user_id)
    try:
        local_path = await asyncio.to_thread(get_local_parquet, file_rec["r2_key"])
        page = await asyncio.to_thread(
            page_rows, local_path, steps, offset=offset, limit=limit,
            sort=sort or None, descending=(dir == "desc"), q=(q or "").strip() or None, empty=empty or None,
        )
    except ValueError as exc:
        return _json_response(400, "UNKNOWN_COLUMN", str(exc))
    except Exception as exc:
        logger.warning("rows failed for %s: %s", file_id, exc)
        return _json_response(400, "EXECUTION_FAILED", "Couldn't read the rows of this file.")
    return {"file_id": file_id, "upto": upto, **page}


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
    lookups.use(file_id, user_id)
    try:
        local_path = get_local_parquet(file_rec["r2_key"])
        result = replay_transformations_local(
            local_path, steps + [{"step_number": step_number, "sql_query": sql}]
        )
    except Exception as exc:
        return _json_response(400, "EXECUTION_FAILED", f"That step no longer runs on this file: {exc}")

    # A Chef proposal applied: the step keeps the receipt of what the AI was
    # sent when it wrote it, limited to the receipt's own fields
    proposal = body.get("sent") if isinstance(body.get("sent"), dict) else None
    sent = {"source": "redo"}
    explain = "redo"
    if proposal and proposal.get("source") == "llm":
        sent = {k: proposal[k] for k in _RECEIPT_KEYS if k in proposal}
        sent["source"] = "llm"
        explain = "chef"
    db.create_transformation(
        file_id=file_id, step_number=step_number, instruction=instruction, sql_query=sql,
        explain=explain, row_count_after=result["total_rows"],
        column_count_after=result["total_columns"], columns_after=result["columns"],
        sent=sent,
    )
    if explain == "chef":
        try:
            db.create_chat_message(
                file_id=file_id, role="assistant", content=f"Applied as step {step_number}.",
                message_type="transform", metadata={"sql": sql, "step_number": step_number, "sent": sent},
            )
        except Exception:
            pass
        events.record(user_id, "chef_proposal_applied")
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


@router.delete("/files/{file_id}/steps/{step_num}")
def remove_step(request: Request, file_id: str, step_num: int):
    """Take one step out of the middle of a file's history.

    The steps after it run again without it. The new chain is planned on
    the file first: a later step that needs what this one did (a column it
    added, say) is named, and nothing changes.
    """
    user_id = getattr(request.state, "user_id", "anonymous")

    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    lookups_now = lookups.use(file_id, user_id)
    steps = db.get_transformations(file_id)
    target = next((s for s in steps if s.get("step_number") == step_num), None)
    if target is None:
        return _json_response(404, "STEP_NOT_FOUND", f"There is no step {step_num}")

    kept = [s for s in steps if s is not target]
    renumbered = [{**s, "step_number": i + 1} for i, s in enumerate(kept)]

    local_path = get_local_parquet(file_rec["r2_key"])
    broken = first_failing_step(local_path, renumbered) if renumbered else None
    if broken is not None:
        needs = kept[broken - 1]
        return _json_response(
            409, "STEP_NEEDED",
            f"Step {step_num} can't be removed: step {needs.get('step_number')} "
            f"({needs.get('instruction') or 'untitled'}) needs what it did. Nothing changed.",
            step=needs.get("step_number"),
        )

    db.delete_transformation(file_id, step_num)
    db.renumber_transformations_after(file_id, step_num)

    if renumbered:
        result = replay_transformations_local(local_path, renumbered)
    else:
        result = execute_sql_from_local(local_path, "SELECT * FROM data")

    try:
        db.update_file(file_id, user_id, row_count=result["total_rows"], column_count=result["total_columns"])
    except Exception:
        pass
    try:
        db.create_audit_entry(
            user_id=user_id, file_id=file_id, action="step_remove",
            metadata={"removed_step": step_num, "instruction": target.get("instruction"), "steps_left": len(renumbered)},
        )
    except Exception:
        pass
    events.record(user_id, "step_removed", position=step_num, of=len(steps))

    return {
        "file_id": file_id,
        "removed_step": step_num,
        "steps": len(renumbered),
        "preview": {
            "columns": result["columns"],
            "rows": result["preview"],
            "total_rows": result["total_rows"],
            "total_columns": result["total_columns"],
        },
    }


@router.get("/files/{file_id}/lookups")
def list_file_lookups(request: Request, file_id: str):
    """The lookup tables linked to a file, with their columns."""
    user_id = getattr(request.state, "user_id", "anonymous")
    if not db.get_file(file_id, user_id):
        return _json_response(404, "FILE_NOT_FOUND", "File not found")
    views = lookups.use(file_id, user_id)
    schemas = lookups.schemas(views) if views else {}
    return {
        "lookups": [
            {"alias": a, "file_id": lv.file_id, "name": lv.name, "columns": schemas.get(a, [])}
            for a, lv in views.items()
        ],
    }


@router.post("/files/{file_id}/lookups")
async def add_file_lookup(request: Request, file_id: str):
    """Link another of the user's files to this one under an alias."""
    user_id = getattr(request.state, "user_id", "anonymous")
    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")
    if not isinstance(body, dict):
        return _json_response(400, "INVALID_JSON", "Request body must be a JSON object")
    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")
    lookup_id = body.get("lookup_file_id")
    lookup_rec = db.get_file(lookup_id, user_id) if isinstance(lookup_id, str) else None
    if not lookup_rec:
        return _json_response(404, "LOOKUP_NOT_FOUND", "Pick one of your files to use as the lookup.")
    if lookup_id == file_id:
        return _json_response(400, "SAME_FILE", "A file cannot be its own lookup.")
    if (lookup_rec.get("row_count") or 0) > lookups.MAX_LOOKUP_ROWS:
        return _json_response(400, "LOOKUP_TOO_BIG", f"A lookup can have up to {lookups.MAX_LOOKUP_ROWS:,} rows.")
    try:
        existing = db.list_lookups(file_id)
    except Exception as exc:
        logger.warning("lookups unavailable: %s", exc)
        return _json_response(503, "LOOKUPS_UNAVAILABLE", "Lookup tables aren't ready on this server yet. Try again later.")
    taken = {l["alias"] for l in existing}
    try:
        alias = lookups.check_alias(body.get("alias") or lookups.suggest_alias(lookup_rec.get("name", ""), taken))
    except lookups.LookupError as exc:
        return _json_response(400, exc.code, str(exc))
    if alias not in taken and len(existing) >= lookups.MAX_LOOKUPS:
        return _json_response(400, "TOO_MANY_LOOKUPS", f"A file can have up to {lookups.MAX_LOOKUPS} lookups.")
    try:
        db.add_lookup(user_id=user_id, file_id=file_id, lookup_file_id=lookup_id, alias=alias)
    except Exception as exc:
        logger.warning("lookup link failed: %s", exc)
        return _json_response(503, "LOOKUPS_UNAVAILABLE", "Couldn't link that file right now. Try again later.")
    events.record(user_id, "lookup_linked")
    views = lookups.use(file_id, user_id)
    return {"alias": alias, "file_id": lookup_id, "name": lookup_rec.get("name"), "columns": lookups.schemas(views).get(alias, [])}


@router.delete("/files/{file_id}/lookups/{alias}")
def remove_file_lookup(request: Request, file_id: str, alias: str):
    user_id = getattr(request.state, "user_id", "anonymous")
    if not db.get_file(file_id, user_id):
        return _json_response(404, "FILE_NOT_FOUND", "File not found")
    try:
        removed = db.remove_lookup(file_id, alias)
    except Exception as exc:
        logger.warning("lookup unlink failed: %s", exc)
        return _json_response(503, "LOOKUPS_UNAVAILABLE", "Couldn't unlink that table right now. Try again later.")
    if not removed:
        return _json_response(404, "LOOKUP_NOT_FOUND", "There is no lookup by that name on this file.")
    return {"removed": True, "alias": alias}


@router.post("/files/{file_id}/share")
def share_file(request: Request, file_id: str):
    """A link that serves this file's cleaned CSV to anyone who has it, for
    seven days. Nothing is stored: the token is signed and expires alone."""
    user_id = getattr(request.state, "user_id", "anonymous")
    if not db.get_file(file_id, user_id):
        return _json_response(404, "FILE_NOT_FOUND", "File not found")
    token, expires = make_token(file_id, user_id)
    events.record(user_id, "share_link_created")
    return {
        "token": token,
        "expires_at": _dt.datetime.fromtimestamp(expires, _dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "days": SHARE_TTL_SECONDS // 86400,
    }


@router.post("/files/{file_id}/revert/{step_num}")
def revert_to_step(request: Request, file_id: str, step_num: int):
    user_id = getattr(request.state, "user_id", "anonymous")

    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    lookups_now = lookups.use(file_id, user_id)
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
