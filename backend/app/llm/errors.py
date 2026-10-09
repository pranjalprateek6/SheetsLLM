"""Classifying LLM failures into the codes the UI explains."""

from __future__ import annotations

_QUOTA_MARKERS = ("429", "resource_exhausted", "quota", "rate limit", "ratelimit")


def is_quota_error(exc: BaseException) -> bool:
    """The provider is out of capacity (Gemini answers 429 RESOURCE_EXHAUSTED),
    as opposed to a malformed answer or a network fault."""
    text = str(exc).lower()
    return any(marker in text for marker in _QUOTA_MARKERS)
