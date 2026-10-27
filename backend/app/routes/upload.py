"""POST /upload — CSV/XLSX/JSON/TSV → Parquet → Supabase Storage + metadata."""

from __future__ import annotations

import asyncio
import json
import logging
import tempfile
import uuid
from pathlib import Path
from time import perf_counter

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response

from app.config import EXCEL_MAX_BYTES, MAX_COLUMNS, MAX_EXCEL_MB, MAX_UPLOAD_MB, UPLOAD_MAX_BYTES
from app import cache, db, storage
from app.fetch_url import FetchError, fetch_bytes, normalise_url
from app.engine import (
    UnreadableFileError,
    convert_path_to_parquet,
    convert_to_parquet,
    detect_sheets,
    get_schema_from_local,
    sheet_row_counts,
)
from app.insights import generate_insights
from app.security import (
    FileValidationError,
    validate_file_magic,
    validate_no_macros,
)
from app import events, usage
from app.usage import UsageLimitExceeded

logger = logging.getLogger("sheetsllm.routes.upload")

router = APIRouter()

# Uploads up to this size are converted from memory; larger ones from disk
IN_MEMORY_BYTES = 8 * 1024 * 1024

# Sheets one upload may add as files: enough for a workbook of months,
# few enough that converting them stays inside the upload's time
MAX_SHEETS = 10


_EXCEL = (".xlsx", ".xls", ".xlsm")


def _excel_too_large(filename: str, size: int) -> Response | None:
    """A workbook over the Excel cap, said plainly with the way round it."""
    if not filename.lower().endswith(_EXCEL) or size <= EXCEL_MAX_BYTES:
        return None
    return _json_response(
        413, "EXCEL_TOO_LARGE",
        f"This workbook is {size / (1024 * 1024):.1f} MB. An Excel file can be up to {MAX_EXCEL_MB} MB, "
        f"because a workbook takes far more memory and time to read than a CSV. Save the sheet as CSV and upload that: "
        f"a CSV can be up to {MAX_UPLOAD_MB} MB.",
        max_mb=MAX_EXCEL_MB,
    )


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
    sheet_names: list[str] | None = Query(None),
    pending_id: str | None = Query(None),
    source: str | None = Query(None),
):
    request_id = getattr(request.state, "request_id", "unknown")
    user_id = getattr(request.state, "user_id", "anonymous")
    file_id = str(uuid.uuid4())
    # The browser sends the name URL-encoded (a header carries ASCII only)
    from urllib.parse import unquote

    filename = unquote(x_filename or "upload.csv").strip().replace("/", "_").replace("\\", "_")[:200] or "upload.csv"
    start_time = perf_counter()

    # ── Monthly usage cap ────────────────────────────────────────────
    try:
        usage.enforce(user_id, "uploads")
    except UsageLimitExceeded as exc:
        events.record(user_id, "paywall_hit", action="uploads", used=exc.used, limit=exc.limit)
        events.record(user_id, "usage_cap_hit", meter="uploads")
        return _json_response(429, "USAGE_LIMIT_EXCEEDED", str(exc), **usage.limit_payload(exc))

    if pending_id is not None:
        # ── Redeem a stashed multi-sheet upload (no re-POST of bytes) ─
        pending = cache.get_pending_upload(pending_id, user_id)
        if pending is None:
            return _json_response(
                410, "PENDING_UPLOAD_EXPIRED",
                "The uploaded file is no longer cached. Please upload it again.",
            )
        file_bytes, filename = pending
        # Reuse the provisional id: no record was created under it, the
        # stash key is server-issued, and it keeps redeem idempotent.
        file_id = pending_id
    else:
        # ── Stream upload with size check ─────────────────────────────
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > UPLOAD_MAX_BYTES:
                    return _json_response(
                        413, "UPLOAD_TOO_LARGE", f"Max upload size is {MAX_UPLOAD_MB} MB"
                    )
                if (too_large := _excel_too_large(filename, int(content_length))) is not None:
                    return too_large
            except ValueError:
                pass

        # The body goes to disk as it arrives, never whole into memory: a
        # large CSV is then converted from the file (engine.convert_path_to_parquet)
        spool = tempfile.NamedTemporaryFile(delete=False, suffix=".upload")
        bytes_seen = 0
        try:
            async for chunk in request.stream():
                if not chunk:
                    continue
                bytes_seen += len(chunk)
                if bytes_seen > UPLOAD_MAX_BYTES:
                    spool.close()
                    return _json_response(
                        413, "UPLOAD_TOO_LARGE", f"Max upload size is {MAX_UPLOAD_MB} MB"
                    )
                if (too_large := _excel_too_large(filename, bytes_seen)) is not None:
                    spool.close()
                    return too_large
                spool.write(chunk)
            spool.close()
            if not bytes_seen:
                return _json_response(400, "EMPTY_FILE", "No file data received")
            if bytes_seen <= IN_MEMORY_BYTES or filename.lower().endswith(_EXCEL):
                # Small files, and workbooks (the sheet question and the
                # macro check read them whole), go through as bytes
                file_bytes = Path(spool.name).read_bytes()
                return await _ingest(
                    user_id=user_id, file_id=file_id, filename=filename, file_bytes=file_bytes,
                    sheet_name=sheet_name, sheet_names=sheet_names, pending_id=pending_id, source=source,
                    start_time=start_time,
                )
            with open(spool.name, "rb") as fh:
                head = fh.read(64 * 1024)
            return await _ingest(
                user_id=user_id, file_id=file_id, filename=filename, file_bytes=head,
                sheet_name=sheet_name, sheet_names=sheet_names, pending_id=pending_id, source=source,
                start_time=start_time, file_path=spool.name, file_size=bytes_seen,
            )
        finally:
            spool.close()
            Path(spool.name).unlink(missing_ok=True)

    return await _ingest(
        user_id=user_id, file_id=file_id, filename=filename, file_bytes=file_bytes,
        sheet_name=sheet_name, sheet_names=sheet_names, pending_id=pending_id, source=source,
        start_time=start_time,
    )


