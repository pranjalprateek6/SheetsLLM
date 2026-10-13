"""Share links: signed, expiring, serving one file's cleaned CSV to anyone."""

from __future__ import annotations

import types

import duckdb
import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import db, events
from app.main import app
from app.routes import download as download_module
from app.routes import files as files_route
from app.share import SHARE_TTL_SECONDS, make_token, read_token


def test_token_round_trip_and_expiry():
    token, expires = make_token("f1", "u1", now=1_000_000)
    assert expires == 1_000_000 + SHARE_TTL_SECONDS
    assert read_token(token, now=1_000_001) == ("f1", "u1")
    assert read_token(token, now=expires + 1) is None, "expired"


def test_token_cannot_be_altered_or_invented():
    token, _ = make_token("f1", "u1")
    payload, sig = token.split(".")
    assert read_token(payload + "x." + sig) is None
    assert read_token(payload + "." + sig[:-2] + "zz") is None
    assert read_token("not-a-token") is None
    assert read_token("") is None


@pytest.fixture
def parquet(tmp_path):
    path = tmp_path / "data.parquet"
    duckdb.connect().execute(
        "COPY (SELECT * FROM (VALUES (1, ' x '), (2, 'y')) t(a, b)) "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return str(path)


@pytest.fixture
def seams(monkeypatch, parquet):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    monkeypatch.setattr(db, "get_file", lambda fid, uid: {"id": fid, "user_id": uid, "r2_key": "k", "name": "orders.csv", "row_count": 2} if (fid, uid) == ("f1", "owner") else None)
    monkeypatch.setattr(db, "get_transformations", lambda fid: [{"step_number": 1, "sql_query": "SELECT a, TRIM(b) AS b FROM data"}])
    monkeypatch.setattr(db, "create_audit_entry", lambda **kw: {})
    monkeypatch.setattr(download_module, "get_local_parquet", lambda key: parquet)
    recorded = []
    monkeypatch.setattr(events, "record", lambda uid, ev, **props: recorded.append((uid, ev, props)))
    return recorded


def test_the_link_serves_the_cleaned_csv_with_no_sign_in(seams):
    token, _ = make_token("f1", "owner")
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get(f"/shared/{token}")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("text/csv")
    assert resp.text.replace("\r\n", "\n") == "a,b\n1,x\n2,y\n", "the steps applied"
    assert ("owner", "export_completed", {"format": "csv", "steps": 1, "via": "share_link"}) in seams


def test_a_bad_or_expired_link_is_a_404(seams):
    client = TestClient(app, raise_server_exceptions=False)
    assert client.get("/shared/nope").status_code == 404
    token, _ = make_token("f1", "owner", now=0)
    assert client.get(f"/shared/{token}").status_code == 404
    token, _ = make_token("ghost", "owner")
    assert client.get(f"/shared/{token}").status_code == 404


def test_the_owner_mints_a_link_for_their_own_file(seams):
    req = types.SimpleNamespace(state=types.SimpleNamespace(user_id="owner"))
    body = files_route.share_file(req, "f1")
    assert read_token(body["token"]) == ("f1", "owner")
    assert body["expires_at"].endswith("Z") or "T" in body["expires_at"]
    assert body["days"] == 7
    assert ("owner", "share_link_created", {}) in seams
    other = types.SimpleNamespace(state=types.SimpleNamespace(user_id="someone"))
    assert files_route.share_file(other, "f1").status_code == 404


def test_the_shared_path_needs_no_token_of_its_own(monkeypatch, seams):
    # Production refuses every unauthenticated request except the public paths
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", False)
    token, _ = make_token("f1", "owner")
    client = TestClient(app, raise_server_exceptions=False)
    assert client.get(f"/shared/{token}").status_code == 200
    assert client.get("/files").status_code == 401
