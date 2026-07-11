"""Activation report: upload -> first-transform funnel, per calendar month.

Read-only. Answers the onboarding KPI from the roadmap: what fraction of
users who upload a file go on to run at least one transform (target >40%),
and how quickly. Runs against production via the service key in backend/.env;
no new infrastructure or event tracking required.

Usage (from repo root):
    PYTHONPATH=backend backend/.venv/Scripts/python.exe backend/scripts/activation_report.py
    PYTHONPATH=backend backend/.venv/Scripts/python.exe backend/scripts/activation_report.py --months 6
"""

from __future__ import annotations

import argparse
import datetime as dt
import statistics
from collections import defaultdict

from app.db import get_client

PAGE = 1000


def fetch_all(table: str, columns: str) -> list[dict]:
    """Page through a table (PostgREST caps responses) and return all rows."""
    client = get_client()
    rows: list[dict] = []
    offset = 0
    while True:
        page = (
            client.table(table)
            .select(columns)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
        )
        rows.extend(page)
        if len(page) < PAGE:
            return rows
        offset += PAGE


def parse_ts(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--months", type=int, default=3, help="how many months back to report (default 3)")
    args = parser.parse_args()

    files = fetch_all("files", "id,user_id,created_at")
    transforms = fetch_all("transformations", "file_id,created_at")

    # first transform per file
    first_transform: dict[str, dt.datetime] = {}
    for t in transforms:
        ts = parse_ts(t["created_at"])
        fid = t["file_id"]
        if fid not in first_transform or ts < first_transform[fid]:
            first_transform[fid] = ts

    # bucket by the month of the user's first upload in that month
    # (a user counts once per month they uploaded in)
    by_month: dict[str, dict[str, dict]] = defaultdict(dict)  # month -> user -> stats
    for f in files:
        user = f["user_id"]
        if user == "anonymous":
            continue
        uploaded = parse_ts(f["created_at"])
        month = uploaded.strftime("%Y-%m")
        stats = by_month[month].setdefault(user, {"uploads": 0, "first_upload": uploaded, "first_transform": None})
        stats["uploads"] += 1
        if uploaded < stats["first_upload"]:
            stats["first_upload"] = uploaded
        ft = first_transform.get(f["id"])
        if ft is not None and (stats["first_transform"] is None or ft < stats["first_transform"]):
            stats["first_transform"] = ft

    if not by_month:
        print("No (non-anonymous) uploads found.")
        return 0

    months = sorted(by_month)[-args.months:]
    print(f"{'month':<9}{'uploaders':>10}{'activated':>10}{'rate':>7}{'median mins to 1st transform':>32}")
    for month in months:
        users = by_month[month]
        uploaders = len(users)
        activated = [u for u in users.values() if u["first_transform"] is not None]
        rate = 100 * len(activated) / uploaders if uploaders else 0.0
        deltas = [
            (u["first_transform"] - u["first_upload"]).total_seconds() / 60
            for u in activated
            if u["first_transform"] >= u["first_upload"]
        ]
        median = f"{statistics.median(deltas):.1f}" if deltas else "-"
        print(f"{month:<9}{uploaders:>10}{len(activated):>10}{rate:>6.0f}%{median:>32}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
