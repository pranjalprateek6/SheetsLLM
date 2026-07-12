"""Async job tracking for long-running operations.

The in-memory dict is the fast path; every mutation is written through to
the Supabase `jobs` table (migration 008) so job state survives restarts.
All DB access fails open: if the table is missing or Supabase is down,
jobs keep working exactly as the old in-memory-only version did.

Restart semantics (single backend instance): a DB row still "processing"
whose job_id is not in this process's memory means the worker died with
the process — `get_job` marks it failed so pollers get a definitive
"job lost, retry" instead of a 404 forever.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger("sheetsllm.jobs")

# ── Job Store ─────────────────────────────────────────────────────────

_jobs: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()
_JOB_TTL = 3_600  # 1 hour — completed jobs kept in memory for retrieval
_DB_JOB_TTL = 86_400  # 24 hours — persisted rows kept for a day

LOST_JOB_ERROR = (
    "This job was interrupted by a server restart and its progress was lost. "
    "Please retry the operation."
)


# ── Supabase write-through (fail open) ────────────────────────────────


def _db_call(what: str, fn):
    """Run a Supabase operation; on any failure log and continue (fail open
    so the pre-migration / Supabase-down cases degrade to in-memory-only)."""
    try:
        return fn()
    except Exception as exc:
        logger.warning("Job persistence unavailable (%s): %s", what, exc)
        return None


def _table():
    from app import db  # deferred: keeps module importable without Supabase env

    return db.get_client().table("jobs")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iso_to_epoch(value: Any) -> Any:
    """Supabase returns ISO timestamps; memory jobs use epoch floats.
    Normalize DB reads so both paths return the same shape."""
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).timestamp()
        except ValueError:
            return value
    return value


def _row_to_job(row: dict) -> dict:
    return {
        "job_id": row["id"],
        "user_id": row["user_id"],
        "action": row["action"],
        "status": row["status"],
        "progress": row.get("progress", 0),
        "result": row.get("result"),
        "error": row.get("error"),
        "metadata": row.get("metadata") or {},
        "created_at": _iso_to_epoch(row.get("created_at")),
        "updated_at": _iso_to_epoch(row.get("updated_at")),
    }


# ── Public API ────────────────────────────────────────────────────────


def create_job(user_id: str, action: str, metadata: dict | None = None) -> str:
    """Create a new job and return its ID."""
    job_id = str(uuid.uuid4())
    now = time.time()
    job = {
        "job_id": job_id,
        "user_id": user_id,
        "action": action,
        "status": "processing",
        "progress": 0,
        "result": None,
        "error": None,
        "metadata": metadata or {},
        "created_at": now,
        "updated_at": now,
    }
    with _lock:
        _jobs[job_id] = job
    _db_call("insert", lambda: _table().insert({
        "id": job_id,
        "user_id": user_id,
        "action": action,
        "status": "processing",
        "progress": 0,
        "metadata": metadata or {},
    }).execute())
    logger.info("Job created: %s (%s)", job_id, action)
    return job_id


def get_job(job_id: str, user_id: str | None = None) -> dict | None:
    """Get a job by ID. Optionally verify user ownership.

    Falls back to the persisted copy when the job is not in memory (i.e.
    the process restarted). A persisted job still "processing" at that
    point is orphaned — it is marked failed so the caller stops polling.
    """
    with _lock:
        job = _jobs.get(job_id)
    if job is not None:
        if user_id and job["user_id"] != user_id:
            return None
        return dict(job)

    # Memory miss — the process may have restarted mid-job.
    try:
        uuid.UUID(job_id)
    except ValueError:
        # Not a job ID we could ever have issued; skip the DB roundtrip
        # (postgrest would 400 on the UUID column and pollute the logs).
        return None
    resp = _db_call("select", lambda: (
        _table().select("*").eq("id", job_id).limit(1).execute()
    ))
    if resp is None or not resp.data:
        return None
    persisted = _row_to_job(resp.data[0])
    if user_id and persisted["user_id"] != user_id:
        return None

    if persisted["status"] == "processing":
        persisted["status"] = "failed"
        persisted["error"] = LOST_JOB_ERROR
        _db_call("mark lost", lambda: _table().update({
            "status": "failed",
            "error": LOST_JOB_ERROR,
            "updated_at": _now_iso(),
        }).eq("id", job_id).eq("status", "processing").execute())
        logger.warning("Job %s found orphaned after restart — marked failed", job_id)
    # Cache the recovered job so repeat polls stay in memory (normal
    # eviction applies — recovered jobs are always terminal states).
    with _lock:
        _jobs.setdefault(job_id, dict(persisted))
    return dict(persisted)


def update_job(
    job_id: str,
    *,
    status: str | None = None,
    progress: int | None = None,
    result: Any = None,
    error: str | None = None,
) -> None:
    """Update job state."""
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            return
        if status is not None:
            job["status"] = status
        if progress is not None:
            job["progress"] = progress
        if result is not None:
            job["result"] = result
        if error is not None:
            job["error"] = error
        job["updated_at"] = time.time()

    fields: dict[str, Any] = {"updated_at": _now_iso()}
    if status is not None:
        fields["status"] = status
    if progress is not None:
        fields["progress"] = progress
    if result is not None:
        fields["result"] = result
    if error is not None:
        fields["error"] = error
    _db_call("update", lambda: _table().update(fields).eq("id", job_id).execute())


def complete_job(job_id: str, result: Any) -> None:
    update_job(job_id, status="completed", progress=100, result=result)
    logger.info("Job completed: %s", job_id)


def fail_job(job_id: str, error: str) -> None:
    update_job(job_id, status="failed", error=error)
    logger.error("Job failed: %s — %s", job_id, error)


def sweep_orphaned() -> None:
    """Mark every persisted 'processing' job as failed. Called once at
    startup, before this process creates any jobs — anything still
    processing in the table belonged to the previous (dead) process."""
    _db_call("sweep", lambda: _table().update({
        "status": "failed",
        "error": LOST_JOB_ERROR,
        "updated_at": _now_iso(),
    }).eq("status", "processing").execute())


def evict_expired() -> int:
    """Remove old completed/failed jobs from memory and the persisted table."""
    cutoff = time.time() - _JOB_TTL
    to_remove: list[str] = []
    with _lock:
        for jid, job in _jobs.items():
            if job["status"] in ("completed", "failed") and job["updated_at"] < cutoff:
                to_remove.append(jid)
        for jid in to_remove:
            del _jobs[jid]

    db_cutoff = (
        datetime.now(timezone.utc) - timedelta(seconds=_DB_JOB_TTL)
    ).isoformat()
    _db_call("evict", lambda: (
        _table().delete()
        .in_("status", ["completed", "failed"])
        .lt("updated_at", db_cutoff)
        .execute()
    ))
    return len(to_remove)
