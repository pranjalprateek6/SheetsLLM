"""Supabase client + helper functions for files, transformations, and audit_log."""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from supabase import Client, create_client

from app.config import PRIVACY_DEFAULT_STRICT, SUPABASE_SERVICE_KEY, SUPABASE_URL

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


def is_uuid(value: object) -> bool:
    """True for a well-formed UUID string. Ids are UUID columns, and
    PostgREST answers a malformed one with an error rather than no rows."""
    try:
        UUID(str(value))
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def get_file(file_id: str, user_id: str) -> dict | None:
    # Every file route looks the file up first and answers 404 on None, so
    # a malformed id ("undefined", "") is turned into "not found" here, once.
    if not is_uuid(file_id):
        return None
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


def file_states(file_ids: list[str]) -> dict[str, dict]:
    """What state each file is in, for the Files list, in two queries total
    (not one per file): step count, the recipe last applied, the last export
    and the row count at upload. Best-effort; missing data is just absent."""
    ids = [f for f in file_ids if is_uuid(f)]
    states: dict[str, dict] = {
        f: {"step_count": 0, "recipe_name": None, "last_exported_at": None, "original_row_count": None}
        for f in ids
    }
    if not ids:
        return states
    steps = (
        get_client()
        .table("transformations")
        .select("file_id,step_number,explain")
        .in_("file_id", ids)
        .execute()
    ).data or []
    last_step: dict[str, int] = {}
    for st in steps:
        state = states.get(st["file_id"])
        if state is None:
            continue
        state["step_count"] += 1
        explain = st.get("explain") or ""
        if explain.startswith("recipe: ") and st["step_number"] >= last_step.get(st["file_id"], 0):
            last_step[st["file_id"]] = st["step_number"]
            state["recipe_name"] = explain[len("recipe: "):]
    audit = (
        get_client()
        .table("audit_log")
        .select("file_id,action,metadata,created_at")
        .in_("file_id", ids)
        .in_("action", ["download", "upload"])
        .execute()
    ).data or []
    for entry in audit:
        state = states.get(entry["file_id"])
        if state is None:
            continue
        if entry["action"] == "download":
            if not state["last_exported_at"] or entry["created_at"] > state["last_exported_at"]:
                state["last_exported_at"] = entry["created_at"]
        elif entry["action"] == "upload":
            rows = (entry.get("metadata") or {}).get("row_count")
            if isinstance(rows, int):
                state["original_row_count"] = rows
    return states


def get_upload_row_count(file_id: str) -> int | None:
    """Rows in the file as uploaded, from its upload audit entry."""
    if not is_uuid(file_id):
        return None
    resp = (
        get_client()
        .table("audit_log")
        .select("metadata")
        .eq("file_id", file_id)
        .eq("action", "upload")
        .limit(1)
        .execute()
    )
    rows = ((resp.data or [{}])[0].get("metadata") or {}).get("row_count") if resp.data else None
    return rows if isinstance(rows, int) else None


def file_names(file_ids: list[str]) -> dict[str, str]:
    ids = [f for f in file_ids if is_uuid(f)]
    if not ids:
        return {}
    resp = get_client().table("files").select("id,name").in_("id", ids).execute()
    return {r["id"]: r["name"] for r in (resp.data or [])}


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
    sent: dict | None = None,
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
    if sent is not None:
        row["sent"] = sent
    try:
        resp = get_client().table("transformations").insert(row).execute()
    except Exception as exc:
        # Migration 010 adds the sent column; until it is applied the step
        # is still saved, just without its receipt.
        if "sent" not in row or "sent" not in str(exc):
            raise
        logger.warning("transformations.sent missing (apply migration 010); saving without it")
        row.pop("sent")
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


def privacy_mode_from_row(row: dict | None) -> bool:
    """The effective privacy mode for a user_settings row.

    No row, or a row with no value, means the user never chose, so they get
    PRIVACY_DEFAULT_STRICT. An explicit true or false is kept as set.
    """
    value = row.get("privacy_mode") if row else None
    if value is None:
        return PRIVACY_DEFAULT_STRICT
    return bool(value)


def get_privacy_mode(user_id: str) -> bool:
    """Whether this user's LLM prompts are schema-only.

    Fails to the default (strict unless PRIVACY_DEFAULT=off) on any lookup
    error, so a settings hiccup never blocks the data path and never sends
    data the user may have opted out of sending.
    """
    try:
        return privacy_mode_from_row(get_user_settings(user_id))
    except Exception:
        logger.warning(
            "privacy_mode lookup failed for %s; using the default (strict=%s)",
            user_id, PRIVACY_DEFAULT_STRICT,
        )
        return PRIVACY_DEFAULT_STRICT


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


def list_events(since_iso: str, names: list[str], limit: int = 20000) -> list[dict]:
    """Event rows of the given names since a time, oldest first, for the
    metrics page. Capped; the page says so if the cap is reached."""
    resp = (
        get_client()
        .table("events")
        .select("user_id,event,properties,created_at")
        .in_("event", names)
        .gte("created_at", since_iso)
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return resp.data or []


def count_recipes() -> int:
    resp = get_client().table("recipes").select("id", count="exact").limit(0).execute()
    return resp.count or 0


def step_counts(file_ids: list[str]) -> dict[str, int]:
    """Steps per file, for files that still exist; one query."""
    ids = [f for f in file_ids if is_uuid(f)]
    if not ids:
        return {}
    existing = get_client().table("files").select("id").in_("id", ids).execute().data or []
    counts = {r["id"]: 0 for r in existing}
    if counts:
        steps = get_client().table("transformations").select("file_id").in_("file_id", list(counts)).execute().data or []
        for s in steps:
            counts[s["file_id"]] = counts.get(s["file_id"], 0) + 1
    return counts


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
    if not is_uuid(recipe_id):
        return None
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


def update_recipe(recipe_id: str, user_id: str, **updates: Any) -> dict | None:
    resp = (
        get_client()
        .table("recipes")
        .update(updates)
        .eq("id", recipe_id)
        .eq("user_id", user_id)
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


def count_audit_actions(user_id: str, action: str, since_iso: str) -> int:
    """Count a user's audit entries of one action type since a timestamp.
    Powers the dashboard's 'manual cleanups avoided' insight."""
    resp = (
        get_client()
        .table("audit_log")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("action", action)
        .gte("created_at", since_iso)
        .limit(0)  # count only — no row payload needed
        .execute()
    )
    return resp.count or 0


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
