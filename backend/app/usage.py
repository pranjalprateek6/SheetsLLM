"""Usage metering and tier limits.

One row per (user, month) in the `usage` table, incremented atomically via the
increment_usage() Postgres function (see migrations/003_create_usage.sql).

Until billing exists every user is on the "free" tier; caps are env-tunable
(config.py). Their primary job pre-revenue is acting as a circuit breaker so a
single user cannot exhaust the shared LLM quota or storage.

Design notes:
- check first, increment after success. A request that fails validation or the
  LLM call does not consume quota. The check-then-increment pair is not
  transactional; a user racing themselves can overshoot a cap by a request or
  two, which is acceptable for a soft product limit (the hard per-minute rate
  limiter still applies).
- metering failures never block the request path: enforcement fails open with
  a logged error, because losing a counter beat is better than a data-path
  outage.
"""

from __future__ import annotations

import datetime as _dt
import logging

from app.config import (
    FREE_MAX_CHAT_PER_MONTH,
    FREE_MAX_RECIPES,
    FREE_MAX_TRANSFORMS_PER_MONTH,
    FREE_MAX_UPLOADS_PER_MONTH,
    PRO_MAX_CHAT_PER_MONTH,
    PRO_MAX_RECIPES,
    PRO_MAX_TRANSFORMS_PER_MONTH,
    PRO_MAX_UPLOADS_PER_MONTH,
)
from app import db

logger = logging.getLogger("sheetsllm.usage")

_ZERO = {"uploads": 0, "transforms": 0, "chat_requests": 0, "rows_processed": 0}

TIER_LIMITS: dict[str, dict[str, int]] = {
    "free": {
        "uploads": FREE_MAX_UPLOADS_PER_MONTH,
        "transforms": FREE_MAX_TRANSFORMS_PER_MONTH,
        "chat_requests": FREE_MAX_CHAT_PER_MONTH,
    },
    "pro": {
        "uploads": PRO_MAX_UPLOADS_PER_MONTH,
        "transforms": PRO_MAX_TRANSFORMS_PER_MONTH,
        "chat_requests": PRO_MAX_CHAT_PER_MONTH,
    },
}


class UsageLimitExceeded(Exception):
    """Raised when a metered action would exceed the user's monthly cap."""

    def __init__(self, action: str, used: int, limit: int):
        self.action = action
        self.used = used
        self.limit = limit
        super().__init__(
            f"Monthly {action} limit reached ({used}/{limit}). "
            "Limits reset at the start of next month."
        )


def month_key(now: _dt.datetime | None = None) -> str:
    """First day of the current UTC month, ISO format (matches the SQL fn)."""
    now = now or _dt.datetime.now(_dt.timezone.utc)
    return now.strftime("%Y-%m-01")


# Total saved-recipe caps per tier (not monthly). 0 = unlimited.
RECIPE_LIMITS: dict[str, int] = {
    "free": FREE_MAX_RECIPES,
    "pro": PRO_MAX_RECIPES,
}


def recipe_limit(user_id: str) -> int:
    """Max total saved recipes for the user's tier. 0 means unlimited."""
    return RECIPE_LIMITS.get(get_user_tier(user_id), FREE_MAX_RECIPES)


def get_user_tier(user_id: str) -> str:
    """Resolve the user's tier from their subscription row.

    Fails to 'free' on any lookup error so billing issues never over-restrict
    a paying user's request path (worst case a Pro user is briefly capped at
    the generous free limits, not blocked)."""
    try:
        row = db.get_subscription(user_id)
        tier = (row or {}).get("tier") or "free"
        return tier if tier in TIER_LIMITS else "free"
    except Exception as exc:
        logger.warning("tier lookup failed for %s: %s", user_id, exc)
        return "free"


def check_limit(usage_row: dict | None, tier: str, action: str) -> None:
    """Pure logic: raise UsageLimitExceeded if `action` would exceed the cap.

    `usage_row` is the current month's counters (or None for a fresh month).
    `action` is one of: uploads, transforms, chat_requests.
    """
    limits = TIER_LIMITS.get(tier, TIER_LIMITS["free"])
    limit = limits.get(action)
    if limit is None or limit <= 0:  # 0 or negative = unlimited
        return
    used = int((usage_row or _ZERO).get(action, 0))
    if used >= limit:
        raise UsageLimitExceeded(action, used, limit)


# ── DB-backed helpers (fail open on metering errors) ─────────────────


def enforce(user_id: str, action: str) -> None:
    """Fetch this month's usage and enforce the cap for `action`.

    Raises UsageLimitExceeded when over the cap. Any *metering* failure
    (DB unreachable, missing table) is logged and ignored — the data path
    must not break because the meter did.
    """
    try:
        row = db.get_usage(user_id, month_key())
    except Exception as exc:
        logger.error("usage lookup failed for %s: %s", user_id, exc)
        return
    check_limit(row, get_user_tier(user_id), action)


def record(user_id: str, **counters: int) -> None:
    """Increment usage counters after a successful action. Never raises."""
    try:
        db.increment_usage(user_id, **counters)
    except Exception as exc:
        logger.error("usage increment failed for %s (%s): %s", user_id, counters, exc)


def summary(user_id: str) -> dict:
    """Current month usage + limits, for GET /usage and future UI."""
    tier = get_user_tier(user_id)
    limits = TIER_LIMITS.get(tier, TIER_LIMITS["free"])
    try:
        row = db.get_usage(user_id, month_key()) or dict(_ZERO)
    except Exception as exc:
        logger.error("usage summary failed for %s: %s", user_id, exc)
        row = dict(_ZERO)
    # Recipe applies this month: each one is a cleanup nobody did by hand.
    # Best-effort; the summary must work even if the count query fails.
    try:
        recipe_applies = db.count_audit_actions(
            user_id, "recipe_apply", f"{month_key()}T00:00:00Z"
        )
    except Exception:
        recipe_applies = 0
    return {
        "tier": tier,
        "month": month_key(),
        "used": {k: int(row.get(k, 0)) for k in ("uploads", "transforms", "chat_requests", "rows_processed")},
        "recipe_applies": recipe_applies,
        "limits": limits,
    }
