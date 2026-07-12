"""POST /chat — Conversational transform with message history.
GET /chat/{file_id} — Retrieve chat history for a file.
DELETE /chat/{file_id} — Clear chat history for a file.
"""
from __future__ import annotations

import asyncio
import json
import logging
from time import perf_counter

from fastapi import APIRouter, Request, Response

from app import db, jobs
from app.cache import (
    get_local_parquet,
    schema_fingerprint,
)
from app.engine import (
    get_schema_after_steps,
    replay_transformations_local,
)
from app.llm.factory import get_llm
from app.llm.prompts import (
    CHAT_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    build_retry_message,
    build_user_message,
    sanitize_error_for_llm,
)
from app.security import RateLimitExceeded, check_rate_limit
from app.sql_validator import SQLValidationError, validate_sql
from app.config import MAX_INSTRUCTION_LENGTH
from app import events, usage
from app.usage import UsageLimitExceeded

logger = logging.getLogger("sheetsllm.routes.chat")

router = APIRouter()


def _json_response(status: int, code: str, message: str, **extra) -> Response:
    payload = {"code": code, "message": message, **extra}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


def _is_clarification(raw: str) -> dict | None:
    stripped = raw.strip()
    if stripped.startswith("{") and "needs_clarification" in stripped:
        try:
            parsed = json.loads(stripped)
            if parsed.get("needs_clarification"):
                return parsed
        except json.JSONDecodeError:
            pass
    return None


def _is_insight_response(raw: str) -> dict | None:
    """Check if the LLM returned a text insight rather than SQL."""
    stripped = raw.strip()
    if stripped.startswith("{") and "insight" in stripped:
        try:
            parsed = json.loads(stripped)
            if parsed.get("insight"):
                return parsed
        except json.JSONDecodeError:
            pass
    return None


@router.get("/chat/{file_id}")
def get_chat_history(file_id: str, request: Request):
    """Retrieve chat messages for a file."""
    user_id = getattr(request.state, "user_id", "anonymous")

    # Verify file ownership
    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    messages = db.get_chat_messages(file_id)
    return {"file_id": file_id, "messages": messages}


@router.delete("/chat/{file_id}")
def clear_chat_history(file_id: str, request: Request):
    """Delete all chat messages for a file."""
    user_id = getattr(request.state, "user_id", "anonymous")

    # Verify file ownership
    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    db.delete_chat_messages(file_id)
    return {"deleted": True}


