"""A recipe's live link: the latest file it cleaned, as CSV, for a sheet."""
from __future__ import annotations

import uuid

import pytest
from fastapi import Response
from fastapi.testclient import TestClient

import app.main as main_module
from app import db, events
from app.main import app
from app.routes import download as download_route
from app.routes import live_links
from app.share import make_token

RID = str(uuid.uuid4())
FID = str(uuid.uuid4())


@pytest.fixture
def world(monkeypatch):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    monkeypatch.setattr(events, "record", lambda *a, **k: None)
    recipe = {"id": RID, "user_id": "anonymous", "name": "Orders", "live_key": None}
    state = {"recipe": recipe, "last": {"file_id": FID}, "file": {"id": FID, "r2_key": "k", "name": "orders.csv"}, "missing_column": False}

    def update(rid, uid, **up):
        if state["missing_column"]:
            raise Exception("Could not find the 'live_key' column of 'recipes'")
        if rid != RID or uid != "anonymous":
            return None
        recipe.update(up)
        return dict(recipe)

    monkeypatch.setattr(db, "get_recipe", lambda rid, uid: dict(recipe) if rid == RID and uid == "anonymous" else None)
    monkeypatch.setattr(db, "update_recipe", update)
    monkeypatch.setattr(db, "last_recipe_run", lambda uid, rid: state["last"])
    monkeypatch.setattr(db, "get_file", lambda fid, uid: state["file"] if fid == FID else None)
    monkeypatch.setattr(db, "get_transformations", lambda fid: [])
    monkeypatch.setattr(live_links.lookups, "use", lambda *a: None)
    monkeypatch.setattr(download_route, "_stream_export", lambda uid, fid, rec, steps, fmt, **kw: Response("Order ID,Region\nORD1,East\n", media_type="text/csv"))
    return state


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def _token(url: str) -> str:
    return url.rsplit("/", 1)[-1]


def test_make_read_and_serve_a_live_link(world, client):
    assert client.get(f"/recipes/{RID}/live-link").json()["url"] is None
    made = client.post(f"/recipes/{RID}/live-link").json()
    assert "/api/live/" in made["url"]
    assert client.get(f"/recipes/{RID}/live-link").json()["url"] == made["url"]
    resp = client.get(f"/live/{_token(made['url'])}")
    assert resp.status_code == 200 and resp.text.startswith("Order ID,Region")


def test_a_new_link_ends_the_old_one_and_off_ends_both(world, client):
    first = _token(client.post(f"/recipes/{RID}/live-link").json()["url"])
    second = _token(client.post(f"/recipes/{RID}/live-link").json()["url"])
    assert client.get(f"/live/{first}").status_code == 404
    assert client.get(f"/live/{second}").status_code == 200
    assert client.delete(f"/recipes/{RID}/live-link").json()["url"] is None
    assert client.get(f"/live/{second}").status_code == 404


def test_before_a_run_it_says_so(world, client):
    world["last"] = None
    token = _token(client.post(f"/recipes/{RID}/live-link").json()["url"])
    resp = client.get(f"/live/{token}")
    assert resp.status_code == 404 and resp.json()["code"] == "NOT_RUN_YET"


def test_other_tokens_and_forgeries_are_refused(world, client):
    client.post(f"/recipes/{RID}/live-link")
    # A file share token is not a live link
    share, _ = make_token(FID, "anonymous")
    assert client.get(f"/live/{share}").status_code == 404
    # A live token for the right recipe with a guessed key
    forged, _ = make_token(f"o:{RID}:guess", "anonymous")
    assert client.get(f"/live/{forged}").status_code == 404
    assert client.get("/live/not-a-token").status_code == 404
    assert live_links.read_live_token(share) is None


def test_the_live_route_needs_no_sign_in(world, monkeypatch):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", False)
    c = TestClient(app, raise_server_exceptions=False)
    world["recipe"]["live_key"] = "k1"
    token, _ = make_token(f"o:{RID}:k1", "anonymous", ttl=60)
    assert c.get(f"/live/{token}").status_code == 200
    # Making one still needs an account
    assert c.post(f"/recipes/{RID}/live-link").status_code == 401


def test_without_the_migration_it_says_what_is_needed(world, client):
    world["missing_column"] = True
    resp = client.post(f"/recipes/{RID}/live-link")
    assert resp.status_code == 503 and resp.json()["code"] == "MIGRATION_REQUIRED"
