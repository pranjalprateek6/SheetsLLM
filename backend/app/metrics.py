"""The numbers the product plan decides on (docs/PRODUCT-PLAN-2026-10.md).

Two readings, both from the events table:

- privacy_watch: chat outcomes per day. Strict privacy became the default
  in PR #56, so the AI writes SQL without sample rows; the plan's risk table
  says to watch chat_sent kind=error for two weeks after that shipped.
- gates: the go/no-go measure for each phase 7 bet, its threshold, the
  sample it rests on, and a status. A gate never says "go" on a sample too
  small to mean anything; it says "insufficient_data" and how much it has.

The functions here are pure (rows in, numbers out) so they test without a
database; routes/admin.py does the fetching.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from typing import Any, Iterable

Row = dict[str, Any]

CHAT_KINDS = ("transform", "insight", "clarification", "error")


def _when(row: Row) -> dt.datetime:
    raw = str(row.get("created_at", "")).replace("Z", "+00:00")
    try:
        t = dt.datetime.fromisoformat(raw)
    except ValueError:
        return dt.datetime.min.replace(tzinfo=dt.timezone.utc)
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


# Public name for callers outside this module
event_time = _when


def _props(row: Row) -> dict:
    p = row.get("properties")
    return p if isinstance(p, dict) else {}


def _within(rows: Iterable[Row], start: dt.datetime, end: dt.datetime) -> list[Row]:
    return [r for r in rows if start <= _when(r) < end]


def privacy_watch(rows: list[Row], now: dt.datetime, days: int = 14) -> dict:
    """chat_sent by kind for each of the last `days` days, and the error rate."""
    start = (now - dt.timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    by_day: dict[str, dict[str, int]] = {}
    for i in range(days):
        day = (start + dt.timedelta(days=i)).date().isoformat()
        by_day[day] = {k: 0 for k in CHAT_KINDS}
    for r in rows:
        if r.get("event") != "chat_sent":
            continue
        day = _when(r).date().isoformat()
        kind = _props(r).get("kind")
        if day in by_day and kind in CHAT_KINDS:
            by_day[day][kind] += 1
    totals = {k: sum(d[k] for d in by_day.values()) for k in CHAT_KINDS}
    total = sum(totals.values())
    return {
        "days": [{"date": day, **counts} for day, counts in by_day.items()],
        "totals": totals,
        "total": total,
        "error_rate": round(totals["error"] / total, 4) if total else None,
    }


def _gate(key: str, bet: str, metric: str, value, threshold: str, sample: int, min_sample: int, go: bool | None) -> dict:
    if go is None:
        status = "decide"
    elif sample < min_sample:
        status = "insufficient_data"
    else:
        status = "go" if go else "not_yet"
    return {
        "key": key, "bet": bet, "metric": metric, "value": value, "threshold": threshold,
        "sample": sample, "min_sample": min_sample, "status": status,
    }


def _count(rows: Iterable[Row], name: str) -> int:
    return sum(1 for r in rows if r.get("event") == name)


def return_rate(rows: list[Row], now: dt.datetime) -> tuple[float | None, int]:
    """Of users whose first upload in the window 60 to 30 days ago, the share
    that uploaded again within 30 days of it. (rate, cohort size)."""
    uploads: dict[str, list[dt.datetime]] = defaultdict(list)
    for r in rows:
        if r.get("event") == "upload_completed":
            uploads[str(r.get("user_id"))].append(_when(r))
    cohort_start, cohort_end = now - dt.timedelta(days=60), now - dt.timedelta(days=30)
    cohort = returned = 0
    for times in uploads.values():
        times.sort()
        first = next((t for t in times if cohort_start <= t < cohort_end), None)
        if first is None:
            continue
        cohort += 1
        # "Came back": another upload at least a day later, within 30 days
        if any(first + dt.timedelta(days=1) <= t <= first + dt.timedelta(days=30) for t in times):
            returned += 1
    return (round(returned / cohort, 4) if cohort else None), cohort


def gates(rows: list[Row], now: dt.datetime, *, recipes_saved: int, sample_step_counts: dict[str, int]) -> list[dict]:
    """Each phase 7 bet against its gate. `rows` should cover the last 60 days;
    `sample_step_counts` maps a sample upload's file id to its step count
    (files deleted since are simply absent)."""
    last30 = _within(rows, now - dt.timedelta(days=30), now + dt.timedelta(seconds=1))

    applied = _count(last30, "recipe_applied")
    incompatible = _count(last30, "recipe_incompatible")
    ratio = round(incompatible / applied, 4) if applied else None

    rate, cohort = return_rate(rows, now)

    sample_ids = [
        str(_props(r).get("file_id")) for r in last30
        if r.get("event") == "upload_completed" and _props(r).get("sample") and _props(r).get("file_id")
    ]
    known = [fid for fid in sample_ids if fid in sample_step_counts]
    untouched = sum(1 for fid in known if sample_step_counts[fid] == 0)
    untouched_share = round(untouched / len(known), 4) if known else None

    chat = [r for r in last30 if r.get("event") == "chat_sent"]
    insights = sum(1 for r in chat if _props(r).get("kind") == "insight")
    insight_share = round(insights / len(chat), 4) if chat else None

    return [
        _gate(
            "column_mapping", "Column mapping on recipe drift",
            "recipe_incompatible / recipe_applied, last 30 days", ratio, "> 10%",
            applied, 20, ratio is not None and ratio > 0.10,
        ),
        _gate(
            "monthly_pull", "The 28-day pull email",
            f"{recipes_saved} recipes saved; 30-day return rate", rate,
            "at least 20 recipes and return rate < 40%",
            cohort, 20, recipes_saved >= 20 and rate is not None and rate < 0.40,
        ),
        _gate(
            "sample_wedge", "Sample files that demonstrate the wedge",
            "sample uploads with no step afterwards, last 30 days", untouched_share, "> 50%",
            len(known), 20, untouched_share is not None and untouched_share > 0.50,
        ),
        _gate(
            "fold_history", "Fold History into the rail",
            "phase 5 has shipped; the drawer's remaining job is SQL", None,
            "a product call, not a number", 0, 0, None,
        ),
        _gate(
            "strict_answers", "Answer column questions with no AI in strict mode",
            "insight share of chat_sent, last 30 days", insight_share, "> 30%",
            len(chat), 50, insight_share is not None and insight_share > 0.30,
        ),
    ]
