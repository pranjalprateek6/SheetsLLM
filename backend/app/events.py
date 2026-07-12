"""Product analytics events (plain Supabase, no external service).

record() is fire-and-forget and never raises: analytics must never break
the request path, and the backend must keep working before migration 007
has been applied (insert fails -> logged and dropped).

Event names in use:
- paywall_hit             {action, used, limit}   free user blocked by a cap
- checkout_started        {}                      Razorpay checkout created
- subscription_activated  {status}                webhook flipped tier to pro
- feedback                {message, email, path}  in-product feedback widget
"""

from __future__ import annotations

import logging

from app import db

logger = logging.getLogger("sheetsllm.events")


def record(user_id: str, event: str, **properties) -> None:
    """Insert one event row. Never raises."""
    try:
        db.insert_event(user_id, event, properties)
    except Exception as exc:
        logger.warning("event drop %s/%s: %s", user_id, event, exc)