async def _ingest(
    *, user_id: str, file_id: str, filename: str, file_bytes: bytes,
    sheet_name: str | None, pending_id: str | None, source: str | None, start_time: float,
    source_url: str | None = None, sheet_names: list[str] | None = None,
    file_path: str | None = None, file_size: int | None = None,
):
    """Everything after the bytes are in hand: checks, the sheet question,
    Parquet, storage, the record, the preview and the insights. Shared by a
    dropped file and a fetched link."""
    # A workbook from a link, or stashed for its sheets, meets the cap here
    if (too_large := _excel_too_large(filename, len(file_bytes))) is not None:
        return too_large

    # ── Security validation ────────────────────────────────────────────
    try:
        validate_file_magic(file_bytes, filename)
        validate_no_macros(file_bytes, filename)
    except FileValidationError as exc:
        logger.warning("File validation failed: %s", exc)
        return _json_response(400, "INVALID_FILE", str(exc))

    # ── Multi-sheet XLSX detection ───────────────────────────────────
    picked = _picked_sheets(sheet_names, sheet_name)
    if not picked:
        sheets = detect_sheets(file_bytes, filename)
        if sheets:
            # Stash the bytes so the sheet pick doesn't re-POST the file
            await asyncio.to_thread(
                cache.stash_pending_upload, file_id, user_id, filename, file_bytes
            )
            return {
                "requires_sheet_selection": True,
                "sheets": sheets,
                "sheet_rows": await asyncio.to_thread(sheet_row_counts, file_bytes, filename),
                "max_sheets": MAX_SHEETS,
                "file_id": file_id,
                "name": filename,
            }
    elif len(picked) > 1:
        return await _ingest_sheets(
            user_id=user_id, filename=filename, file_bytes=file_bytes, picked=picked,
            pending_id=pending_id, source=source, start_time=start_time, source_url=source_url,
        )
    else:
        sheet_name = picked[0]

    stored = await _store(
        user_id=user_id, file_id=file_id, filename=filename, file_bytes=file_bytes,
        sheet_name=sheet_name, source_url=source_url, file_path=file_path, file_size=file_size,
    )
    if isinstance(stored, Response):
        return stored
    name, r2_key, row_count, col_count, schema, local_path, size_bytes = (
        stored["name"], stored["r2_key"], stored["row_count"], stored["col_count"],
        stored["schema"], stored["local_path"], stored["size_bytes"],
    )
    from app.cache import get_local_parquet
    from app.engine import execute_sql_from_local

    # ── Build preview ────────────────────────────────────────────────
    try:
        if not local_path:
            local_path = await asyncio.to_thread(get_local_parquet, r2_key)
        preview = await asyncio.to_thread(execute_sql_from_local, local_path, "SELECT * FROM data")
    except Exception as exc:
        logger.error("Preview query failed: %s", exc)
        preview = {"columns": [], "preview": [], "total_rows": 0, "total_columns": 0}

    # ── Auto-insights ─────────────────────────────────────────────────
    try:
        insights = (await asyncio.to_thread(generate_insights, local_path)) if local_path else None
    except Exception as exc:
        logger.error("Insights generation failed: %s", exc)
        insights = None

    _audit(user_id, file_id, name, row_count, col_count, size_bytes, start_time)

    # The stashed original (if any) has served its purpose
    if pending_id is not None:
        cache.discard_pending_upload(pending_id)

    usage.record(user_id, uploads=1, rows_processed=row_count)

    elapsed_ms = round((perf_counter() - start_time) * 1000, 2)
    logger.info(
        "Upload complete: file_id=%s rows=%d cols=%d elapsed_ms=%.2f",
        file_id, row_count, col_count, elapsed_ms,
    )

    events.record(
        user_id, "upload_completed", rows=preview["total_rows"], columns=preview["total_columns"],
        file_id=file_id, sample=source == "sample", **({"via": "url"} if source == "url" else {}),
    )
    return {
        "file_id": file_id,
        "name": name,
        "schema": schema,
        "preview": {
            "columns": preview["columns"],
            "rows": preview["preview"],
            "total_rows": preview["total_rows"],
            "total_columns": preview["total_columns"],
        },
        "insights": insights,
    }


