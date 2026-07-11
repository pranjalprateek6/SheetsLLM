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
    return len(to_evict)


def file_cache_stats() -> dict:
    with _file_lock:
        now = time.monotonic()
        live = sum(1 for _, (_, exp) in _file_cache.items() if exp > now)
        return {"total_entries": len(_file_cache), "live_entries": live}
