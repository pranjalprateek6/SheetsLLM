"""POST /transform/op: a one-click fix, written as a step with no AI call.

AI-written steps come through POST /chat. The older POST /transform, which
asked the model for SQL here, is retired: the app never called it, and it
enforced a monthly "transforms" cap that no plan describes.
"""

from __future__ import annotations

import asyncio
import json
import logging
from time import perf_counter

from fastapi import APIRouter, Request, Response

from app import db, events, usage
from app.cache import get_local_parquet
from app.engine import get_schema_after_steps, replay_transformations_local
from app.insights import sort_warning
from app.ops import OpError, build_op
from app.security import RateLimitExceeded, check_rate_limit
from app.sql_validator import SQLValidationError, validate_sql

logger = logging.getLogger("sheetsllm.routes.transform")

router = APIRouter()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


def _get_current_schema(r2_key: str, steps: list[dict]) -> dict:
    """Get the schema (real dtypes + samples) reflecting all existing steps."""
    local_path = get_local_parquet(r2_key)
    return get_schema_after_steps(local_path, steps)


def _execute_transform(r2_key: str, steps: list[dict], sql: str) -> dict:
    """Replay existing steps + new step, return preview dict."""
    local_path = get_local_parquet(r2_key)
    new_steps = steps + [{"step_number": len(steps) + 1, "sql_query": sql}]
    return replay_transformations_local(local_path, new_steps)


def _save_transform(
    file_id: str,
    user_id: str,
    instruction: str,
    sql: str,
    result: dict,
    start_time: float,
    *,
    explain: str | None = None,
    sent: dict | None = None,
) -> int:
    """Persist transformation step + update file metadata + audit log."""
    step_number = db.get_next_step_number(file_id)
    db.create_transformation(
        file_id=file_id,
        step_number=step_number,
        instruction=instruction,
        sql_query=sql,
        explain=explain,
        sent=sent,
        row_count_after=result["total_rows"],
        column_count_after=result["total_columns"],
        columns_after=result["columns"],
    )
    try:
        db.update_file(
            file_id, user_id,
            row_count=result["total_rows"],
            column_count=result["total_columns"],
        )
    except Exception:
        pass
    try:
        elapsed_ms = round((perf_counter() - start_time) * 1000, 2)
        db.create_audit_entry(
            user_id=user_id, file_id=file_id, action="transform",
            metadata={
                "instruction": instruction, "sql": sql,
                "step_number": step_number, "elapsed_ms": elapsed_ms,
            },
        )
    except Exception:
        pass
    return step_number


# ── POST /transform/op: a fix that needs no AI ───────────────────────


@router.post("/transform/op")
async def transform_op(request: Request):
    """Apply one deterministic operation (app/ops.py) as a step.

    Same validation, replay and history as an AI step, but the SQL comes from
    a server-side template, so there is no LLM call and no AI request is
    metered; the step counts as a transform.
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    start_time = perf_counter()

    try:
        check_rate_limit(user_id)
    except RateLimitExceeded as exc:
        return _json_response(
            429, "RATE_LIMITED", f"Too many requests. Retry after {exc.retry_after:.0f}s",
            retry_after=round(exc.retry_after),
        )

    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")
    if not isinstance(body, dict):
        return _json_response(400, "INVALID_JSON", "Request body must be a JSON object")

    file_id = body.get("file_id")
    op = body.get("op")
    if not file_id or not op:
        return _json_response(400, "MISSING_FIELDS", "file_id and op are required")

    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")
    r2_key = file_rec["r2_key"]

    steps = db.get_transformations(file_id)
    try:
        schema = await asyncio.to_thread(_get_current_schema, r2_key, steps)
    except Exception as exc:
        logger.error("Schema retrieval failed: %s", exc)
        return _json_response(500, "SCHEMA_FAILED", f"Schema retrieval failed: {exc}")

    try:
        sql, instruction = build_op(op, schema.get("columns", []), body.get("column"), body.get("args"))
        sql = validate_sql(sql)
    except OpError as exc:
        return _json_response(400, exc.code, str(exc))
    except SQLValidationError as exc:
        return _json_response(400, "INVALID_SQL", f"Generated SQL failed validation: {exc}")

    try:
        result = await asyncio.to_thread(_execute_transform, r2_key, steps, sql)
    except Exception as exc:
        return _json_response(400, "EXECUTION_FAILED", f"That didn't run on this file: {exc}", sql=sql)

    step_number = _save_transform(
        file_id, user_id, instruction, sql, result, start_time, explain=f"op: {op}",
        sent={"source": "op"},
    )
    usage.record(user_id, transforms=1, rows_processed=result["total_rows"])
    events.record(user_id, "op_applied", op=op)
    if body.get("source") == "insight":
        events.record(user_id, "insight_fix_applied", op=op)

    # A sort of a text column with dates written two ways runs, and comes out
    # in text order; say so, and how to fix it
    warning = None
    if op == "sort" and body.get("column"):
        try:
            local_path = await asyncio.to_thread(get_local_parquet, r2_key)
            warning = await asyncio.to_thread(sort_warning, local_path, steps, body["column"])
        except Exception as exc:
            logger.warning("Sort date check failed for %s: %s", file_id, exc)
        if warning:
            events.record(user_id, "sort_mixed_dates", column_fixable=warning["fix"] is not None)

    return {
        "type": "transform",
        "source": "op",
        "warning": warning,
        "op": op,
        "file_id": file_id,
        "step_number": step_number,
        "instruction": instruction,
        "message": instruction,
        "sql": sql,
        "sent": {"source": "op"},
        "preview": {
            "columns": result["columns"],
            "rows": result["preview"],
            "total_rows": result["total_rows"],
            "total_columns": result["total_columns"],
        },
    }
