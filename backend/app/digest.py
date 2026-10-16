"""The week in numbers, mailed to the owner every Monday.

/admin/metrics has the decision numbers but nobody opens it. The digest
is the same events table read once a week and sent as plain text to every
address in ADMIN_EMAILS: how many people did something, how many files,
AI requests, recipe runs and exports, each against the week before, and
the trouble worth a look (quota hits, caps, recipes that did not fit,
accounts deleted). Nothing in it identifies a user.
"""
from __future__ import annotations

import datetime as _dt
import logging

from app import db, events, mail, metrics
from app.config import ADMIN_EMAILS, PUBLIC_APP_URL

logger = logging.getLogger("sheetsllm.digest")

# What the week is measured by. The label is how the line reads.
ACTIVITY = [
    ("upload_completed", "files uploaded"),
    ("chat_sent", "AI requests"),
    ("op_applied", "one-click fixes"),
    ("insight_fix_applied", "fixes from the strip"),
    ("recipe_saved", "recipes saved"),
    ("recipe_applied", "recipe runs"),
    ("export_completed", "exports"),
    ("share_link_created", "share links"),
    ("lookup_linked", "lookups linked"),
]
TROUBLE = [
    ("llm_quota_hit", "AI quota hits"),
    ("llm_unavailable", "AI unavailable"),
    ("usage_cap_hit", "plan caps hit"),
    ("recipe_incompatible", "recipes that did not fit a file"),
    ("recipe_check_failed", "recipe checks failed"),
    ("join_unmatched", "joins with unmatched rows"),
    ("account_deleted", "accounts deleted"),
    ("feedback", "feedback messages"),
]
# Read for the loop numbers, not listed as lines of their own
LOOP_EVENTS = ["reminder_sent", "signed_up_from", "tool_cta_clicked"]
# The try page's funnel, recorded under a hashed visitor key ("try:...")
TRY_EVENTS = ["try_started", "try_fix_applied", "try_replayed"]
MONEY = [
    ("checkout_started", "checkouts started"),
    ("subscription_activated", "subscriptions activated"),
    ("waitlist_joined", "waitlist joins"),
]
EVENT_NAMES = [name for name, _ in ACTIVITY + TROUBLE + MONEY] + LOOP_EVENTS + TRY_EVENTS
# Enough history to tell a new user from a returning one
LOOKBACK_DAYS = 60


def _week(rows: list[dict], start: _dt.datetime, end: _dt.datetime) -> list[dict]:
    return [r for r in rows if start <= metrics.event_time(r) < end]


