"""POST /transform — LLM-generated SQL transformation pipeline.

Integrates:
- LLM response cache (same instruction + schema → cached SQL)
- Local Parquet file cache (faster DuckDB reads)
- Async job pipeline (background tasks for large files)
- Clarification flow (LLM returns question when ambiguous)
- Error recovery (retry once with DuckDB error context)
"""

from __future__ import annotations

import asyncio
import json
import logging
from time import perf_counter

from fastapi import APIRouter, BackgroundTasks, Request, Response

from app import db, jobs
from app.cache import (
    get_cached_sql,
    get_local_parquet,
    schema_fingerprint,
    set_cached_sql,
    sql_cache_key,
)
from app.config import MAX_INSTRUCTION_LENGTH
from app.engine import (
    get_schema_after_steps,
    replay_transformations_local,
)
from app.llm.errors import is_quota_error
from app.llm.factory import get_llm
from app.llm.prompts import (
    SYSTEM_PROMPT,
    build_retry_message,
    build_user_message,
    sent_receipt,
    sanitize_error_for_llm,
)
from app.security import RateLimitExceeded, check_rate_limit
from app.sql_validator import SQLValidationError, validate_sql
from app.ops import OpError, build_op
from app import events, usage
from app.usage import UsageLimitExceeded

logger = logging.getLogger("sheetsllm.routes.transform")

router = APIRouter()

# Files above this row count are processed asynchronously
_ASYNC_THRESHOLD = 100_000


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


def _is_clarification(raw: str) -> dict | None:
    """Check if the LLM returned a clarification JSON instead of SQL."""
    stripped = raw.strip()
    if stripped.startswith("{") and "needs_clarification" in stripped:
        try:
            parsed = json.loads(stripped)
            if parsed.get("needs_clarification"):
                return parsed
        except json.JSONDecodeError:
            pass
    return None


def _generate_or_cache_sql(
    user_id: str, instruction: str, schema: dict, *, privacy_mode: bool = False,
    meta: dict | None = None,
) -> str | dict:
    """
    Get SQL from cache or generate via LLM.
    Returns SQL string on success, or clarification dict if LLM needs more info.
    `meta`, when given, gets {"cache": True} on a cache hit (nothing was sent).
    """
    s_hash = schema_fingerprint(schema)
    cache_key = sql_cache_key(user_id, instruction, s_hash)

    cached = get_cached_sql(cache_key)
    if cached is not None:
        logger.info("LLM cache HIT for key=%s", cache_key[:12])
        if meta is not None:
            meta["cache"] = True
        return cached

    user_message = build_user_message(instruction, schema, privacy_mode=privacy_mode)
    llm = get_llm()
    raw_sql = llm.generate_sql(SYSTEM_PROMPT, user_message)

    # Check for clarification response
    clarification = _is_clarification(raw_sql)
    if clarification is not None:
        return clarification

    sql = validate_sql(raw_sql)

    set_cached_sql(cache_key, sql)
    logger.info("LLM cache MISS — generated and cached key=%s", cache_key[:12])
    return sql


def _get_current_schema(r2_key: str, steps: list[dict]) -> dict:
    """Get the schema (real dtypes + samples) reflecting all existing steps."""
    local_path = get_local_parquet(r2_key)
    return get_schema_after_steps(local_path, steps)


def _execute_transform(r2_key: str, steps: list[dict], sql: str) -> dict:
    """Replay existing steps + new step, return preview dict."""
    local_path = get_local_parquet(r2_key)
    new_steps = steps + [{"step_number": len(steps) + 1, "sql_query": sql}]
    return replay_transformations_local(local_path, new_steps)


