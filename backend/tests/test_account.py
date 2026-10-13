"""Account deletion: money first, then data, then the sign-in, and a retry
after any partial failure finishes the job."""

from __future__ import annotations

import asyncio
import types

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import account, db, events, storage
from app.billing import BillingError
from app.main import app
from app.routes import account as account_route


def _request(user_id: str = "u1"):
    return types.SimpleNamespace(state=types.SimpleNamespace(user_id=user_id, email="a@b.c"))


@pytest.fixture
def quiet_events(monkeypatch):
    recorded = []
    monkeypatch.setattr(events, "record", lambda uid, ev, **props: recorded.append((uid, ev, props)))
    return recorded


# ── erase_user_data ──────────────────────────────────────────────────


def test_erase_removes_objects_then_every_table(monkeypatch):
    calls: list = []
    monkeypatch.setattr(db, "list_user_files", lambda uid: [{"id": "f1", "r2_key": "u1/f1/data.parquet"}, {"id": "f2", "r2_key": "u1/f2/data.parquet"}])
    monkeypatch.setattr(account, "invalidate_file", lambda key: calls.append(("cache", key)))
    monkeypatch.setattr(storage, "delete_objects", lambda keys: calls.append(("storage", tuple(keys))))

    def _delete_rows(table, uid):
        calls.append(("rows", table, uid))
        return 2 if table == "files" else 1

    monkeypatch.setattr(db, "delete_user_rows", _delete_rows)

    counts = account.erase_user_data("u1")

    assert counts["files"] == 2
    assert set(counts) == {"files", *account.USER_TABLES}
    assert ("storage", ("u1/f1/data.parquet", "u1/f2/data.parquet")) in calls
    tables = [c[1] for c in calls if c[0] == "rows"]
    assert tables[0] == "files", "files first: steps and chat cascade from them"
    assert set(tables[1:]) == set(account.USER_TABLES)
    assert all(c[2] == "u1" for c in calls if c[0] == "rows"), "only this user's rows"


def test_erase_survives_storage_failure(monkeypatch):
    monkeypatch.setattr(db, "list_user_files", lambda uid: [{"id": "f1", "r2_key": "k1"}])
    monkeypatch.setattr(account, "invalidate_file", lambda key: None)

    def _boom(keys):
        raise RuntimeError("bucket down")

    monkeypatch.setattr(storage, "delete_objects", _boom)
    monkeypatch.setattr(db, "delete_user_rows", lambda table, uid: 1)

    counts = account.erase_user_data("u1")
    assert counts["files"] == 1, "rows go even when the bucket is unreachable"


def test_erase_with_nothing_to_delete(monkeypatch):
    monkeypatch.setattr(db, "list_user_files", lambda uid: [])
    monkeypatch.setattr(storage, "delete_objects", lambda keys: pytest.fail("no objects to remove"))
    monkeypatch.setattr(db, "delete_user_rows", lambda table, uid: 0)
    assert account.erase_user_data("u1")["files"] == 0


# ── close_subscription ───────────────────────────────────────────────


def test_no_subscription_is_nothing_to_cancel(monkeypatch):
    monkeypatch.setattr(db, "get_subscription", lambda uid: None)
    monkeypatch.setattr(account, "cancel_subscription", lambda *a, **kw: pytest.fail("must not call Razorpay"))
    assert account.close_subscription("u1") is None


def test_live_subscription_is_cancelled_at_once(monkeypatch):
    monkeypatch.setattr(db, "get_subscription", lambda uid: {"provider_subscription_id": "sub_1", "status": "active"})
    seen = {}

    def _cancel(uid, *, at_cycle_end):
        seen["at_cycle_end"] = at_cycle_end
        return {"status": "cancelled"}

    monkeypatch.setattr(account, "cancel_subscription", _cancel)
    assert account.close_subscription("u1") == "cancelled"
    assert seen["at_cycle_end"] is False, "no charge may land after the account is gone"


def test_live_subscription_that_will_not_cancel_blocks_deletion(monkeypatch):
    monkeypatch.setattr(db, "get_subscription", lambda uid: {"provider_subscription_id": "sub_1", "status": "active"})

    def _cancel(uid, *, at_cycle_end):
        raise BillingError("Razorpay said no")

    monkeypatch.setattr(account, "cancel_subscription", _cancel)
    with pytest.raises(BillingError):
        account.close_subscription("u1")


def test_stale_checkout_row_does_not_block_deletion(monkeypatch):
    monkeypatch.setattr(db, "get_subscription", lambda uid: {"provider_subscription_id": "sub_1", "status": "created"})

    def _cancel(uid, *, at_cycle_end):
        raise BillingError("cannot cancel a created subscription")

    monkeypatch.setattr(account, "cancel_subscription", _cancel)
    assert account.close_subscription("u1") is None


# ── the route ────────────────────────────────────────────────────────


def test_anonymous_cannot_delete_an_account(monkeypatch, quiet_events):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    monkeypatch.setattr(account, "erase_user_data", lambda uid: pytest.fail("must not erase"))
    r = TestClient(app, raise_server_exceptions=False).delete("/account")
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHORIZED"


def test_route_runs_money_data_then_sign_in(monkeypatch, quiet_events):
    order: list[str] = []
    monkeypatch.setattr(account, "close_subscription", lambda uid: order.append("subscription"))
    monkeypatch.setattr(account, "erase_user_data", lambda uid: (order.append("data"), {"files": 3, "recipes": 1})[1])
    monkeypatch.setattr(db, "delete_auth_user", lambda uid: order.append("auth"))

    body = asyncio.run(account_route.delete_account(_request("u1")))

    assert order == ["subscription", "data", "auth"]
    assert body == {"deleted": True, "files": 3, "recipes": 1}
    assert quiet_events == [("deleted", "account_deleted", {"files": 3, "recipes": 1})]


def test_route_deletes_nothing_when_the_subscription_will_not_cancel(monkeypatch, quiet_events):
    def _close(uid):
        raise BillingError("provider down")

    monkeypatch.setattr(account, "close_subscription", _close)
    monkeypatch.setattr(account, "erase_user_data", lambda uid: pytest.fail("must not erase"))
    monkeypatch.setattr(db, "delete_auth_user", lambda uid: pytest.fail("must not delete the sign-in"))

    resp = asyncio.run(account_route.delete_account(_request("u1")))

    assert resp.status_code == 502
    assert b"SUBSCRIPTION_NOT_CANCELLED" in resp.body
    assert b"nothing was deleted" in resp.body
    assert quiet_events == []


def test_route_reports_when_the_sign_in_survives(monkeypatch, quiet_events):
    monkeypatch.setattr(account, "close_subscription", lambda uid: None)
    monkeypatch.setattr(account, "erase_user_data", lambda uid: {"files": 1})

    def _boom(uid):
        raise RuntimeError("auth admin unavailable")

    monkeypatch.setattr(db, "delete_auth_user", _boom)

    resp = asyncio.run(account_route.delete_account(_request("u1")))

    assert resp.status_code == 502
    assert b"SIGN_IN_NOT_REMOVED" in resp.body
    assert quiet_events == [], "not deleted yet, so not counted"


def test_account_deleted_is_a_known_event():
    assert "account_deleted" in events.EVENTS