def summarise(rows: list[dict], now: _dt.datetime, *, recipes_total: int | None = None) -> dict:
    """The numbers for the seven days ending at `now`, each beside the
    seven days before. `rows` should reach back LOOKBACK_DAYS."""
    # The anonymous user is the dev and end-to-end account, not a person
    rows = [r for r in rows if r.get("user_id") != "anonymous"]
    # A try-page visitor has no account, so is not one of the people below
    tried = [r for r in rows if str(r.get("user_id") or "").startswith("try:")]
    rows = [r for r in rows if not str(r.get("user_id") or "").startswith("try:")]
    this_start, last_start = now - _dt.timedelta(days=7), now - _dt.timedelta(days=14)
    this_week, last_week = _week(rows, this_start, now), _week(rows, last_start, this_start)

    def count(week: list[dict], name: str) -> int:
        return sum(1 for r in week if r.get("event") == name)

    def users(week: list[dict]) -> set[str]:
        return {str(r.get("user_id")) for r in week if r.get("user_id")}

    first_seen: dict[str, _dt.datetime] = {}
    for r in rows:
        uid = str(r.get("user_id") or "")
        if not uid:
            continue
        t = metrics.event_time(r)
        if uid not in first_seen or t < first_seen[uid]:
            first_seen[uid] = t
    new_this = sum(1 for t in first_seen.values() if this_start <= t < now)
    new_last = sum(1 for t in first_seen.values() if last_start <= t < this_start)

    def pairs(spec: list[tuple[str, str]]) -> list[dict]:
        return [{"event": name, "label": label, "this": count(this_week, name), "last": count(last_week, name)}
                for name, label in spec]

    # Activation: of the people whose first upload was 7 to 14 days ago,
    # how many ran a recipe within 7 days of it
    first_upload: dict[str, _dt.datetime] = {}
    first_run: dict[str, list[_dt.datetime]] = {}
    for r in rows:
        uid = str(r.get("user_id") or "")
        if not uid:
            continue
        t = metrics.event_time(r)
        if r.get("event") == "upload_completed" and (uid not in first_upload or t < first_upload[uid]):
            first_upload[uid] = t
        elif r.get("event") == "recipe_applied":
            first_run.setdefault(uid, []).append(t)
    cohort = [u for u, t in first_upload.items() if last_start <= t < this_start]
    activated = [
        u for u in cohort
        if any(first_upload[u] <= t <= first_upload[u] + _dt.timedelta(days=7) for t in first_run.get(u, []))
    ]

    # The habit: recipes run on two or more files, reminders that led to a
    # run within a week, and signups that came from a free tool
    runs_per_recipe: dict[str, int] = {}
    for r in rows:
        if r.get("event") == "recipe_applied":
            rid = str((r.get("properties") or {}).get("recipe_id") or "")
            if rid:
                runs_per_recipe[rid] = runs_per_recipe.get(rid, 0) + 1
    reminders = [r for r in this_week + last_week if r.get("event") == "reminder_sent"]
    converted = 0
    for rem in reminders:
        rid = (rem.get("properties") or {}).get("recipe_id")
        at = metrics.event_time(rem)
        if any(
            r.get("event") == "recipe_applied" and (r.get("properties") or {}).get("recipe_id") == rid
            and at <= metrics.event_time(r) <= at + _dt.timedelta(days=7)
            for r in rows
        ):
            converted += 1
    tool_signups = sum(
        1 for r in this_week
        if r.get("event") == "signed_up_from" and str((r.get("properties") or {}).get("from") or "").startswith("tool-")
    )
    tool_clicks = sum(1 for r in this_week if r.get("event") == "tool_cta_clicked")

    # The try page: visitors who opened it, fixed something, ran the steps
    # on next month's file, and the signups it sent
    tried_week = _week(tried, this_start, now)

    def visitors(name: str) -> int:
        return len({r.get("user_id") for r in tried_week if r.get("event") == name})

    try_signups = sum(
        1 for r in this_week
        if r.get("event") == "signed_up_from" and (r.get("properties") or {}).get("from") == "try"
    )

    return {
        "loop": {
            "recipes_run_twice": sum(1 for n in runs_per_recipe.values() if n >= 2),
            "recipes_run": len(runs_per_recipe),
            "reminders": len(reminders),
            "reminders_converted": converted,
            "tool_clicks": tool_clicks,
            "tool_signups": tool_signups,
            "try_started": visitors("try_started"),
            "try_fixed": visitors("try_fix_applied"),
            "try_replayed": visitors("try_replayed"),
            "try_signups": try_signups,
        },
        "activation": {"cohort": len(cohort), "activated": len(activated)},
        "from": this_start.date().isoformat(),
        "to": (now - _dt.timedelta(days=1)).date().isoformat(),
        "active_users": {"this": len(users(this_week)), "last": len(users(last_week))},
        "new_users": {"this": new_this, "last": new_last},
        "activity": pairs(ACTIVITY),
        "trouble": pairs(TROUBLE),
        "money": pairs(MONEY),
        "recipes_total": recipes_total,
    }


def _delta(this: int, last: int) -> str:
    if this == last:
        return "same as last week"
    if last == 0:
        return "up from 0"
    change = this - last
    return f"{'up' if change > 0 else 'down'} {abs(change)} from {last}"


def _line(label: str, this: int, last: int) -> str:
    return f"- {this:>5}  {label} ({_delta(this, last)})"


