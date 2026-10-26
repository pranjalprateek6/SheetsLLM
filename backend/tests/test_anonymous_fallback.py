"""ALLOW_ANONYMOUS lets a request with no token through as "anonymous" for
local runs and end-to-end tests. A request that sent a token which failed
must stay a 401: otherwise a signed-in person whose token expired is quietly
served the empty anonymous account and their files look gone."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import db
from app.main import app


class _Query:
    def __getattr__(self, name):
        return lambda *a, **k: self

    def execute(self):
        class _R:
            data: list = []
            count = 0
        return _R()


class _Client:
    def table(self, name):
        return _Query()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    monkeypatch.setattr(db, "get_client", lambda: _Client())

    async def _reject(request):
        raise main_module.HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Invalid or expired token"})

    monkeypatch.setattr(main_module, "verify_token", _reject)
    return TestClient(app, raise_server_exceptions=False)


def test_no_token_proceeds_as_anonymous(client):
    assert client.get("/recipes").status_code != 401


def test_a_failed_token_is_401_even_in_anonymous_mode(client):
    r = client.get("/recipes", headers={"Authorization": "Bearer expired.token.here"})
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHORIZED"


def test_an_early_401_still_carries_cors_headers(monkeypatch):
    from app.config import ALLOWED_ORIGINS

    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", False)
    origin = ALLOWED_ORIGINS[0]
    r = TestClient(app).post("/upload", content=b"a\n1\n", headers={"Origin": origin, "Authorization": "Bearer bad"})
    assert r.status_code == 401
    assert r.headers.get("access-control-allow-origin") == origin
