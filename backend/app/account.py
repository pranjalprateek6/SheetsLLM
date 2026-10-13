"""Account deletion: everything one user holds, removed for good.

Order matters, and each stage can be run again if the one after it fails:

1. Money first. A live Pro subscription is cancelled at once, so no charge
   lands after the account is gone. If Razorpay refuses, nothing is deleted
   and the caller is told to try again.
2. Data. Every file (its stored Parquet, steps, chat, cache), then the rows
   in every table keyed by user id: recipes, audit log, events, usage,
   settings, subscription state.
3. The sign-in itself, last, so a half-finished deletion can still be
   retried by the user.
"""

from __future__ import annotations

import logging

from app import db, storage
from app.billing import BillingError, _ACTIVE_STATUSES, cancel_subscription
from app.cache import invalidate_file

logger = logging.getLogger("sheetsllm.account")

# Tables with a user_id column, beyond files (whose children cascade)
USER_TABLES = ("file_links", "recipes", "audit_log", "events", "usage", "user_settings", "subscriptions")

# Subscription states that can still charge the card
_CHARGING = _ACTIVE_STATUSES | {"pending", "halted"}

_STORAGE_BATCH = 100


def close_subscription(user_id: str) -> str | None:
    """Cancel the user's subscription immediately. Returns the provider
    status, or None when there was nothing to cancel.

    Raises BillingError only when a subscription that could still charge
    the user could not be cancelled; a stale row from an abandoned checkout
    is dropped with the rest of the data.
    """
    sub = db.get_subscription(user_id)
    if not sub or not sub.get("provider_subscription_id"):
        return None
    status = sub.get("status")
    try:
        return cancel_subscription(user_id, at_cycle_end=False).get("status")
    except BillingError:
        if status in _CHARGING:
            raise
        logger.info("account %s: could not cancel %s subscription, dropping it", user_id, status)
        return None
    except Exception as exc:
        if status in _CHARGING:
            raise BillingError(f"cancel failed: {exc}") from exc
        logger.info("account %s: could not cancel %s subscription (%s), dropping it", user_id, status, exc)
        return None


def erase_user_data(user_id: str) -> dict[str, int]:
    """Delete every row and stored object belonging to ``user_id``.
    Returns counts per kind. Safe to run again after a partial failure."""
    files = db.list_user_files(user_id)
    keys = [f["r2_key"] for f in files if f.get("r2_key")]
    for key in keys:
        invalidate_file(key)
    for i in range(0, len(keys), _STORAGE_BATCH):
        batch = keys[i : i + _STORAGE_BATCH]
        try:
            storage.delete_objects(batch)
        except Exception as exc:
            # Rows go regardless; the sweep for orphaned objects picks these up
            logger.warning("account %s: storage cleanup failed for %d objects: %s", user_id, len(batch), exc)

    counts: dict[str, int] = {"files": db.delete_user_rows("files", user_id)}
    for table in USER_TABLES:
        counts[table] = db.delete_user_rows(table, user_id)
    logger.info("account %s: data erased %s", user_id, counts)
    return counts
