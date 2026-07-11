"""Data hygiene: remove pre-auth 'anonymous' test debris and orphaned storage objects.

Dry-run by default; pass --apply to actually delete.

Usage (from repo root):
    PYTHONPATH=backend backend/.venv/Scripts/python.exe backend/scripts/cleanup_data.py
    PYTHONPATH=backend backend/.venv/Scripts/python.exe backend/scripts/cleanup_data.py --apply

What it does:
1. Deletes files rows with user_id = 'anonymous' (transformations and
   chat_messages cascade via FK; audit_log.file_id becomes NULL).
2. Deletes audit_log rows with user_id = 'anonymous'.
3. Removes the corresponding storage objects, plus any orphaned objects in
   the bucket that no files row references (e.g. leftovers from partial
   failures or deleted rows).
"""

from __future__ import annotations

import argparse
import sys

from app.config import SUPABASE_BUCKET
from app.db import get_client


def list_all_storage_keys(client) -> list[str]:
    """Walk the bucket two levels deep ({user_id}/{file_id}/object) and
    return full object keys."""
    bucket = client.storage.from_(SUPABASE_BUCKET)
    keys: list[str] = []
    for top in bucket.list("", {"limit": 1000}):
        top_name = top.get("name")
        if not top_name:
            continue
        for mid in bucket.list(top_name, {"limit": 1000}):
            mid_name = mid.get("name")
            if not mid_name:
                continue
            prefix = f"{top_name}/{mid_name}"
            entries = bucket.list(prefix, {"limit": 1000})
            if entries:
                for obj in entries:
                    if obj.get("name"):
                        keys.append(f"{prefix}/{obj['name']}")
            else:
                # mid level was itself an object (unexpected layout)
                keys.append(prefix)
    return keys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="actually delete")
    args = parser.parse_args()

    client = get_client()

    # ── 1. Anonymous DB rows ─────────────────────────────────────────
    anon_files = (
        client.table("files")
        .select("id,name,r2_key,size_bytes")
        .eq("user_id", "anonymous")
        .execute()
        .data
    )
    anon_ids = [f["id"] for f in anon_files]
    anon_keys = [f["r2_key"] for f in anon_files]

    n_steps = n_chat = 0
    if anon_ids:
        n_steps = len(
            client.table("transformations").select("id").in_("file_id", anon_ids).execute().data
        )
        n_chat = len(
            client.table("chat_messages").select("id").in_("file_id", anon_ids).execute().data
        )
    anon_audit = (
        client.table("audit_log").select("id").eq("user_id", "anonymous").execute().data
    )
    try:
        anon_recipes = (
            client.table("recipes").select("id,name").eq("user_id", "anonymous").execute().data
        )
    except Exception:
        anon_recipes = []  # table may predate migration 004

    print(f"anonymous files          : {len(anon_files)}")
    for f in anon_files:
        print(f"  - {f['name']}  ({f['size_bytes']} bytes)  {f['r2_key']}")
    print(f"  cascading transformations: {n_steps}, chat messages: {n_chat}")
    print(f"anonymous audit_log rows : {len(anon_audit)}")
    print(f"anonymous recipes        : {len(anon_recipes)}")

    # ── 2. Orphaned storage objects ──────────────────────────────────
    all_keys = set(list_all_storage_keys(client))
    referenced = {
        row["r2_key"]
        for row in client.table("files").select("r2_key").execute().data
    }
    orphans = sorted(all_keys - referenced)
    # anon keys are about to lose their DB rows too
    to_remove = sorted(set(anon_keys) | set(orphans))

    print(f"storage objects total    : {len(all_keys)}")
    print(f"orphaned (no files row)  : {len(orphans)}")
    for k in orphans:
        print(f"  - {k}")
    print(f"storage objects to remove: {len(to_remove)}")

    if not args.apply:
        print("\nDRY RUN — nothing deleted. Re-run with --apply to execute.")
        return 0

    # ── Apply ────────────────────────────────────────────────────────
    if anon_ids:
        client.table("files").delete().eq("user_id", "anonymous").execute()
        print(f"deleted {len(anon_ids)} files rows (steps/chat cascaded)")
    if anon_audit:
        client.table("audit_log").delete().eq("user_id", "anonymous").execute()
        print(f"deleted {len(anon_audit)} audit_log rows")
    if anon_recipes:
        client.table("recipes").delete().eq("user_id", "anonymous").execute()
        print(f"deleted {len(anon_recipes)} recipes")
    if to_remove:
        client.storage.from_(SUPABASE_BUCKET).remove(to_remove)
        print(f"removed {len(to_remove)} storage objects")

    # ── Verify ───────────────────────────────────────────────────────
    left = client.table("files").select("id").eq("user_id", "anonymous").execute().data
    print(f"\nverify: anonymous files remaining = {len(left)}")
    return 0 if not left else 1


if __name__ == "__main__":
    sys.exit(main())
