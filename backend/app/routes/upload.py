"""POST /upload — CSV/XLSX/JSON/TSV → Parquet → Supabase Storage + metadata."""

from __future__ import annotations

import json
import logging
import uuid
from time import perf_counter

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response

from app.config import MAX_COLUMNS, MAX_UPLOAD_MB, UPLOAD_MAX_BYTES
from app import db, storage
from app.engine import convert_to_parquet, detect_sheets, get_schema_from_local
from app.insights import generate_insights
from app.security import (
    FileValidationError,
    validate_file_magic,
    validate_no_macros,
)
from app import usage
from app.usage import UsageLimitExceeded

logger = logging.getLogger("sheetsllm.routes.upload")

router = APIRouter()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


@router.post("/upload")
async def upload(
    request: Request,
    x_filename: str = Header(default="upload.csv"),
    sheet_name: str | None = Query(None),
):
    request_id = getattr(request.state, "request_id", "unknown")
    user_id = getattr(request.state, "user_id", "anonymous")
    file_id = str(uuid.uuid4())
    filename = (x_filename or "upload.csv").strip()
    start_time = perf_counter()

    # ── Monthly usage cap ────────────────────────────────────────────
    try:
        usage.enforce(user_id, "uploads")
    except UsageLimitExceeded as exc:
        return _json_response(429, "USAGE_LIMIT_EXCEEDED", str(exc))

    # ── Stream upload with size check ────────────────────────────────
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > UPLOAD_MAX_BYTES:
                return _json_response(
                    413, "UPLOAD_TOO_LARGE", f"Max upload size is {MAX_UPLOAD_MB} MB"
                )
        except ValueError:
            pass

    chunks: list[bytes] = []
    bytes_seen = 0
    async for chunk in request.stream():
        if not chunk:
            continue
        bytes_seen += len(chunk)
        if bytes_seen > UPLOAD_MAX_BYTES:
            return _json_response(
                413, "UPLOAD_TOO_LARGE", f"Max upload size is {MAX_UPLOAD_MB} MB"
            )
        chunks.append(chunk)

    file_bytes = b"".join(chunks)
    if not file_bytes:
        return _json_response(400, "EMPTY_FILE", "No file data received")

    # ── Security validation ────────────────────────────────────────────
    try:
        validate_file_magic(file_bytes, filename)
        validate_no_macros(file_bytes, filename)
    except FileValidationError as exc:
        logger.warning("File validation failed: %s", exc)
        return _json_response(400, "INVALID_FILE", str(exc))

    # ── Multi-sheet XLSX detection ───────────────────────────────────
    if sheet_name is None:
        sheets = detect_sheets(file_bytes, filename)
        if sheets:
            return {
                "requires_sheet_selection": True,
                "sheets": sheets,
                "file_id": file_id,
            }

    # ── Convert to Parquet ───────────────────────────────────────────
    try:
        parquet_bytes, row_count, col_count = convert_to_parquet(
            file_bytes, filename, sheet_name=sheet_name
        )
    except Exception as exc:
        logger.error("Parquet conversion failed: %s", exc)
        return _json_response(
            400, "CONVERSION_FAILED", f"Failed to parse file: {exc}"
        )

    if col_count > MAX_COLUMNS:
        return _json_response(
            400,
            "TOO_MANY_COLUMNS",
            f"File has {col_count} columns (max {MAX_COLUMNS})",
        )

    # Row cap is enforced inside convert_to_parquet (table is truncated),
    # so row_count here always reflects the stored data.

    # ── Upload to Storage ────────────────────────────────────────────
    r2_key = storage.r2_key_for_file(user_id, file_id)
    try:
        storage.upload_parquet(r2_key, parquet_bytes)
    except Exception as exc:
        logger.error("Storage upload failed: %s", exc)
        return _json_response(500, "STORAGE_FAILED", "Failed to store file")

    # ── Cache locally + get schema ───────────────────────────────────
    from app.cache import get_local_parquet
    from app.engine import execute_sql_from_local

    local_path = None
    try:
        local_path = get_local_parquet(r2_key)
        schema = get_schema_from_local(local_path)
    except Exception as exc:
        logger.error("Schema inference failed: %s", exc)
        schema = {"columns": [], "samples": []}

    # ── Save metadata to Supabase ────────────────────────────────────
    original_format = filename.rsplit(".", 1)[-1].lower() if "." in filename else "csv"
    try:
        db.create_file(
            file_id=file_id,
            user_id=user_id,
            name=filename,
            r2_key=r2_key,
            original_format=original_format,
            row_count=row_count,
            column_count=col_count,
            schema_json=schema,
            size_bytes=len(file_bytes),
        )
    except Exception as exc:
        logger.error("Supabase file record creation failed: %s", exc)
        try:
            storage.delete_object(r2_key)
        except Exception:
            pass
        return _json_response(500, "DB_FAILED", "Failed to save file metadata")

    # ── Build preview ────────────────────────────────────────────────
    try:
        if not local_path:
            local_path = get_local_parquet(r2_key)
        preview = execute_sql_from_local(local_path, "SELECT * FROM data")
    except Exception as exc:
        logger.error("Preview query failed: %s", exc)
        preview = {"columns": [], "preview": [], "total_rows": 0, "total_columns": 0}

    # ── Auto-insights ─────────────────────────────────────────────────
    try:
        insights = generate_insights(local_path) if local_path else None
    except Exception as exc:
        logger.error("Insights generation failed: %s", exc)
        insights = None

    # ── Audit log ────────────────────────────────────────────────────
    try:
        db.create_audit_entry(
            user_id=user_id,
            file_id=file_id,
            action="upload",
            metadata={
                "filename": filename,
                "row_count": row_count,
                "col_count": col_count,
                "size_bytes": len(file_bytes),
                "elapsed_ms": round((perf_counter() - start_time) * 1000, 2),
            },
        )
    except Exception:
        pass  # Non-critical

    usage.record(user_id, uploads=1, rows_processed=row_count)

    elapsed_ms = round((perf_counter() - start_time) * 1000, 2)
    logger.info(
        "Upload complete: file_id=%s rows=%d cols=%d elapsed_ms=%.2f",
        file_id, row_count, col_count, elapsed_ms,
    )

    return {
        "file_id": file_id,
        "schema": schema,
        "preview": {
            "columns": preview["columns"],
            "rows": preview["preview"],
            "total_rows": preview["total_rows"],
            "total_columns": preview["total_columns"],
        },
        "insights": insights,
    }