def _execute_with_retry(
    r2_key: str, steps: list[dict], sql: str, instruction: str, schema: dict,
    *, privacy_mode: bool = False,
) -> tuple[dict, str]:
    """
    Execute the SQL. On failure, ask the LLM to fix it and retry once.
    Returns (result_dict, final_sql).
    """
    try:
        result = _execute_transform(r2_key, steps, sql)
        return result, sql
    except Exception as exc:
        # Bind to an outer name: Python unbinds `except ... as` variables
        # when the block exits, and the retry below needs the error text.
        first_error = exc
        logger.warning("First execution failed, attempting retry: %s", first_error)

    # ── Retry: send error back to LLM ──────────────────────────────
    try:
        safe_error = sanitize_error_for_llm(str(first_error), privacy_mode=privacy_mode)
        retry_message = build_retry_message(instruction, sql, safe_error)
        llm = get_llm()
        raw_retry = llm.generate_sql(SYSTEM_PROMPT, retry_message)
        fixed_sql = validate_sql(raw_retry)
        result = _execute_transform(r2_key, steps, fixed_sql)
        logger.info("Retry succeeded with corrected SQL")
        return result, fixed_sql
    except Exception as retry_error:
        logger.error("Retry also failed: %s", retry_error)
        # Surface the most recent error (the corrected SQL's failure) —
        # chaining keeps the original as __cause__ for logs/debugging.
        raise retry_error from first_error


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


def _run_transform_job(
    job_id: str,
    file_id: str,
    user_id: str,
    r2_key: str,
    steps: list[dict],
    instruction: str,
    sql: str,
    schema: dict,
    start_time: float,
    privacy_mode: bool = False,
    sent: dict | None = None,
) -> None:
    """Background task for large-file transforms."""
    try:
        jobs.update_job(job_id, progress=30)
        result, final_sql = _execute_with_retry(
            r2_key, steps, sql, instruction, schema, privacy_mode=privacy_mode
        )

        jobs.update_job(job_id, progress=70)
        step_number = _save_transform(
            file_id, user_id, instruction, final_sql, result, start_time, sent=sent,
        )

        jobs.complete_job(job_id, {
            "file_id": file_id,
            "step_number": step_number,
            "instruction": instruction,
            "sql": final_sql,
            "preview": {
                "columns": result["columns"],
                "rows": result["preview"],
                "total_rows": result["total_rows"],
                "total_columns": result["total_columns"],
            },
        })
        usage.record(user_id, transforms=1, rows_processed=result["total_rows"])
    except Exception as exc:
        logger.error("Background transform failed: %s", exc)
        jobs.fail_job(job_id, str(exc))


