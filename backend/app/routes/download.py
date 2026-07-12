"""GET /download — Replay all steps and stream the result in the requested format.

CSV/TSV/JSON/Parquet are exported via DuckDB COPY TO a temp file and
streamed from disk — the result never materializes in Python memory.
XLSX has no COPY writer, so it stays on the pandas/openpyxl path behind
Excel's own row limit.
"""

from __future__ import annotations

import io
import json
import logging
import os
import tempfile

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app import db
from app.cache import get_local_parquet
from app.engine import (
    QueryTimeoutError,
    execute_full_result_local,
    export_full_result_local,
)
from app.security import RateLimitExceeded, check_rate_limit

logger = logging.getLogger("sheetsllm.routes.download")

router = APIRouter()

# Downloads are the heaviest endpoint — give them their own, tighter
# rate-limit bucket so they can't be used to hammer the instance (and
# don't eat the shared transform/chat quota).
_DOWNLOAD_RATE_MAX = 10
_DOWNLOAD_RATE_WINDOW = 60

# XLSX is the one format that still materializes in Python (pandas +
# openpyxl — there's no COPY writer). openpyxl writes ~10k rows/s, so
# anything near Excel's 1,048,576-row sheet limit would blow both the
# 60s route timeout and instance memory. Cap where it reliably works.
_XLSX_MAX_ROWS = 250_000

_STREAMED_FORMATS = {
    "csv": ("text/csv", "csv"),
    "tsv": ("text/tab-separated-values", "tsv"),
    "json": ("application/json", "json"),
    "parquet": ("application/octet-stream", "parquet"),
}

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


def _audit(user_id: str, file_id: str, fmt: str, size_bytes: int) -> None:
    try:
        db.create_audit_entry(
            user_id=user_id,
            file_id=file_id,
            action="download",
            metadata={"format": fmt, "size_bytes": size_bytes},
        )
    except Exception:
        pass


def _cleanup(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass


@router.get("/download")
def download(
    request: Request,
    file_id: str = Query(...),
    format: str = Query("csv"),
):
    user_id = getattr(request.state, "user_id", "anonymous")

    fmt = format.lower().strip()
    if fmt != "xlsx" and fmt not in _STREAMED_FORMATS:
        return _json_response(400, "INVALID_FORMAT", f"Unsupported format: {fmt}")

    # ── Rate limiting (separate bucket from transform/chat) ────────────
    try:
        check_rate_limit(
            f"{user_id}:download",
            max_requests=_DOWNLOAD_RATE_MAX,
            window=_DOWNLOAD_RATE_WINDOW,
        )
    except RateLimitExceeded as exc:
        return _json_response(
            429, "RATE_LIMITED",
            f"Too many downloads. Retry after {exc.retry_after:.0f}s",
        )

    # ── Verify file ownership ──────────────────────────────────────────
    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    r2_key = file_rec["r2_key"]
    base_name = file_rec.get("name", "data").rsplit(".", 1)[0]

    steps = db.get_transformations(file_id)

    # ── XLSX: pandas path (no COPY writer), guarded by Excel's limit ──
    if fmt == "xlsx":
        row_count = file_rec.get("row_count") or 0
        if row_count > _XLSX_MAX_ROWS:
            return _json_response(
                400, "TOO_MANY_ROWS_FOR_XLSX",
                f"This file has {row_count:,} rows — Excel export supports up "
                f"to {_XLSX_MAX_ROWS:,}. Download as CSV or Parquet instead.",
            )
        try:
            local_path = get_local_parquet(r2_key)
            df = execute_full_result_local(local_path, steps).fetchdf()
            buf = io.BytesIO()
            df.to_excel(buf, index=False, engine="openpyxl")
            content = buf.getvalue()
        except QueryTimeoutError as exc:
            return _json_response(504, "QUERY_TIMEOUT", str(exc))
        except Exception as exc:
            logger.error("XLSX export failed for file_id=%s: %s", file_id, exc)
            return _json_response(
                500, "EXPORT_FAILED",
                "Preparing the download failed. Please try again.",
            )

        _audit(user_id, file_id, fmt, len(content))
        return Response(
            content=content,
            media_type=XLSX_MIME,
            headers={
                "Content-Disposition": f'attachment; filename="{base_name}.xlsx"'
            },
        )

    # ── Streamed formats: DuckDB COPY TO temp file, serve from disk ───
    media_type, ext = _STREAMED_FORMATS[fmt]
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
    tmp.close()
    try:
        local_path = get_local_parquet(r2_key)
        export_full_result_local(local_path, steps, fmt, tmp.name)
    except QueryTimeoutError as exc:
        _cleanup(tmp.name)
        return _json_response(504, "QUERY_TIMEOUT", str(exc))
    except Exception as exc:
        _cleanup(tmp.name)
        logger.error("Export failed for file_id=%s fmt=%s: %s", file_id, fmt, exc)
        return _json_response(
            500, "EXPORT_FAILED",
            "Preparing the download failed. Please try again.",
        )

    _audit(user_id, file_id, fmt, os.path.getsize(tmp.name))
    return FileResponse(
        tmp.name,
        media_type=media_type,
        filename=f"{base_name}.{ext}",
        background=BackgroundTask(_cleanup, tmp.name),
    )