@router.post("/chat")
async def chat(request: Request):
    """Process a chat message — may generate SQL transform or text insight."""
    user_id = getattr(request.state, "user_id", "anonymous")
    start_time = perf_counter()

    # Rate limiting
    try:
        check_rate_limit(user_id)
    except RateLimitExceeded as exc:
        return _json_response(
            429, "RATE_LIMITED",
            f"Too many requests. Retry after {exc.retry_after:.0f}s",
        )

    # Monthly usage cap
    try:
        usage.enforce(user_id, "chat_requests")
    except UsageLimitExceeded as exc:
        events.record(user_id, "paywall_hit", action="chat_requests", used=exc.used, limit=exc.limit)
        return _json_response(429, "USAGE_LIMIT_EXCEEDED", str(exc))

    # Parse body
    try:
        body = await request.json()
    except Exception:
        return _json_response(400, "INVALID_JSON", "Request body must be JSON")

    file_id = body.get("file_id")
    message = (body.get("message") or "").strip()

    if not file_id:
        return _json_response(400, "MISSING_FILE_ID", "file_id is required")
    if not message:
        return _json_response(400, "MISSING_MESSAGE", "message is required")
    if len(message) > MAX_INSTRUCTION_LENGTH:
        return _json_response(
            400, "MESSAGE_TOO_LONG",
            f"Message exceeds {MAX_INSTRUCTION_LENGTH} characters",
        )

    # Verify file ownership
    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        return _json_response(404, "FILE_NOT_FOUND", "File not found")

    r2_key = file_rec["r2_key"]

    # Save user message
    db.create_chat_message(file_id=file_id, role="user", content=message)

    # Get current schema (real dtypes + samples, reflecting all existing steps)
    steps = db.get_transformations(file_id)
    try:
        local_path = await asyncio.to_thread(get_local_parquet, r2_key)
        schema = await asyncio.to_thread(get_schema_after_steps, local_path, steps)
    except Exception as exc:
        logger.error("Schema retrieval failed: %s", exc)
        return _json_response(500, "SCHEMA_FAILED", f"Schema retrieval failed: {exc}")

    # Build conversation context from last N messages
    recent_messages = db.get_chat_messages(file_id, limit=10)
    conversation_context = _build_conversation_context(recent_messages)

    # Generate response with conversational context
    privacy_mode = db.get_privacy_mode(user_id)
    user_message = build_user_message(
        message, schema, privacy_mode=privacy_mode
    )
    if conversation_context:
        user_message = f"Previous conversation:\n{conversation_context}\n\nNew request:\n{user_message}"

    llm = get_llm()
    try:
        raw = await asyncio.to_thread(llm.generate_sql, CHAT_SYSTEM_PROMPT, user_message)
    except Exception as exc:
        logger.error("LLM generation failed: %s", exc)
        return _json_response(502, "LLM_FAILED", f"LLM error: {exc}")

    # The LLM call is the metered cost, regardless of response type
    usage.record(user_id, chat_requests=1)

    # Check for clarification
    clarification = _is_clarification(raw)
    if clarification is not None:
        assistant_content = clarification.get("question", "Could you clarify?")
        db.create_chat_message(
            file_id=file_id, role="assistant", content=assistant_content,
            message_type="clarification",
            metadata={"suggestions": clarification.get("suggestions", [])},
        )
        return {
            "type": "clarification",
            "message": assistant_content,
            "suggestions": clarification.get("suggestions", []),
        }

    # Check for insight response (non-SQL text answer)
    insight = _is_insight_response(raw)
    if insight is not None:
        assistant_content = insight.get("insight", "")
        db.create_chat_message(
            file_id=file_id, role="assistant", content=assistant_content,
            message_type="insight",
        )
        return {
            "type": "insight",
            "message": assistant_content,
        }

    # It's SQL — validate and execute
    try:
        sql = validate_sql(raw)
    except SQLValidationError as exc:
        return _json_response(
            400, "INVALID_SQL", f"Generated SQL failed validation: {exc}",
        )

    # Execute with retry
    try:
        local_path = await asyncio.to_thread(get_local_parquet, r2_key)
        new_steps = steps + [{"step_number": len(steps) + 1, "sql_query": sql}]
        result = await asyncio.to_thread(replay_transformations_local, local_path, new_steps)
    except Exception as first_error:
        logger.warning("First execution failed, attempting retry: %s", first_error)
        try:
            safe_error = sanitize_error_for_llm(str(first_error), privacy_mode=privacy_mode)
            retry_message = build_retry_message(message, sql, safe_error)
            raw_retry = await asyncio.to_thread(llm.generate_sql, CHAT_SYSTEM_PROMPT, retry_message)
            fixed_sql = validate_sql(raw_retry)
            new_steps = steps + [{"step_number": len(steps) + 1, "sql_query": fixed_sql}]
            result = await asyncio.to_thread(replay_transformations_local, local_path, new_steps)
            sql = fixed_sql
        except Exception as retry_error:
            logger.error("Retry also failed: %s", retry_error)
            error_msg = f"I couldn't execute that transformation: {first_error}"
            db.create_chat_message(
                file_id=file_id, role="assistant", content=error_msg,
                message_type="error",
            )
            return _json_response(
                400, "EXECUTION_FAILED", f"SQL execution failed: {first_error}", sql=sql,
            )

    # Save transformation
    step_number = db.get_next_step_number(file_id)
    db.create_transformation(
        file_id=file_id,
        step_number=step_number,
        instruction=message,
        sql_query=sql,
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

    # Save assistant message
    assistant_content = f"Applied: {message}"
    db.create_chat_message(
        file_id=file_id, role="assistant", content=assistant_content,
        message_type="transform",
        metadata={"sql": sql, "step_number": step_number},
    )

    elapsed_ms = round((perf_counter() - start_time) * 1000, 2)

    return {
        "type": "transform",
        "message": assistant_content,
        "file_id": file_id,
        "step_number": step_number,
        "sql": sql,
        "preview": {
            "columns": result["columns"],
            "rows": result["preview"],
            "total_rows": result["total_rows"],
            "total_columns": result["total_columns"],
        },
    }


def _build_conversation_context(messages: list[dict]) -> str:
    """Build a summary of recent messages for LLM context."""
    if not messages:
        return ""
    lines = []
    for msg in messages[-10:]:  # last 10 messages
        role = msg.get("role", "user")
        content = msg.get("content", "")
        meta = msg.get("metadata") or {}
        if role == "user":
            lines.append(f"User: {content}")
        elif role == "assistant":
            if meta.get("sql"):
                lines.append(f"Assistant: [executed SQL: {meta['sql']}]")
            else:
                lines.append(f"Assistant: {content}")
    return "\n".join(lines)
