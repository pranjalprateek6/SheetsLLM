"""GET /download — Replay all steps and stream result as CSV."""

from __future__ import annotations

import io
import json
import logging

from fastapi import APIRouter, Query, Request, Response

from app import db
from app.cache import get_local_parquet
from app.engine import execute_full_result_local

logger = logging.getLogger("sheetsllm.routes.download")

router = APIRouter()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


@router.get("/download")
async def download(
    request: Request,
    file_id: str = Query(...),
    format: str = Query("csv"),
):
    user_id = getattr(request.state, "user_id", "anonymous")

    # ── Verify file ownership ──────────────────────────────────────────
    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    r2_key = file_rec["r2_key"]
    base_name = file_rec.get("name", "data").rsplit(".", 1)[0]

    # ── Get steps and replay (using local cache) ─────────────────────
    steps = db.get_transformations(file_id)
    local_path = get_local_parquet(r2_key)
    result_conn = execute_full_result_local(local_path, steps)

    # ── Export to requested format ─────────────────────────────────────
    fmt = format.lower().strip()

    if fmt == "csv":
        df = result_conn.fetchdf()
        buf = io.StringIO()
        df.to_csv(buf, index=False)
        content = buf.getvalue().encode("utf-8")
        media_type = "text/csv"
        ext = "csv"
    elif fmt == "tsv":
        df = result_conn.fetchdf()
        buf = io.StringIO()
        df.to_csv(buf, index=False, sep="\t")
        content = buf.getvalue().encode("utf-8")
        media_type = "text/tab-separated-values"
        ext = "tsv"
    elif fmt == "json":
        df = result_conn.fetchdf()
        content = df.to_json(orient="records").encode("utf-8")
        media_type = "application/json"
        ext = "json"
    elif fmt == "parquet":
        import pyarrow.parquet as pq

        arrow_table = result_conn.fetch_arrow_table()
        buf = io.BytesIO()
        pq.write_table(arrow_table, buf, compression="zstd")
        content = buf.getvalue()
        media_type = "application/octet-stream"
        ext = "parquet"
    else:
        return _json_response(400, "INVALID_FORMAT", f"Unsupported format: {fmt}")

    # ── Audit log ──────────────────────────────────────────────────────
    try:
        db.create_audit_entry(
            user_id=user_id,
            file_id=file_id,
            action="download",
            metadata={"format": fmt, "size_bytes": len(content)},
        )
    except Exception:
        pass

    filename = f"{base_name}.{ext}"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
