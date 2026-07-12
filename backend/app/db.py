"""Supabase client + helper functions for files, transformations, and audit_log."""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from supabase import Client, create_client

from app.config import SUPABASE_SERVICE_KEY, SUPABASE_URL

logger = logging.getLogger("sheetsllm.db")

_client: Client | None = None


def get_client() -> Client:
    """Lazy-initialised Supabase client (service-role key for backend use)."""
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set"
            )
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client


# ── Files ────────────────────────────────────────────────────────────


def create_file(
    *,
    file_id: str,
    user_id: str,
    name: str,
    r2_key: str,
    original_format: str,
    row_count: int,
    column_count: int,
    schema_json: dict,
    size_bytes: int,
) -> dict:
    row = {
        "id": file_id,
        "user_id": user_id,
        "name": name,
        "r2_key": r2_key,
        "original_format": original_format,
        "row_count": row_count,
        "column_count": column_count,
        "schema_json": schema_json,
        "size_bytes": size_bytes,
    }
    resp = get_client().table("files").insert(row).execute()
    return resp.data[0]


def get_file(file_id: str, user_id: str) -> dict | None:
    resp = (
        get_client()
        .table("files")
        .select("*")
        .eq("id", file_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def list_files(
    user_id: str,
    page: int = 1,
    page_size: int = 20,
    q: str | None = None,
    sort: str = "created_at",
    direction: str = "desc",
) -> dict:
    offset = (page - 1) * page_size
    query = (
        get_client()
        .table("files")
        .select("*", count="exact")
        .eq("user_id", user_id)
    )
    if q:
        query = query.ilike("name", f"%{q}%")
    resp = (
        query
        .order(sort, desc=(direction == "desc"))
        .range(offset, offset + page_size - 1)
        .execute()
    )
    return {"items": resp.data, "total": resp.count or 0}


def update_file(file_id: str, user_id: str, **updates: Any) -> dict | None:
    resp = (
        get_client()
        .table("files")
        .update(updates)
        .eq("id", file_id)
        .eq("user_id", user_id)
        .execute()
    )
    return resp.data[0] if resp.data else None


def delete_file(file_id: str, user_id: str) -> bool:
    resp = (
        get_client()
        .table("files")
        .delete()
        .eq("id", file_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(resp.data)


# ── Transformations ──────────────────────────────────────────────────


def create_transformation(
    *,
    file_id: str,
    step_number: int,
    instruction: str,
    sql_query: str,
    explain: str | None = None,
    row_count_after: int | None = None,
    column_count_after: int | None = None,
    columns_after: list[str] | None = None,
) -> dict:
    row = {
        "file_id": file_id,
        "step_number": step_number,
        "instruction": instruction,
        "sql_query": sql_query,
        "explain": explain,
        "row_count_after": row_count_after,
        "column_count_after": column_count_after,
        "columns_after": columns_after,
    }
    resp = get_client().table("transformations").insert(row).execute()
    return resp.data[0]


def get_transformations(file_id: str) -> list[dict]:
    resp = (
        get_client()
        .table("transformations")
        .select("*")
        .eq("file_id", file_id)
        .order("step_number", desc=False)
        .execute()
    )
    return resp.data


def get_next_step_number(file_id: str) -> int:
    steps = get_transformations(file_id)
    if not steps:
        return 1
    return steps[-1]["step_number"] + 1


def delete_transformations_after(file_id: str, step_number: int) -> int:
    """Delete all transformation steps after the given step_number. Returns count deleted."""
    resp = (
        get_client()
        .table("transformations")
        .delete()
        .eq("file_id", file_id)
        .gt("step_number", step_number)
        .execute()
    )
    return len(resp.data)


def delete_all_transformations(file_id: str) -> int:
    resp = (
        get_client()
        .table("transformations")
        .delete()
        .eq("file_id", file_id)
        .execute()
    )
    return len(resp.data)


# ── Usage metering ───────────────────────────────────────────────────


def get_usage(user_id: str, month: str) -> dict | None:
    """Fetch the usage row for (user, month). month is 'YYYY-MM-01'."""
    resp = (
        get_client()
        .table("usage")
        .select("*")
        .eq("user_id", user_id)
        .eq("month", month)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def increment_usage(
    user_id: str,
    *,
    uploads: int = 0,
    transforms: int = 0,
    chat_requests: int = 0,
    rows_processed: int = 0,
) -> None:
    """Atomically increment usage counters via the increment_usage() SQL fn."""
    get_client().rpc(
        "increment_usage",
        {
            "p_user_id": user_id,
            "p_uploads": uploads,
            "p_transforms": transforms,
            "p_chat_requests": chat_requests,
            "p_rows_processed": rows_processed,
        },
    ).execute()


# ── User settings ────────────────────────────────────────────────────


def get_user_settings(user_id: str) -> dict | None:
    resp = (
        get_client()
        .table("user_settings")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def upsert_user_settings(user_id: str, **settings) -> dict:
    row = {"user_id": user_id, **settings}
    resp = (
        get_client()
        .table("user_settings")
        .upsert(row, on_conflict="user_id")
        .execute()
    )
    return resp.data[0]


def get_privacy_mode(user_id: str) -> bool:
    """Whether the user opted into schema-only LLM prompts.

    Fails to False (the default behavior) on any lookup error so a settings
    hiccup never blocks the data path.
    """
    try:
        row = get_user_settings(user_id)
        return bool(row and row.get("privacy_mode"))
    except Exception:
        logger.warning("privacy_mode lookup failed for %s; defaulting to off", user_id)
        return False


# ── Subscriptions ────────────────────────────────────────────────────


def get_subscription(user_id: str) -> dict | None:
    resp = (
        get_client()
        .table("subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def get_subscription_by_provider_id(provider_subscription_id: str) -> dict | None:
    resp = (
        get_client()
        .table("subscriptions")
        .select("*")
        .eq("provider_subscription_id", provider_subscription_id)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def upsert_subscription(user_id: str, **fields) -> dict:
    row = {"user_id": user_id, **fields}
    resp = (
        get_client()
        .table("subscriptions")
        .upsert(row, on_conflict="user_id")
        .execute()
    )
    return resp.data[0]


# ── Events (funnel analytics) ────────────────────────────────────────


def insert_event(user_id: str, event: str, properties: dict) -> None:
    get_client().table("events").insert(
        {"user_id": user_id, "event": event, "properties": properties}
    ).execute()


# ── Recipes ──────────────────────────────────────────────────────────


def create_recipe(
    *,
    user_id: str,
    name: str,
    steps: list[dict],
    required_columns: list[dict],
    description: str | None = None,
    source_file_id: str | None = None,
) -> dict:
    row = {
        "user_id": user_id,
        "name": name,
        "description": description,
        "source_file_id": source_file_id,
        "steps": steps,
        "required_columns": required_columns,
    }
    resp = get_client().table("recipes").insert(row).execute()
    return resp.data[0]


def list_recipes(user_id: str) -> list[dict]:
    resp = (
        get_client()
        .table("recipes")
        .select("id,name,description,source_file_id,steps,required_columns,created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return resp.data


def get_recipe(recipe_id: str, user_id: str) -> dict | None:
    resp = (
        get_client()
        .table("recipes")
        .select("*")
        .eq("id", recipe_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def delete_recipe(recipe_id: str, user_id: str) -> bool:
    resp = (
        get_client()
        .table("recipes")
        .delete()
        .eq("id", recipe_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(resp.data)


# ── Audit Log ────────────────────────────────────────────────────────


def create_audit_entry(
    *,
    user_id: str,
    file_id: str | None,
    action: str,
    metadata: dict | None = None,
) -> dict:
    row = {
        "user_id": user_id,
        "file_id": file_id,
        "action": action,
        "metadata": metadata or {},
    }
    resp = get_client().table("audit_log").insert(row).execute()
    return resp.data[0]


def list_audit_entries(
    file_id: str, page: int = 1, page_size: int = 20
) -> dict:
    offset = (page - 1) * page_size
    resp = (
        get_client()
        .table("audit_log")
        .select("*", count="exact")
        .eq("file_id", file_id)
        .order("created_at", desc=True)
        .range(offset, offset + page_size - 1)
        .execute()
    )
    return {"items": resp.data, "total": resp.count or 0}


# ── Chat Messages ────────────────────────────────────────────────────


def create_chat_message(
    *,
    file_id: str,
    role: str,
    content: str,
    message_type: str = "text",
    metadata: dict | None = None,
) -> dict:
    row = {
        "file_id": file_id,
        "role": role,
        "content": content,
        "message_type": message_type,
        "metadata": metadata or {},
    }
    resp = get_client().table("chat_messages").insert(row).execute()
    return resp.data[0]


def get_chat_messages(file_id: str, limit: int = 50) -> list[dict]:
    resp = (
        get_client()
        .table("chat_messages")
        .select("*")
        .eq("file_id", file_id)
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return resp.data


def delete_chat_messages(file_id: str) -> int:
    resp = (
        get_client()
        .table("chat_messages")
        .delete()
        .eq("file_id", file_id)
        .execute()
    )
    return len(resp.data)
