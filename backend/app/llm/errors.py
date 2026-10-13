"""Classifying LLM failures into the codes the UI explains."""

from __future__ import annotations

_QUOTA_MARKERS = ("429", "resource_exhausted", "quota", "rate limit", "ratelimit")


_UNAVAILABLE_MARKERS = ("503", "unavailable", "overloaded", "high demand", "502", "504", "deadline_exceeded")


def is_unavailable_error(exc: BaseException) -> bool:
    """The provider is up but cannot serve right now (Gemini answers 503
    UNAVAILABLE "high demand"): their trouble, not the user's, and not the
    daily pool being spent."""
    text = str(exc).lower()
    return not is_quota_error(exc) and any(marker in text for marker in _UNAVAILABLE_MARKERS)


def is_quota_error(exc: BaseException) -> bool:
    """The provider is out of capacity (Gemini answers 429 RESOURCE_EXHAUSTED),
    as opposed to a malformed answer or a network fault."""
    text = str(exc).lower()
    return any(marker in text for marker in _QUOTA_MARKERS)
