"""Pending multi-sheet upload stash — disk spool, TTL, ownership, eviction."""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from app import cache


@pytest.fixture(autouse=True)
def _clean_stash():
    with cache._pending_lock:
        entries = list(cache._pending_uploads.values())
        cache._pending_uploads.clear()
    for path, *_ in entries:
        Path(path).unlink(missing_ok=True)
    yield
    with cache._pending_lock:
        entries = list(cache._pending_uploads.values())
        cache._pending_uploads.clear()
    for path, *_ in entries:
        Path(path).unlink(missing_ok=True)


def test_stash_and_redeem_roundtrip():
    cache.stash_pending_upload("id1", "u1", "book.xlsx", b"PK\x03\x04data")
    got = cache.get_pending_upload("id1", "u1")
    assert got == (b"PK\x03\x04data", "book.xlsx")
    # Non-destructive: a failed conversion can retry with another sheet
    assert cache.get_pending_upload("id1", "u1") is not None


def test_redeem_wrong_owner_returns_none():
    cache.stash_pending_upload("id1", "u1", "book.xlsx", b"data")
    assert cache.get_pending_upload("id1", "attacker") is None
    # Still intact for the real owner
    assert cache.get_pending_upload("id1", "u1") is not None


def test_missing_id_returns_none():
    assert cache.get_pending_upload("ghost", "u1") is None


def test_discard_removes_entry_and_file():
    cache.stash_pending_upload("id1", "u1", "book.xlsx", b"data")
    with cache._pending_lock:
        path = cache._pending_uploads["id1"][0]
    cache.discard_pending_upload("id1")
    assert cache.get_pending_upload("id1", "u1") is None
    assert not Path(path).exists()
    cache.discard_pending_upload("id1")  # idempotent


def test_expired_entry_returns_none_and_cleans_up():
    cache.stash_pending_upload("id1", "u1", "book.xlsx", b"data")
    with cache._pending_lock:
        path, fn, owner, _ = cache._pending_uploads["id1"]
        cache._pending_uploads["id1"] = (path, fn, owner, time.monotonic() - 1)
    assert cache.get_pending_upload("id1", "u1") is None
    assert not Path(path).exists()


def test_evict_expired_purges_stale_pending():
    cache.stash_pending_upload("fresh", "u1", "a.xlsx", b"a")
    cache.stash_pending_upload("stale", "u1", "b.xlsx", b"b")
    with cache._pending_lock:
        path, fn, owner, _ = cache._pending_uploads["stale"]
        cache._pending_uploads["stale"] = (path, fn, owner, time.monotonic() - 1)
    assert cache.evict_expired() >= 1
    assert cache.get_pending_upload("stale", "u1") is None
    assert cache.get_pending_upload("fresh", "u1") is not None


def test_capacity_evicts_oldest():
    for i in range(cache._MAX_PENDING + 3):
        cache.stash_pending_upload(f"id{i}", "u1", f"f{i}.xlsx", b"x")
    with cache._pending_lock:
        assert len(cache._pending_uploads) == cache._MAX_PENDING
    # The newest entries survive
    assert cache.get_pending_upload(f"id{cache._MAX_PENDING + 2}", "u1") is not None


def test_restash_same_id_replaces_file():
    cache.stash_pending_upload("id1", "u1", "a.xlsx", b"old")
    with cache._pending_lock:
        old_path = cache._pending_uploads["id1"][0]
    cache.stash_pending_upload("id1", "u1", "a.xlsx", b"new")
    assert not Path(old_path).exists()
    assert cache.get_pending_upload("id1", "u1")[0] == b"new"