@router.post("/transform")
async def transform(request: Request, background_tasks: BackgroundTasks):
    user_id = getattr(request.state, "user_id", "anonymous")
    start_time = perf_counter()

    # ── Rate limiting ──────────────────────────────────────────────────
    try:
        check_rate_limit(user_id)
    except RateLimitExceeded as exc:
        return _json_response(
            429, "RATE_LIMITED",
            f"Too many requests. Retry after {exc.retry_after:.0f}s",
        )

    # ── Monthly usage cap ──────────────────────────────────────────────
    try:
        usage.enforce(user_id, "transforms")
    except UsageLimitExceeded as exc:
        events.record(user_id, "paywall_hit", action="transforms", used=exc.used, limit=exc.limit)
        events.record(user_id, "usage_cap_hit", meter="transforms")
        return _json_response(429, "USAGE_LIMIT_EXCEEDED", str(exc), **usage.limit_payload(exc))

    # ── Parse body ─────────────────────────────────────────────────────
    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")

    file_id = body.get("file_id")
    instruction = (body.get("instruction") or "").strip()

    if not file_id:
        return _json_response(400, "MISSING_FILE_ID", "file_id is required")
    if not instruction:
        return _json_response(400, "MISSING_INSTRUCTION", "instruction is required")
    if len(instruction) > MAX_INSTRUCTION_LENGTH:
        return _json_response(
            400, "INSTRUCTION_TOO_LONG",
            f"Instruction exceeds {MAX_INSTRUCTION_LENGTH} characters",
        )

    # ── Verify file ownership ──────────────────────────────────────────
    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    r2_key = file_rec["r2_key"]
    row_count = file_rec.get("row_count", 0)

    # ── Get current schema ─────────────────────────────────────────────
    steps = db.get_transformations(file_id)
    try:
        schema = await asyncio.to_thread(_get_current_schema, r2_key, steps)
    except Exception as exc:
        logger.error("Schema retrieval failed: %s", exc)
        return _json_response(500, "SCHEMA_FAILED", f"Schema retrieval failed: {exc}")

    # ── Generate / cache SQL ───────────────────────────────────────────
    privacy_mode = db.get_privacy_mode(user_id)
    gen_meta: dict = {}
    try:
        sql_or_clarification = await asyncio.to_thread(
            _generate_or_cache_sql, user_id, instruction, schema,
            privacy_mode=privacy_mode, meta=gen_meta,
        )
    except SQLValidationError as exc:
        return _json_response(
            400, "INVALID_SQL", f"Generated SQL failed validation: {exc}",
        )
    except Exception as exc:
        logger.error("LLM generation failed: %s", exc)
        if is_quota_error(exc):
            events.record(user_id, "llm_quota_hit")
            return _json_response(
                503, "LLM_QUOTA",
                "Chef is out of AI capacity for today. Your recipes and one-click fixes still work.",
            )
        return _json_response(502, "LLM_FAILED", f"LLM error: {exc}")

    # ── Handle clarification ───────────────────────────────────────────
    if isinstance(sql_or_clarification, dict):
        return {
            "needs_clarification": True,
            "question": sql_or_clarification.get("question", ""),
            "suggestions": sql_or_clarification.get("suggestions", []),
        }

    sql = sql_or_clarification
    # A cache hit sent nothing; otherwise record what the prompt carried
    sent = (
        {"source": "cache"} if gen_meta.get("cache")
        else sent_receipt(schema, privacy_mode=privacy_mode)
    )

    # ── Async for large files ──────────────────────────────────────────
    if row_count > _ASYNC_THRESHOLD:
        # create_job write-throughs to Supabase — keep it off the event loop
        job_id = await asyncio.to_thread(
            jobs.create_job,
            user_id, "transform",
            metadata={"file_id": file_id, "instruction": instruction},
        )
        background_tasks.add_task(
            _run_transform_job,
            job_id, file_id, user_id, r2_key, steps,
            instruction, sql, schema, start_time, privacy_mode, sent,
        )
        return {"job_id": job_id, "status": "processing"}

    # ── Sync execution with retry ──────────────────────────────────────
    try:
        result, final_sql = await asyncio.to_thread(
            _execute_with_retry,
            r2_key, steps, sql, instruction, schema, privacy_mode=privacy_mode,
        )
    except Exception as exc:
        logger.error("SQL execution failed: %s | sql=%s", exc, sql)
        return _json_response(
            400, "EXECUTION_FAILED", f"SQL execution failed: {exc}", sql=sql,
        )

    # ── Empty result warning ───────────────────────────────────────────
    if result["total_rows"] == 0:
        logger.warning("Transform returned 0 rows for file_id=%s", file_id)

    try:
        step_number = _save_transform(
            file_id, user_id, instruction, final_sql, result, start_time, sent=sent,
        )
    except Exception as exc:
        logger.error("Failed to save transformation: %s", exc)
        return _json_response(500, "DB_FAILED", "Failed to save transformation")

    usage.record(user_id, transforms=1, rows_processed=result["total_rows"])

    elapsed_ms = round((perf_counter() - start_time) * 1000, 2)
    logger.info(
        "Transform complete: file_id=%s step=%d elapsed_ms=%.2f",
        file_id, step_number, elapsed_ms,
    )

    response: dict = {
        "file_id": file_id,
        "step_number": step_number,
        "instruction": instruction,
        "sql": final_sql,
        "sent": sent,
        "preview": {
            "columns": result["columns"],
            "rows": result["preview"],
            "total_rows": result["total_rows"],
            "total_columns": result["total_columns"],
        },
    }

    if result["total_rows"] == 0:
        response["warning"] = "This transformation returned 0 rows. You may want to undo."

    return response


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

    return {
        "type": "transform",
        "source": "op",
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
