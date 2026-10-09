"""A malformed or unknown file id is a 404 with a JSON body, never a 500.

The fake client below behaves like PostgREST: a malformed UUID in a filter
raises (the real API answers 22P02 "invalid input syntax for type uuid"),
and a well-formed id that matches nothing returns no rows.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import db
from app.main import app


class _Query:
    def __init__(self):
        self.ids: list[str] = []

    def __getattr__(self, name):
        def chain(*args, **kwargs):
            if name == "eq" and args and args[0] == "id":
                self.ids.append(str(args[1]))
            return self
        return chain

    def execute(self):
        for value in self.ids:
            uuid.UUID(value)  # raises ValueError, as PostgREST errors
        return type("Resp", (), {"data": [], "count": 0})()


class _Client:
    def table(self, name):
        return _Query()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    monkeypatch.setattr(db, "get_client", lambda: _Client())
    return TestClient(app, raise_server_exceptions=False)


ROUTES = [
    "/files/{id}",
    "/files/{id}/history",
    "/insights/{id}",
    "/download?file_id={id}",
    "/chat/{id}",
    "/audit/{id}",
]
IDS = ["undefined", "null", "not-a-uuid", str(uuid.uuid4())]


@pytest.mark.parametrize("route", ROUTES)
@pytest.mark.parametrize("file_id", IDS)
def test_bad_or_unknown_id_is_404_json(client, route, file_id):
    resp = client.get(route.format(id=file_id))
    assert resp.status_code == 404, resp.text
    assert resp.json()["code"] == "FILE_NOT_FOUND"


def test_empty_download_id_is_not_a_500(client):
    resp = client.get("/download?file_id=")
    assert resp.status_code in (400, 404, 422)
    assert resp.headers["content-type"].startswith("application/json")


def test_bad_recipe_id_is_404_json(client):
    resp = client.post("/recipes/undefined/apply", json={"file_id": str(uuid.uuid4())})
    assert resp.status_code == 404
    assert resp.json()["code"] == "RECIPE_NOT_FOUND"


def test_is_uuid():
    assert db.is_uuid(str(uuid.uuid4()))
    for bad in ("", "undefined", None, 42, "1234"):
        assert not db.is_uuid(bad)
