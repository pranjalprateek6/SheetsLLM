"""Full-funnel report: signup -> upload -> transform -> recipe -> paywall -> pro.

Read-only. Combines what existing tables already answer (files,
transformations, recipes, subscriptions) with the events table
(paywall_hit, checkout_started, subscription_activated — migration 007).
Runs against production via the service key in backend/.env.

Usage (from repo root):
    PYTHONPATH=backend backend/.venv/Scripts/python.exe backend/scripts/funnel_report.py
    PYTHONPATH=backend backend/.venv/Scripts/python.exe backend/scripts/funnel_report.py --months 6
"""

from __future__ import annotations

import argparse
import datetime as dt
from collections import defaultdict

from app.db import get_client

PAGE = 1000


def fetch_all(table: str, columns: str) -> list[dict]:
    client = get_client()
    rows: list[dict] = []
    offset = 0
    while True:
        try:
            page = (
                client.table(table)
                .select(columns)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data
            )
        except Exception as exc:
            print(f"  (skipping {table}: {exc})")
            return rows
        rows.extend(page)
        if len(page) < PAGE:
            return rows
        offset += PAGE


def fetch_signups() -> list[dict]:
    """User creation timestamps from Supabase auth (admin API, paginated)."""
    client = get_client()
    users: list[dict] = []
    page = 1
    while True:
        try:
            batch = client.auth.admin.list_users(page=page, per_page=200)
        except Exception as exc:
            print(f"  (skipping auth users: {exc})")
            return users
        batch = getattr(batch, "users", batch) or []
        if not batch:
            return users
        users.extend({"id": u.id, "created_at": str(u.created_at)} for u in batch)
        if len(batch) < 200:
            return users
        page += 1


def month_of(ts: str) -> str:
    return str(ts)[:7]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--months", type=int, default=3)
    args = parser.parse_args()

    signups = fetch_signups()
    files = fetch_all("files", "id,user_id,created_at")
    transforms = fetch_all("transformations", "file_id,created_at")
    recipes = fetch_all("recipes", "user_id,created_at")
    events = fetch_all("events", "user_id,event,created_at")
    subs = fetch_all("subscriptions", "user_id,tier,updated_at,created_at")

    file_owner = {f["id"]: f["user_id"] for f in files}

    # month -> stage -> set(user)
    funnel: dict[str, dict[str, set]] = defaultdict(lambda: defaultdict(set))

    for u in signups:
        funnel[month_of(u["created_at"])]["signups"].add(u["id"])
    for f in files:
        if f["user_id"] != "anonymous":
            funnel[month_of(f["created_at"])]["uploaded"].add(f["user_id"])
    for t in transforms:
        owner = file_owner.get(t["file_id"])
        if owner and owner != "anonymous":
            funnel[month_of(t["created_at"])]["transformed"].add(owner)
    for r in recipes:
        if r["user_id"] != "anonymous":
            funnel[month_of(r["created_at"])]["recipe"].add(r["user_id"])
    for e in events:
        m = month_of(e["created_at"])
        if e["event"] == "paywall_hit":
            funnel[m]["paywall"].add(e["user_id"])
        elif e["event"] == "checkout_started":
            funnel[m]["checkout"].add(e["user_id"])
        elif e["event"] == "subscription_activated":
            funnel[m]["converted"].add(e["user_id"])
    # Backstop for conversions predating the events table:
    for s in subs:
        if s.get("tier") == "pro":
            funnel[month_of(s.get("created_at") or s.get("updated_at") or "")]["converted"].add(s["user_id"])

    if not funnel:
        print("No data.")
        return 0

    stages = ["signups", "uploaded", "transformed", "recipe", "paywall", "checkout", "converted"]
    months = sorted(k for k in funnel if k and k[0].isdigit())[-args.months:]
    header = f"{'month':<9}" + "".join(f"{s:>12}" for s in stages)
    print(header)
    for m in months:
        row = f"{m:<9}" + "".join(f"{len(funnel[m][s]):>12}" for s in stages)
        print(row)
    print("\n(user counts per calendar month of the action; 'converted' unions the")
    print(" subscription_activated event with pro rows in subscriptions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
