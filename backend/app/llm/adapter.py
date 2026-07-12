import logging
import time
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class LlmError(Exception):
    """Base error for LLM failures."""
    pass


class LlmClient(ABC):
    @abstractmethod
    def generate_sql(self, system_prompt: str, user_message: str) -> str:
        """
        Send system + user messages to the LLM.
        Returns the raw text response (expected to be a SQL SELECT statement).
        """
        ...


# ── Bounded retry for transient provider failures ─────────────────────
# Provider 429/5xx used to surface instantly as a user-facing error.
# One retry with a short backoff absorbs the transient blips without
# masking real outages (audit #16).

_RETRYABLE_MARKERS = (
    "429", "RESOURCE_EXHAUSTED", "RATE_LIMIT",
    "500", "502", "503", "504", "UNAVAILABLE", "DEADLINE_EXCEEDED",
    "INTERNAL ERROR", "OVERLOADED",
)

# Transport-level blips (httpx.ConnectTimeout, ReadTimeout, ConnectError,
# builtin TimeoutError...) carry no status code and often no useful message
# — classify by exception class name.
_RETRYABLE_CLASS_MARKERS = ("TIMEOUT", "CONNECT")


def is_retryable(exc: Exception) -> bool:
    """Transient provider failure: rate limit, server-side error, or a
    network/timeout blip."""
    response = getattr(exc, "response", None)  # httpx.HTTPStatusError
    for source in (exc, response):
        for attr in ("code", "status_code"):
            code = getattr(source, attr, None)
            if isinstance(code, int):
                # An explicit HTTP status is authoritative either way
                return code == 429 or 500 <= code < 600
    cls = type(exc).__name__.upper()
    if any(marker in cls for marker in _RETRYABLE_CLASS_MARKERS):
        return True
    msg = str(exc).upper()
    return any(marker in msg for marker in _RETRYABLE_MARKERS)


def call_with_retry(fn, *, attempts: int = 2, backoff: float = 2.0):
    """Call ``fn``; on a retryable failure wait ``backoff`` seconds and try
    again, up to ``attempts`` total calls. Non-retryable errors (auth,
    safety blocks, bad requests) raise immediately."""
    last_exc: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:
            if not is_retryable(exc) or attempt == attempts:
                raise
            last_exc = exc
            logger.warning(
                "LLM call failed with transient error (attempt %d/%d), "
                "retrying in %.1fs: %s", attempt, attempts, backoff, exc,
            )
            time.sleep(backoff)
    raise last_exc  # unreachable; keeps type-checkers happy
