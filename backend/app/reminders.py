"""What happens between months: a recipe that has not run for a while is
due, and the owner is told, in the app and by email.

A recipe is due when its last run (or, never run, its saving) is at
least REMINDER_DAYS ago. The in-app list is computed on the spot for one
user. The daily pass, run by the database's scheduler, finds every due
recipe, groups them by owner, sends one email per owner, and records a
reminder_sent event per recipe so nobody hears about the same recipe
twice inside a window.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import hmac
import logging

from app import db, events, mail
from app.config import PUBLIC_APP_URL, REMINDER_DAYS

logger = logging.getLogger("sheetsllm.reminders")

# A reminder about one recipe is sent at most once per window
REMIND_AGAIN_AFTER_DAYS = 28


def _parse(iso: str | None) -> _dt.datetime | None:
    if not iso:
        return None
    try:
        return _dt.datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None


def recipe_status(recipe: dict, last_run: dict | None, now: _dt.datetime) -> dict:
    """When this recipe last ran and whether it is due."""
    ran = _parse(last_run.get("created_at")) if last_run else None
    since = ran or _parse(recipe.get("created_at")) or now
    days = max(0, (now - since).days)
    return {
        "recipe_id": recipe["id"],
        "name": recipe["name"],
        "last_run_at": ran.isoformat() if ran else None,
        "days_since": days,
        "due": days >= REMINDER_DAYS,
    }


def due_for_user(user_id: str, *, now: _dt.datetime | None = None) -> list[dict]:
    """The user's recipes with how long since they ran, due ones first."""
    now = now or _dt.datetime.now(_dt.timezone.utc)
    out = []
    for recipe in db.list_recipes(user_id):
        try:
            last = db.last_recipe_run(user_id, recipe["id"])
        except Exception:
            last = None
        out.append(recipe_status(recipe, last, now))
    return sorted(out, key=lambda r: (not r["due"], -r["days_since"]))


def _already_reminded(now: _dt.datetime) -> set[str]:
    since = (now - _dt.timedelta(days=REMIND_AGAIN_AFTER_DAYS)).isoformat()
    try:
        rows = db.list_events(since, ["reminder_sent"])
    except Exception as exc:
        logger.warning("reminders: could not read past reminders: %s", exc)
        return set()
    return {str((r.get("properties") or {}).get("recipe_id")) for r in rows}


def unsubscribe_token(user_id: str) -> str:
    """A token that only this server can mint, naming the user it is for."""
    from app.share import _b64, _secret

    body = _b64(user_id.encode("utf-8"))
    sig = _b64(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())
    return f"{body}.{sig}"


def user_from_unsubscribe_token(token: str) -> str | None:
    from app.share import _b64, _secret, _unb64

    try:
        body, sig = token.split(".", 1)
        expected = _b64(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        return _unb64(body).decode("utf-8") or None
    except Exception:
        return None


def unsubscribe_url(user_id: str) -> str:
    return f"{PUBLIC_APP_URL}/unsubscribe?t={unsubscribe_token(user_id)}"


def wants_reminders(user_id: str) -> bool:
    """False only when the user switched reminders off."""
    try:
        row = db.get_user_settings(user_id) or {}
    except Exception:
        return True
    return row.get("email_reminders") is not False


def email_text(name_list: list[dict], *, user_id: str | None = None) -> tuple[str, str]:
    """Subject and body for one owner's due recipes."""
    first = name_list[0]
    subject = (
        f"{first['name']} is ready for this month's file"
        if len(name_list) == 1
        else f"{len(name_list)} recipes are ready for this month's files"
    )
    lines = ["Hi,", ""]
    for r in name_list:
        when = f"last ran {r['days_since']} days ago" if r["last_run_at"] else f"saved {r['days_since']} days ago and not run since"
        lines.append(f"- {r['name']}: {when}. Run it on a new file: {PUBLIC_APP_URL}/workspace?recipe_id={r['recipe_id']}")
    lines += [
        "",
        "Drop this month's export on the recipe and the same steps run in one click, with no AI call.",
        "",
        f"Your recipes: {PUBLIC_APP_URL}/recipes",
        "",
        "SheetsLLM",
    ]
    if user_id:
        lines += ["", f"Stop these emails: {unsubscribe_url(user_id)}"]
    return subject, "\n".join(lines)


def run_daily(*, now: _dt.datetime | None = None) -> dict:
    """Find every due recipe, email each owner once, record what was sent.
    Returns counts. Never raises for one owner's trouble."""
    now = now or _dt.datetime.now(_dt.timezone.utc)
    reminded = _already_reminded(now)
    by_user: dict[str, list[dict]] = {}
    for recipe in db.list_all_recipes():
        try:
            last = db.last_recipe_run(recipe["user_id"], recipe["id"])
        except Exception:
            last = None
        status = recipe_status(recipe, last, now)
        if status["due"] and status["recipe_id"] not in reminded:
            by_user.setdefault(recipe["user_id"], []).append(status)

    sent = skipped = failed = 0
    for user_id, due in by_user.items():
        try:
            email = db.user_email(user_id)
        except Exception as exc:
            logger.warning("reminders: no email for %s: %s", user_id, exc)
            email = None
        if not email or not wants_reminders(user_id):
            skipped += len(due)
            continue
        subject, body = email_text(due, user_id=user_id)
        headers = {
            "List-Unsubscribe": f"<{unsubscribe_url(user_id)}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
        if mail.send(email, subject, body, headers=headers):
            sent += len(due)
            for r in due:
                events.record(user_id, "reminder_sent", recipe_id=r["recipe_id"], days_since=r["days_since"])
        else:
            failed += len(due)
    logger.info("reminders: due=%d sent=%d skipped=%d failed=%d", sum(len(v) for v in by_user.values()), sent, skipped, failed)
    return {"due": sum(len(v) for v in by_user.values()), "sent": sent, "skipped": skipped, "failed": failed, "mail": mail.configured()}