def _picked_sheets(sheet_names: list[str] | None, sheet_name: str | None) -> list[str]:
    """The sheets asked for, once each, in the order given."""
    names = list(sheet_names or []) + ([sheet_name] if sheet_name else [])
    seen: list[str] = []
    for n in names:
        if isinstance(n, str) and n and n not in seen:
            seen.append(n)
    return seen


def sheet_file_name(filename: str, sheet: str) -> str:
    """'sales_q3.xlsx' and 'January' make 'sales_q3 - January.xlsx': the
    workbook it came from, the sheet it is, and the format it arrived in."""
    stem, dot, ext = filename.rpartition(".")
    if not dot:
        stem, ext = filename, ""
    sheet = " ".join(sheet.split())[:80] or "Sheet"
    return f"{stem} - {sheet}{'.' + ext if ext else ''}"


def _audit(user_id: str, file_id: str, name: str, rows: int, cols: int, size_bytes: int, start_time: float) -> None:
    try:
        db.create_audit_entry(
            user_id=user_id,
            file_id=file_id,
            action="upload",
            metadata={
                "filename": name,
                "row_count": rows,
                "col_count": cols,
                "size_bytes": size_bytes,
                "elapsed_ms": round((perf_counter() - start_time) * 1000, 2),
            },
        )
    except Exception:
        pass  # Non-critical


