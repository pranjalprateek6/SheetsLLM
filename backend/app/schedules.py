"""Recipes that run themselves.

A recipe can carry a schedule: a link to fetch (a Google Sheet shared with
anyone who has the link, or a CSV on a server) and a day of the month. On
that day the daily pass fetches the link exactly as "From a link" does,
runs the recipe on the new file with no AI call, and emails the owner the
result with a share link to the cleaned file.

The fetch, the ingest and the apply are the same code the routes use, run
as the owner.
"""
from __future__ import annotations

import datetime as _dt
import logging
import types
import uuid
from time import perf_counter

from fastapi.responses import Response

from app import db, events, mail
from app.config import PUBLIC_APP_URL

logger = logging.getLogger("sheetsllm.schedules")

# How many scheduled recipes each plan holds. 0 means no limit.
SCHEDULE_LIMITS = {"free": 1, "pro": 0}
MIN_DAY, MAX_DAY = 1, 28


class ScheduleError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def check_schedule(raw: dict) -> dict:
    """A clean {url, day} from what the person sent, or ScheduleError."""
    from app.fetch_url import FetchError, normalise_url

    if not isinstance(raw, dict):
        raise ScheduleError("INVALID_SCHEDULE", "Send a link and a day of the month.")
    try:
        url = normalise_url(str(raw.get("url") or ""))
    except FetchError as exc:
        raise ScheduleError(exc.code, str(exc)) from exc
    from urllib.parse import urlparse

    host = urlparse(url).hostname or ""
    if " " in url or "." not in host:
        raise ScheduleError("BAD_URL", "That doesn't look like a link. Paste the address of the file or the sheet.")
    try:
        day = int(raw.get("day"))
    except (TypeError, ValueError):
        raise ScheduleError("INVALID_SCHEDULE", "Pick a day of the month from 1 to 28.") from None
    if not MIN_DAY <= day <= MAX_DAY:
        raise ScheduleError("INVALID_SCHEDULE", "Pick a day of the month from 1 to 28.")
    return {"url": url, "day": day}


def limit_for(user_id: str) -> int:
    from app import usage

    return SCHEDULE_LIMITS.get(usage.get_user_tier(user_id), SCHEDULE_LIMITS["free"])


def _already_ran_today(user_id: str, recipe_id: str, now: _dt.datetime) -> bool:
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        rows = db.user_events(user_id, ["schedule_ran"], limit=200)
    except Exception:
        return False
    from app.metrics import event_time

    return any(
        (r.get("properties") or {}).get("recipe_id") == recipe_id and event_time(r) >= start for r in rows
    )


def _as_owner(user_id: str, body: dict):
    """A stand-in request for calling a route's function as the owner."""

    async def _json():
        return body

    return types.SimpleNamespace(state=types.SimpleNamespace(user_id=user_id, email=""), json=_json, headers={})


def _error_of(resp: Response) -> str:
    try:
        import json

        return str(json.loads(resp.body).get("message") or "it did not run")
    except Exception:
        return "it did not run"


