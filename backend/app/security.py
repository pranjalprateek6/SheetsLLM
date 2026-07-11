"""Security utilities — file validation, rate limiting, column sanitization."""

from __future__ import annotations

import logging
import re
import time
import threading
from collections import defaultdict

logger = logging.getLogger("sheetsllm.security")

# ── File Magic Bytes ──────────────────────────────────────────────────
# Validate file type by magic bytes, not just extension.

_MAGIC_BYTES = {
    "csv": None,  # CSV has no magic bytes — accept any text-like content
    "tsv": None,
    "json": None,
    "jsonl": None,
    "xlsx": b"PK\x03\x04",  # ZIP-based (OOXML)
    "xls": b"\xd0\xcf\x11\xe0",  # OLE2 compound document
    "parquet": b"PAR1",
    "pq": b"PAR1",
}

# Dangerous patterns inside XLSX (ZIP) files — macro indicators
_XLSX_MACRO_PATTERNS = [
    b"vbaProject.bin",
    b"xl/vbaProject",
    b"xl/macros",
]


class FileValidationError(Exception):
    """Raised when an uploaded file fails security validation."""


def validate_file_magic(file_bytes: bytes, filename: str) -> None:
    """
    Validate file type by magic bytes.
    Raises FileValidationError if the file doesn't match its claimed type.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    expected_magic = _MAGIC_BYTES.get(ext)

    if expected_magic is not None and not file_bytes[:len(expected_magic)] == expected_magic:
        raise FileValidationError(
            f"File content doesn't match .{ext} format. "
            f"Expected magic bytes: {expected_magic!r}"
        )

    # Reject files that are actually executables
    exe_signatures = [
        (b"MZ", "Windows executable"),
        (b"\x7fELF", "Linux executable"),
        (b"#!", "Script file"),
    ]
    for sig, desc in exe_signatures:
        if file_bytes[:len(sig)] == sig:
            raise FileValidationError(
                f"File appears to be a {desc}, not a spreadsheet"
            )


def validate_no_macros(file_bytes: bytes, filename: str) -> None:
    """
    Reject XLSX/XLS files containing VBA macros.
    Raises FileValidationError if macros are detected.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("xlsx", "xls", "xlsm"):
        return

    # .xlsm is always macro-enabled
    if ext == "xlsm":
        raise FileValidationError(
            "Macro-enabled spreadsheets (.xlsm) are not allowed"
        )

    # Check for macro indicators inside XLSX (which is a ZIP)
    for pattern in _XLSX_MACRO_PATTERNS:
        if pattern in file_bytes:
            raise FileValidationError(
                "This file contains VBA macros, which are not allowed for security reasons"
            )


# ── Column Name Sanitization ─────────────────────────────────────────

_CONTROL_CHAR_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")
_MAX_COL_NAME_LENGTH = 255


def sanitize_column_name(name: str) -> str:
    """Strip control characters and whitespace from a column name."""
    cleaned = _CONTROL_CHAR_RE.sub("", name).strip()
    if len(cleaned) > _MAX_COL_NAME_LENGTH:
        cleaned = cleaned[:_MAX_COL_NAME_LENGTH]
    return cleaned or "unnamed"


def sanitize_column_names(names: list[str]) -> list[str]:
    """Sanitize a list of column names, deduplicating as needed."""
    seen: dict[str, int] = {}
    result: list[str] = []
    for name in names:
        clean = sanitize_column_name(name)
        if clean in seen:
            seen[clean] += 1
            clean = f"{clean}_{seen[clean]}"
        else:
            seen[clean] = 0
        result.append(clean)
    return result


# ── Rate Limiter ──────────────────────────────────────────────────────
# In-memory sliding window rate limiter. Per user_id.

_rate_store: dict[str, list[float]] = defaultdict(list)
_rate_lock = threading.Lock()

# Default: 30 requests per 60 seconds
RATE_LIMIT_MAX = 30
RATE_LIMIT_WINDOW = 60  # seconds


class RateLimitExceeded(Exception):
    """Raised when a user exceeds the rate limit."""

    def __init__(self, retry_after: float):
        self.retry_after = retry_after
        super().__init__(f"Rate limit exceeded. Retry after {retry_after:.0f}s")


def check_rate_limit(
    user_id: str,
    *,
    max_requests: int = RATE_LIMIT_MAX,
    window: int = RATE_LIMIT_WINDOW,
) -> None:
    """
    Check if user is within rate limits.
    Raises RateLimitExceeded if over the limit.
    """
    now = time.monotonic()
    with _rate_lock:
        timestamps = _rate_store[user_id]
        # Prune expired entries
        cutoff = now - window
        timestamps[:] = [t for t in timestamps if t > cutoff]

        if len(timestamps) >= max_requests:
            oldest = timestamps[0]
            retry_after = oldest + window - now
            raise RateLimitExceeded(retry_after)

        timestamps.append(now)
