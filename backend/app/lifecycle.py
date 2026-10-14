"""Three emails, each sent once, each tied to what the person just did.

The daily pass (the same cron as the reminders) looks at the last three
days of events and sends:

  keep_steps   an export with steps, and no recipe saved yet
  month_two    a recipe saved, and not run on another file yet
  schedule_it  a recipe run on another file, and nothing scheduled yet

Each respects the reminders switch on the account page and carries the
same one-click unsubscribe.
"""
from __future__ import annotations

import datetime as _dt
import logging

from app import db, events, mail
from app.config import PUBLIC_APP_URL

logger = logging.getLogger("sheetsllm.lifecycle")

WINDOW_DAYS = 3
TRIGGERS = ["export_completed", "recipe_saved", "recipe_applied"]
HISTORY = ["recipe_saved", "recipe_applied", "schedule_set", "lifecycle_mail_sent"]


def _copy(kind: str, props: dict) -> tuple[str, list[str]]:
    if kind == "keep_steps":
        return "Keep those steps for next month", [
            "Hi,", "",
            "You cleaned a file and exported it. Next month's export will need the same steps.",
            "Save them as a recipe and that file is one click, with no AI call.",
            "", f"Save a recipe from your file: {PUBLIC_APP_URL}/dashboard",
        ]
    if kind == "month_two":
        rid = props.get("recipe_id") or ""
        return "Next month's file is one click", [
            "Hi,", "",
            "Your recipe is saved. When next month's export lands, drop it on the recipe and the same steps run.",
            "If a column was renamed, SheetsLLM asks which one it is and remembers.",
            "", f"Run it on a new file: {PUBLIC_APP_URL}/workspace?recipe_id={rid}",
        ]
    return "Let the recipe run itself", [
        "Hi,", "",
        "Your recipe ran on another file. If the file lives at a link, a Google Sheet or a CSV on a server,",
        "the recipe can fetch it on a day of the month and email you the cleaned file.",
        "", f"Set a schedule: {PUBLIC_APP_URL}/recipes",
    ]


def kinds_due(history: list[dict], recent: list[dict]) -> list[tuple[str, dict]]:
    """Which emails this person is due, from their recent events and their
    history. Pure, for the tests."""
    sent = {(r.get("properties") or {}).get("kind") for r in history if r.get("event") == "lifecycle_mail_sent"}
    names = {r.get("event") for r in history}
    out: list[tuple[str, dict]] = []
    for r in recent:
        props = r.get("properties") or {}
        ev = r.get("event")
        if ev == "export_completed" and int(props.get("steps") or 0) > 0 and "recipe_saved" not in names:
            out.append(("keep_steps", props))
        elif ev == "recipe_saved" and "recipe_applied" not in names:
            out.append(("month_two", props))
        elif ev == "recipe_applied" and "schedule_set" not in names:
            out.append(("schedule_it", props))
    seen, unique = set(), []
    for kind, props in out:
        if kind in sent or kind in seen:
            continue
        seen.add(kind)
        unique.append((kind, props))
    return unique[:1]  # one email a day at most


def run_daily(*, now: _dt.datetime | None = None) -> dict:
    from app.reminders import unsubscribe_url, wants_reminders

    now = now or _dt.datetime.now(_dt.timezone.utc)
    since = (now - _dt.timedelta(days=WINDOW_DAYS)).isoformat()
    try:
        recent = db.list_events(since, TRIGGERS, limit=20000)
    except Exception as exc:
        logger.warning("lifecycle: events unavailable: %s", exc)
        return {"sent": 0}
    by_user: dict[str, list[dict]] = {}
    for r in recent:
        uid = str(r.get("user_id") or "")
        if uid and uid not in ("anonymous", "system"):
            by_user.setdefault(uid, []).append(r)
    sent = 0
    for uid, rows in by_user.items():
        try:
            history = db.user_events(uid, HISTORY, limit=2000)
        except Exception:
            continue
        for kind, props in kinds_due(history, rows):
            if not wants_reminders(uid):
                continue
            try:
                email = db.user_email(uid)
            except Exception:
                email = None
            if not email:
                continue
            subject, lines = _copy(kind, props)
            body = "\n".join(lines + ["", "SheetsLLM", "", f"Stop these emails: {unsubscribe_url(uid)}"])
            headers = {"List-Unsubscribe": f"<{unsubscribe_url(uid)}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}
            if mail.send(email, subject, body, headers=headers):
                events.record(uid, "lifecycle_mail_sent", kind=kind)
                sent += 1
    logger.info("lifecycle: sent=%d", sent)
    return {"sent": sent}
