"""Product analytics events (plain Supabase, no external service).

record() is fire-and-forget and never raises: analytics must never break
the request path, and the backend must keep working before migration 007
has been applied (insert fails -> logged and dropped).

Event names in use:
- paywall_hit             {action, used, limit}   free user blocked by a cap
- checkout_started        {}                      Razorpay checkout created
- subscription_activated  {status}                webhook flipped tier to pro
- feedback                {message, email, path}  in-product feedback widget

Planned by docs/PRODUCT-PLAN-2026-10.md (phase 0.3), emitted as each phase lands:
- upload_completed        {rows, columns, format}
- insight_fix_applied     {fix}                    a one-click fix from the insights strip
- op_applied              {op}                     a deterministic transform, no LLM call
- chat_sent               {kind}                   transform | insight | clarification | error
- export_completed        {steps, format}
- recipe_saved            {source}                 export_strip | rail | drawer
- recipe_hint_shown       {recipe_id}
- recipe_hint_applied     {recipe_id}
- recipe_applied          {recipe_id, steps}
- recipe_incompatible     {recipe_id, missing}
- usage_cap_hit           {meter}
- llm_quota_hit           {}                       the provider's daily pool is gone
- waitlist_joined         {reason}
- privacy_mode_changed    {strict}

record() accepts any name so a typo never drops a row, but warns on names
outside EVENTS so the typo is visible in logs and tests.
"""

from __future__ import annotations

import logging

from app import db

logger = logging.getLogger("sheetsllm.events")

EVENTS = frozenset({
    "paywall_hit", "checkout_started", "subscription_activated", "feedback",
    "upload_completed", "insight_fix_applied", "op_applied", "chat_sent",
    "export_completed", "recipe_saved", "recipe_hint_shown", "recipe_hint_applied",
    "recipe_applied", "recipe_incompatible", "usage_cap_hit", "llm_quota_hit",
    "waitlist_joined", "privacy_mode_changed",
    # recipe runs that match a renamed column, flag a step, or fail a check
    "recipe_columns_matched", "recipe_run_flagged", "recipe_check_failed", "recipe_checks_saved",
    # a sort whose column mixes date formats, so it came out in text order
    "sort_mixed_dates",
    # a step taken out of the middle of a file's history
    "step_removed",
    # a link that serves the cleaned file to anyone for a week
    "share_link_created",
    # a recipe its owner was told is ready for this month's file
    "reminder_sent",
    # a clean-numbers step that emptied cells it could not read
    "clean_number_lost",
    # account
    "account_deleted",
    # a recipe's steps removed, reordered or replaced from a file
    "recipe_steps_edited",
})


def record(user_id: str, event: str, **properties) -> None:
    """Insert one event row. Never raises."""
    if event not in EVENTS:
        logger.warning("event name not in EVENTS: %s", event)
    try:
        db.insert_event(user_id, event, properties)
    except Exception as exc:
        logger.warning("event drop %s/%s: %s", user_id, event, exc)
