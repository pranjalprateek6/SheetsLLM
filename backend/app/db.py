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


def list_files(user_id: str, page: int = 1, page_size: int = 20) -> dict:
    offset = (page - 1) * page_size
    resp = (
        get_client()
        .table("files")
        .select("*", count="exact")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
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
