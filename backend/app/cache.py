"""In-memory caches — LLM response cache + local Parquet file cache."""

from __future__ import annotations

import hashlib
import logging
import tempfile
import threading
import time
from pathlib import Path

from app import storage

logger = logging.getLogger("sheetsllm.cache")

# ── LLM Response Cache ────────────────────────────────────────────────
# Same instruction + same schema → same SQL.  Keyed by SHA-256.

_sql_cache: dict[str, tuple[str, float]] = {}  # key → (sql, expires_at)
_SQL_TTL = 86_400  # 24 hours
_sql_lock = threading.Lock()


def sql_cache_key(instruction: str, schema_hash: str) -> str:
    """Deterministic cache key from instruction + schema fingerprint."""
    raw = f"{instruction.strip().lower()}:{schema_hash}"
    return hashlib.sha256(raw.encode()).hexdigest()


def schema_fingerprint(schema: dict) -> str:
    """Fast fingerprint: sorted column names + types."""
    parts = sorted(f"{c['name']}:{c['dtype']}" for c in schema.get("columns", []))
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def get_cached_sql(key: str) -> str | None:
    with _sql_lock:
        entry = _sql_cache.get(key)
        if entry is None:
            return None
        sql, expires_at = entry
        if time.monotonic() > expires_at:
            del _sql_cache[key]
            return None
        return sql


def set_cached_sql(key: str, sql: str) -> None:
    with _sql_lock:
        _sql_cache[key] = (sql, time.monotonic() + _SQL_TTL)


def sql_cache_stats() -> dict:
    with _sql_lock:
        now = time.monotonic()
        live = sum(1 for _, (_, exp) in _sql_cache.items() if exp > now)
        return {"total_entries": len(_sql_cache), "live_entries": live}


# ── Local Parquet File Cache ──────────────────────────────────────────
# Downloads Parquet from R2 to a temp file for faster DuckDB reads.
# 10x faster than reading over S3/httpfs for repeat queries.

_file_cache: dict[str, tuple[str, float]] = {}  # r2_key → (local_path, expires_at)
_FILE_TTL = 1_800  # 30 minutes
_MAX_CACHED_FILES = 50
_file_lock = threading.Lock()


def get_local_parquet(r2_key: str) -> str:
    """
    Return a local file path for the given R2 key.
    Downloads on cache miss; returns cached path on hit.
    """
    with _file_lock:
        entry = _file_cache.get(r2_key)
        if entry is not None:
            path, expires_at = entry
            if time.monotonic() <= expires_at and Path(path).exists():
                # Refresh TTL on access
                _file_cache[r2_key] = (path, time.monotonic() + _FILE_TTL)
                logger.debug("File cache HIT: %s → %s", r2_key, path)
                return path
            # Expired or missing — clean up
            _evict_entry(r2_key)

    # Download from R2
    data = storage.download_parquet(r2_key)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".parquet")
    tmp.write(data)
    tmp.close()
    local_path = tmp.name

    with _file_lock:
        # Evict if at capacity
        if len(_file_cache) >= _MAX_CACHED_FILES:
            _evict_oldest()
        _file_cache[r2_key] = (local_path, time.monotonic() + _FILE_TTL)

    logger.info("File cache MISS: %s → %s (%d bytes)", r2_key, local_path, len(data))
    return local_path


def invalidate_file(r2_key: str) -> None:
    """Remove a file from the local cache (e.g. after delete)."""
    with _file_lock:
        _evict_entry(r2_key)


def _evict_entry(r2_key: str) -> None:
    """Remove a single entry (caller must hold _file_lock)."""
    entry = _file_cache.pop(r2_key, None)
    if entry:
        path, _ = entry
        try:
            Path(path).unlink(missing_ok=True)
        except Exception:
            pass


def _evict_oldest() -> None:
    """Remove the entry with the earliest expiry (caller must hold _file_lock)."""
    if not _file_cache:
        return
    oldest_key = min(_file_cache, key=lambda k: _file_cache[k][1])
    _evict_entry(oldest_key)


def evict_expired() -> int:
    """Evict all expired entries. Returns count evicted."""
    now = time.monotonic()
    to_evict: list[str] = []
    with _file_lock:
        for key, (_, expires_at) in _file_cache.items():
            if expires_at < now:
                to_evict.append(key)
        for key in to_evict:
            _evict_entry(key)
    return len(to_evict) + _evict_expired_pending()


def file_cache_stats() -> dict:
    with _file_lock:
        now = time.monotonic()
        live = sum(1 for _, (_, exp) in _file_cache.items() if exp > now)
        return {"total_entries": len(_file_cache), "live_entries": live}


# ── Pending multi-sheet uploads ───────────────────────────────────────
# A multi-sheet XLSX upload pauses for sheet selection. The raw bytes are
# stashed on disk for a few minutes so picking a sheet doesn't force the
# client to re-POST the entire file (painful exactly for the big files
# where multi-sheet workbooks are common).

# upload_id → (path, filename, user_id, expires_at)
_pending_uploads: dict[str, tuple[str, str, str, float]] = {}
_PENDING_TTL = 600  # 10 minutes — plenty for a sheet-picker dialog
_MAX_PENDING = 20
_pending_lock = threading.Lock()


def stash_pending_upload(
    upload_id: str, user_id: str, filename: str, data: bytes
) -> None:
    """Spool upload bytes to disk, keyed by the upload's provisional id."""
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".upload")
    tmp.write(data)
    tmp.close()
    stale_paths: list[str] = []
    with _pending_lock:
        if upload_id in _pending_uploads:
            stale_paths.append(_pending_uploads.pop(upload_id)[0])
        while len(_pending_uploads) >= _MAX_PENDING:
            oldest = min(_pending_uploads, key=lambda k: _pending_uploads[k][3])
            stale_paths.append(_pending_uploads.pop(oldest)[0])
        _pending_uploads[upload_id] = (
            tmp.name, filename, user_id, time.monotonic() + _PENDING_TTL,
        )
    for path in stale_paths:
        Path(path).unlink(missing_ok=True)
    logger.info("Pending upload stashed: %s (%d bytes)", upload_id, len(data))


def get_pending_upload(upload_id: str, user_id: str) -> tuple[bytes, str] | None:
    """Return (bytes, filename) for a stashed upload, or None if it's
    missing, expired, or owned by someone else."""
    with _pending_lock:
        entry = _pending_uploads.get(upload_id)
        if entry is None:
            return None
        path, filename, owner, expires_at = entry
        if owner != user_id:
            return None
        if time.monotonic() > expires_at:
            _pending_uploads.pop(upload_id, None)
            Path(path).unlink(missing_ok=True)
            return None
    try:
        data = Path(path).read_bytes()
    except OSError:
        with _pending_lock:
            _pending_uploads.pop(upload_id, None)
        return None
    return data, filename


def discard_pending_upload(upload_id: str) -> None:
    """Drop a stashed upload (after it has been fully processed)."""
    with _pending_lock:
        entry = _pending_uploads.pop(upload_id, None)
    if entry:
        Path(entry[0]).unlink(missing_ok=True)


def _evict_expired_pending() -> int:
    now = time.monotonic()
    stale: list[tuple[str, str]] = []
    with _pending_lock:
        for key, (path, _, _, expires_at) in _pending_uploads.items():
            if expires_at < now:
                stale.append((key, path))
        for key, _ in stale:
            _pending_uploads.pop(key, None)
    for _, path in stale:
        Path(path).unlink(missing_ok=True)
    return len(stale)