def email_text(summary: dict) -> tuple[str, str]:
    """Subject and body. The subject carries the three numbers that matter."""
    by_event = {p["event"]: p for p in summary["activity"]}
    files = by_event["upload_completed"]["this"]
    ai = by_event["chat_sent"]["this"]
    runs = by_event["recipe_applied"]["this"]
    subject = f"SheetsLLM this week: {files} files, {ai} AI requests, {runs} recipe runs"

    au, nu = summary["active_users"], summary["new_users"]
    lines = [
        f"The week of {summary['from']} to {summary['to']}.",
        "",
        "People",
        _line("people did something", au["this"], au["last"]),
        _line("were new", nu["this"], nu["last"]),
        *([f"  {summary['activation']['activated']} of the {summary['activation']['cohort']} who started the week before ran a recipe within 7 days."]
          if summary.get("activation", {}).get("cohort") else []),
        "",
        "Activity",
        *[_line(p["label"], p["this"], p["last"]) for p in summary["activity"]],
    ]
    if summary.get("recipes_total") is not None:
        lines.append(f"  {summary['recipes_total']} recipes exist in all.")
    loop = summary.get("loop") or {}
    if loop:
        lines += ["", "The habit"]
        lines.append(f"  {loop.get('recipes_run_twice', 0)} of {loop.get('recipes_run', 0)} recipes run in the last 60 days ran on two or more files.")
        if loop.get("reminders"):
            lines.append(f"  {loop.get('reminders_converted', 0)} of {loop.get('reminders')} reminders in the last two weeks led to a run within 7 days.")
        if loop.get("tool_clicks") or loop.get("tool_signups"):
            lines.append(f"  The free tools: {loop.get('tool_clicks', 0)} clicks to the app, {loop.get('tool_signups', 0)} signups this week.")
        if loop.get("try_started") or loop.get("try_signups"):
            lines.append(
                f"  The try page: {loop.get('try_started', 0)} opened it, {loop.get('try_fixed', 0)} fixed something, "
                f"{loop.get('try_replayed', 0)} ran it on November, {loop.get('try_signups', 0)} signed up this week."
            )
    trouble = [p for p in summary["trouble"] if p["this"] or p["last"]]
    lines += ["", "Trouble"]
    lines += [_line(p["label"], p["this"], p["last"]) for p in trouble] if trouble else ["- nothing this week or last"]
    money = [p for p in summary["money"] if p["this"] or p["last"]]
    if money:
        lines += ["", "Money"]
        lines += [_line(p["label"], p["this"], p["last"]) for p in money]
    lines += ["", f"The full picture: {PUBLIC_APP_URL}/admin/metrics", "", "SheetsLLM"]
    return subject, "\n".join(lines)


def build(now: _dt.datetime | None = None) -> tuple[str, str, dict]:
    """Subject, body and the summary behind them, from the events table."""
    now = now or _dt.datetime.now(_dt.timezone.utc)
    since = (now - _dt.timedelta(days=LOOKBACK_DAYS)).isoformat()
    rows = db.list_events(since, EVENT_NAMES, limit=50000)
    try:
        recipes_total = db.count_recipes()
    except Exception:
        recipes_total = None
    summary = summarise(rows, now, recipes_total=recipes_total)
    subject, text = email_text(summary)
    return subject, text, summary


def run_weekly(*, now: _dt.datetime | None = None) -> dict:
    """Mail the digest to every owner address. Returns what happened;
    never raises for one address's trouble."""
    if not ADMIN_EMAILS:
        return {"sent": 0, "failed": 0, "skipped": "ADMIN_EMAILS is not set", "mail": mail.configured()}
    try:
        subject, text, _summary = build(now)
    except Exception as exc:
        logger.error("digest: events unavailable: %s", exc)
        return {"sent": 0, "failed": 0, "skipped": "events unavailable", "mail": mail.configured()}
    sent = failed = 0
    for address in sorted(ADMIN_EMAILS):
        if mail.send(address, subject, text):
            sent += 1
        else:
            failed += 1
    if sent:
        events.record("system", "digest_sent", recipients=sent)
    logger.info("digest: sent=%d failed=%d", sent, failed)
    return {"sent": sent, "failed": failed, "subject": subject, "mail": mail.configured()}
