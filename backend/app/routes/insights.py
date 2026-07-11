"""GET /insights/{file_id} — Auto-generated data insights."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Request, Response

from app import db
from app.cache import get_local_parquet
from app.engine import replay_transformations_local
from app.insights import generate_insights

logger = logging.getLogger("sheetsllm.routes.insights")

router = APIRouter()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


@router.get("/insights/{file_id}")
async def get_insights(file_id: str, request: Request):
    """Get auto-generated insights for a file."""
    user_id = getattr(request.state, "user_id", "anonymous")

    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    r2_key = file_rec["r2_key"]

    try:
        local_path = get_local_parquet(r2_key)

        # If there are transformations, generate insights on transformed data
        steps = db.get_transformations(file_id)
        if steps:
            # Write transformed data to a temp file for insights
            import tempfile
            from pathlib import Path

            import pyarrow.parquet as pq

            from app.engine import execute_full_result_local

            result_con = execute_full_result_local(local_path, steps)
            arrow = result_con.fetch_arrow_table()
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".parquet")
            pq.write_table(arrow, tmp.name)
            tmp.close()
            try:
                insights = generate_insights(tmp.name)
            finally:
                Path(tmp.name).unlink(missing_ok=True)
        else:
            insights = generate_insights(local_path)
    except Exception as exc:
        logger.error("Insights failed: %s", exc)
        return _json_response(500, "INSIGHTS_FAILED", f"Failed to generate insights: {exc}")

    return {"file_id": file_id, "insights": insights}