def _mail(user_id: str, subject: str, lines: list[str]) -> bool:
    from app.reminders import unsubscribe_url, wants_reminders

    if not wants_reminders(user_id):
        return False
    try:
        email = db.user_email(user_id)
    except Exception:
        email = None
    if not email:
        return False
    body = "\n".join(lines + ["", "SheetsLLM", "", f"Stop these emails: {unsubscribe_url(user_id)}"])
    headers = {"List-Unsubscribe": f"<{unsubscribe_url(user_id)}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}
    return mail.send(email, subject, body, headers=headers)


async def run_one(recipe: dict, now: _dt.datetime) -> dict:
    """Fetch, ingest, apply and mail for one scheduled recipe."""
    from app import usage
    from app.fetch_url import FetchError, fetch_bytes
    from app.routes.recipes import apply_recipe
    from app.routes.upload import _ingest
    from app.share import make_token

    import asyncio

    user_id, recipe_id, name = recipe["user_id"], recipe["id"], recipe.get("name") or "Your recipe"
    schedule = recipe.get("schedule") or {}
    url = schedule.get("url") or ""

    def failed(reason: str) -> dict:
        events.record(user_id, "schedule_ran", recipe_id=recipe_id, ok=False)
        _mail(user_id, f"{name} didn't run this month", [
            "Hi,", "",
            f"{name} was due to run today on {url}, but {reason}",
            "", f"Run it yourself: {PUBLIC_APP_URL}/workspace?recipe_id={recipe_id}",
            f"Change the schedule: {PUBLIC_APP_URL}/recipes",
        ])
        return {"recipe_id": recipe_id, "ok": False, "reason": reason}

    try:
        usage.enforce(user_id, "uploads")
    except Exception:
        return failed("this month's uploads on your plan are used up.")
    try:
        file_bytes, filename = await asyncio.to_thread(fetch_bytes, url)
    except FetchError as exc:
        return failed(f"the link could not be read: {exc}")
    except Exception:
        return failed("the link could not be read.")

    file_id = str(uuid.uuid4())
    ingested = await _ingest(
        user_id=user_id, file_id=file_id, filename=filename, file_bytes=file_bytes,
        sheet_name=None, pending_id=None, source="url", start_time=perf_counter(), source_url=url,
    )
    if isinstance(ingested, Response):
        return failed(f"the file could not be opened: {_error_of(ingested)}")
    if ingested.get("requires_sheet_selection") or "file_id" not in ingested:
        return failed("the file has more than one sheet; open it once and pick the sheet.")

    applied = await apply_recipe(_as_owner(user_id, {"file_id": file_id}), recipe_id)
    if isinstance(applied, Response):
        return failed(f"the steps did not fit this month's file: {_error_of(applied)}")

    rows_before = (ingested.get("preview") or {}).get("total_rows")
    rows_after = (applied.get("preview") or {}).get("total_rows")
    checks = applied.get("checks") or []
    failing = [c for c in checks if isinstance(c, dict) and c.get("ok") is False]
    token, _expires = make_token(file_id, user_id)
    events.record(user_id, "schedule_ran", recipe_id=recipe_id, ok=True)
    lines = [
        "Hi,", "",
        f"{name} ran on this month's file from {url}.",
        f"{rows_before:,} rows in, {rows_after:,} rows out." if isinstance(rows_before, int) and isinstance(rows_after, int) else "",
    ]
    if checks:
        lines.append(
            f"{len(failing)} of {len(checks)} checks failed. Open the file to see which."
            if failing else f"All {len(checks)} checks passed."
        )
    lines += [
        "", f"The cleaned file, for 7 days: {PUBLIC_APP_URL}/s/{token}",
        f"Open it in SheetsLLM: {PUBLIC_APP_URL}/workspace?file_id={file_id}",
    ]
    _mail(user_id, f"{name} ran on this month's file", [l for l in lines if l is not None])
    return {"recipe_id": recipe_id, "ok": True, "file_id": file_id}


async def run_due(now: _dt.datetime | None = None) -> dict:
    """Every recipe scheduled for today that has not run today."""
    now = now or _dt.datetime.now(_dt.timezone.utc)
    try:
        recipes = db.list_scheduled_recipes()
    except Exception as exc:
        logger.warning("schedules: none readable (apply migration 018?): %s", exc)
        return {"due": 0, "ran": 0, "failed": 0}
    due = [
        r for r in recipes
        if (r.get("schedule") or {}).get("day") == now.day and not _already_ran_today(r["user_id"], r["id"], now)
    ]
    results = []
    for recipe in due:
        try:
            results.append(await run_one(recipe, now))
        except Exception as exc:  # one owner's trouble never stops the rest
            logger.error("schedules: %s failed: %s", recipe.get("id"), exc)
            results.append({"recipe_id": recipe.get("id"), "ok": False, "reason": "error"})
    ran = sum(1 for r in results if r.get("ok"))
    logger.info("schedules: due=%d ran=%d failed=%d", len(due), ran, len(due) - ran)
    return {"due": len(due), "ran": ran, "failed": len(due) - ran, "mail": mail.configured()}