async def _ingest_sheets(
    *, user_id: str, filename: str, file_bytes: bytes, picked: list[str],
    pending_id: str | None, source: str | None, start_time: float, source_url: str | None,
):
    """Several sheets of one workbook, each saved as a file of its own. The
    workbook is one upload, however many sheets come out of it; a sheet that
    will not read is reported and the rest are kept."""
    sheets = await asyncio.to_thread(detect_sheets, file_bytes, filename)
    if not sheets:
        return _json_response(400, "NOT_A_WORKBOOK", "Only a workbook with several sheets can add more than one.")
    unknown = [s for s in picked if s not in sheets]
    if unknown:
        return _json_response(400, "UNKNOWN_SHEET", f"This workbook has no sheet named {unknown[0]!r}.")
    if len(picked) > MAX_SHEETS:
        return _json_response(400, "TOO_MANY_SHEETS", f"Add up to {MAX_SHEETS} sheets at a time.")

    files: list[dict] = []
    failed: list[dict] = []
    first_error: Response | None = None
    for sheet in picked:
        file_id = str(uuid.uuid4())
        stored = await _store(
            user_id=user_id, file_id=file_id, filename=filename, file_bytes=file_bytes,
            sheet_name=sheet, source_url=source_url,
        )
        if isinstance(stored, Response):
            first_error = first_error or stored
            try:
                message = json.loads(stored.body).get("message", "It didn't read.")
            except Exception:
                message = "It didn't read."
            failed.append({"sheet": sheet, "message": message})
            continue
        _audit(user_id, file_id, stored["name"], stored["row_count"], stored["col_count"], stored["size_bytes"], start_time)
        events.record(
            user_id, "upload_completed", rows=stored["row_count"], columns=stored["col_count"],
            file_id=file_id, sample=source == "sample", sheets=len(picked),
            **({"via": "url"} if source == "url" else {}),
        )
        files.append({
            "file_id": file_id, "name": stored["name"], "sheet": sheet,
            "rows": stored["row_count"], "columns": stored["col_count"], "size_bytes": stored["size_bytes"],
        })

    if not files:
        return first_error
    if pending_id is not None:
        cache.discard_pending_upload(pending_id)
    usage.record(user_id, uploads=1, rows_processed=sum(f["rows"] for f in files))
    logger.info("Workbook upload: %d of %d sheets saved", len(files), len(picked))
    return {"workbook": filename, "files": files, "failed": failed}


