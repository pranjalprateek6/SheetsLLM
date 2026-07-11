"""In-memory async job tracking for long-running operations."""

from __future__ import annotations

import logging
import threading
import time
import uuid
from typing import Any

logger = logging.getLogger("sheetsllm.jobs")

# ── Job Store ─────────────────────────────────────────────────────────

_jobs: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()
_JOB_TTL = 3_600  # 1 hour — completed jobs kept for retrieval


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
    logger.info("Job created: %s (%s)", job_id, action)
    return job_id


def get_job(job_id: str, user_id: str | None = None) -> dict | None:
    """Get a job by ID. Optionally verify user ownership."""
    with _lock:
        job = _jobs.get(job_id)
    if job is None:
        return None
    if user_id and job["user_id"] != user_id:
        return None
    return dict(job)


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


def complete_job(job_id: str, result: Any) -> None:
    update_job(job_id, status="completed", progress=100, result=result)
    logger.info("Job completed: %s", job_id)


def fail_job(job_id: str, error: str) -> None:
    update_job(job_id, status="failed", error=error)
    logger.error("Job failed: %s — %s", job_id, error)


def evict_expired() -> int:
    """Remove old completed/failed jobs."""
    cutoff = time.time() - _JOB_TTL
    to_remove: list[str] = []
    with _lock:
        for jid, job in _jobs.items():
            if job["status"] in ("completed", "failed") and job["updated_at"] < cutoff:
                to_remove.append(jid)
        for jid in to_remove:
            del _jobs[jid]
    return len(to_remove)
