"""Shared test fixtures."""

import pytest

from app import security


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """The rate limiter keeps per-user state in a module global. Clear it
    before each test so rate-limit tests are isolated and order-independent."""
    with security._rate_lock:
        security._rate_store.clear()
    yield
    with security._rate_lock:
        security._rate_store.clear()


@pytest.fixture(autouse=True)
def _no_file_links(monkeypatch):
    """Lookups come from the file_links table. Tests that want some stub
    db.list_lookups themselves; everyone else gets none, not a DB call."""
    from app import db, lookups

    monkeypatch.setattr(db, "list_lookups", lambda fid: [])
    lookups.clear()
    yield
    lookups.clear()