async def _store(
    *, user_id: str, file_id: str, filename: str, file_bytes: bytes,
    sheet_name: str | None, source_url: str | None,
    file_path: str | None = None, file_size: int | None = None,
) -> dict | Response:
    """One table to Parquet, into storage, with its record. A sheet of a
    workbook is named for the sheet and sized as what is kept of it."""
    # ── Convert to Parquet ───────────────────────────────────────────
    try:
        if file_path:
            parquet_bytes, row_count, col_count = await asyncio.to_thread(
                convert_path_to_parquet, file_path, filename, sheet_name=sheet_name
            )
        else:
            parquet_bytes, row_count, col_count = await asyncio.to_thread(
                convert_to_parquet, file_bytes, filename, sheet_name=sheet_name
            )
    except UnreadableFileError as exc:
        # str(exc) is written for humans; the underlying parser error is
        # chained onto it and already logged by the engine.
        return _json_response(400, "CONVERSION_FAILED", str(exc))
    except Exception as exc:
        # Never forward raw parser errors (DuckDB sniffer failures are a
        # wall of text); log the detail, return something actionable.
        logger.error("Parquet conversion failed for %s: %s", filename, exc)
        return _json_response(
            400,
            "CONVERSION_FAILED",
            "We couldn't read this file. Check that it's a valid CSV, XLSX, "
            "JSON, TSV, or Parquet file and try again.",
        )

    if col_count > MAX_COLUMNS:
        return _json_response(
            400,
            "TOO_MANY_COLUMNS",
            f"File has {col_count} columns (max {MAX_COLUMNS})",
        )

    # The row cap is enforced inside convert_to_parquet, which refuses an
    # over-limit file (TooManyRowsError, an UnreadableFileError) above.

    # ── Upload to Storage ────────────────────────────────────────────
    r2_key = storage.r2_key_for_file(user_id, file_id)
    try:
        await asyncio.to_thread(storage.upload_parquet, r2_key, parquet_bytes)
    except Exception as exc:
        logger.error("Storage upload failed: %s", exc)
        return _json_response(500, "STORAGE_FAILED", "Failed to store file")

    # ── Cache locally + get schema ───────────────────────────────────
    from app.cache import get_local_parquet

    local_path = None
    try:
        local_path = await asyncio.to_thread(get_local_parquet, r2_key)
        schema = await asyncio.to_thread(get_schema_from_local, local_path)
    except Exception as exc:
        logger.error("Schema inference failed: %s", exc)
        schema = {"columns": [], "samples": []}

    # ── Save metadata to Supabase ────────────────────────────────────
    original_format = filename.rsplit(".", 1)[-1].lower() if "." in filename else "csv"
    name = sheet_file_name(filename, sheet_name) if sheet_name else filename
    # A sheet is the part of the workbook that was kept, so its size is
    # what is stored; a whole file keeps the size it arrived at
    size_bytes = len(parquet_bytes) if sheet_name else (file_size if file_size is not None else len(file_bytes))
    try:
        db.create_file(
            file_id=file_id,
            user_id=user_id,
            name=name,
            r2_key=r2_key,
            original_format=original_format,
            row_count=row_count,
            column_count=col_count,
            schema_json=schema,
            size_bytes=size_bytes,
            source_url=source_url,
        )
    except Exception as exc:
        logger.error("Supabase file record creation failed: %s", exc)
        try:
            storage.delete_object(r2_key)
        except Exception:
            pass
        return _json_response(500, "DB_FAILED", "Failed to save file metadata")

    return {
        "name": name, "r2_key": r2_key, "row_count": row_count, "col_count": col_count,
        "schema": schema, "local_path": local_path, "size_bytes": size_bytes,
    }


@router.post("/upload/url")
async def upload_from_url(request: Request):
    """A file from a link: a CSV on a server, a shared export, or a Google
    Sheet shared with anyone who has the link. Fetched by the server with
    the care in app/fetch_url.py, then ingested exactly as a dropped file."""
    user_id = getattr(request.state, "user_id", "anonymous")
    start_time = perf_counter()
    try:
        usage.enforce(user_id, "uploads")
    except UsageLimitExceeded as exc:
        events.record(user_id, "paywall_hit", action="uploads", used=exc.used, limit=exc.limit)
        events.record(user_id, "usage_cap_hit", meter="uploads")
        return _json_response(429, "USAGE_LIMIT_EXCEEDED", str(exc), **usage.limit_payload(exc))
    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")
    if not isinstance(body, dict) or not isinstance(body.get("url"), str):
        return _json_response(400, "BAD_URL", "Paste a link to a file.")
    sheet_name = body.get("sheet_name") if isinstance(body.get("sheet_name"), str) else None
    sheet_names = [n for n in body.get("sheet_names") or [] if isinstance(n, str)] if isinstance(body.get("sheet_names"), list) else None
    try:
        url = normalise_url(body["url"])
        file_bytes, filename = await asyncio.to_thread(fetch_bytes, url)
    except FetchError as exc:
        return _json_response(400, exc.code, str(exc))
    return await _ingest(
        user_id=user_id, file_id=str(uuid.uuid4()), filename=filename, file_bytes=file_bytes,
        sheet_name=sheet_name, sheet_names=sheet_names, pending_id=None, source="url",
        start_time=start_time, source_url=url,
    )
