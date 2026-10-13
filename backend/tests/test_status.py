"""Whose fault it is: the provider's state, the words for it, and the
health line that reports it."""

from __future__ import annotations

import datetime as _dt

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import db, events, usage
from app.llm import health
from app.llm.errors import is_quota_error, is_unavailable_error
from app.main import app
from app.routes import chat as chat_module
from app.routes import health as health_route


@pytest.fixture(autouse=True)
def _fresh():
    health.reset()
    yield
    health.reset()


# ── Telling the failures apart ───────────────────────────────────────


def test_overloaded_is_unavailable_not_quota():
    exc = Exception("Gemini request failed: 503 UNAVAILABLE. {'error': {'code': 503, 'message': 'This model is currently experiencing high demand.'}}")
    assert is_unavailable_error(exc) and not is_quota_error(exc)
    exc = Exception("429 RESOURCE_EXHAUSTED: quota exceeded")
    assert is_quota_error(exc) and not is_unavailable_error(exc)
    assert not is_unavailable_error(Exception("invalid JSON in reply"))


# ── The provider's state ─────────────────────────────────────────────


def test_state_follows_the_last_failure_and_success():
    assert health.state()["ok"] is True
    health.note_failure("unavailable")
    s = health.state()
    assert s["ok"] is False and s["kind"] == "unavailable" and s["since"]
    health.note_success()
    assert health.state()["ok"] is True and health.state()["kind"] is None


def test_an_old_failure_is_forgotten():
    health.note_failure("unavailable")
    later = _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(seconds=health.STALE_AFTER_SECONDS + 1)
    assert health.state(now=later)["ok"] is True


# ── The chat route says so ───────────────────────────────────────────


class _Down:
    def generate_sql(self, *a, **kw):
        raise Exception("Gemini request failed: 503 UNAVAILABLE. high demand")


class _Up:
    def generate_sql(self, *a, **kw):
        return '{"insight": "Two columns."}'


@pytest.fixture
def chat_seams(monkeypatch, tmp_path):
    import duckdb

    path = tmp_path / "d.parquet"
    duckdb.connect().execute(f"COPY (SELECT 1 AS a, 'x' AS b) TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)")
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    monkeypatch.setattr(usage, "enforce", lambda *a, **kw: None)
    monkeypatch.setattr(usage, "record", lambda *a, **kw: None)
    monkeypatch.setattr(events, "record", lambda *a, **kw: None)
    monkeypatch.setattr(db, "get_file", lambda fid, uid: {"id": fid, "user_id": uid, "r2_key": "k", "name": "d.csv", "row_count": 1})
    monkeypatch.setattr(db, "get_transformations", lambda fid: [])
    monkeypatch.setattr(db, "get_privacy_mode", lambda uid: True)
    monkeypatch.setattr(db, "get_chat_messages", lambda fid, limit=None: [])
    saved = []
    monkeypatch.setattr(db, "create_chat_message", lambda **kw: saved.append(kw))
    monkeypatch.setattr(chat_module, "get_local_parquet", lambda key: str(path))
    return saved


def test_an_overloaded_provider_is_named_and_remembered(chat_seams, monkeypatch):
    monkeypatch.setattr(chat_module, "get_llm", lambda: _Down())
    resp = TestClient(app, raise_server_exceptions=False).post("/chat", json={"file_id": "f1", "message": "hello"})
    assert resp.status_code == 503
    body = resp.json()
    assert body["code"] == "LLM_UNAVAILABLE"
    assert "overloaded" in body["message"] and "recipes" in body["message"]
    assert "503" not in body["message"] and "Gemini" not in body["message"]
    assert health.state()["kind"] == "unavailable"
    assert any(m["metadata"].get("code") == "LLM_UNAVAILABLE" for m in chat_seams if m["role"] == "assistant")


def test_a_good_answer_clears_the_state(chat_seams, monkeypatch):
    health.note_failure("unavailable")
    monkeypatch.setattr(chat_module, "get_llm", lambda: _Up())
    resp = TestClient(app, raise_server_exceptions=False).post("/chat", json={"file_id": "f1", "message": "what columns?"})
    assert resp.status_code == 200
    assert health.state()["ok"] is True


# ── The health line ──────────────────────────────────────────────────


def test_health_reports_every_dependency(monkeypatch):
    monkeypatch.setattr(health_route, "_database_ok", lambda: (True, 12))
    health.note_failure("quota")
    body = health_route.health()
    assert body["ok"] is True
    assert body["database"] == {"ok": True, "ms": 12}
    assert body["ai"]["ok"] is False and body["ai"]["kind"] == "quota"
    assert body["model"]


def test_health_survives_a_database_that_does_not_answer(monkeypatch):
    def _boom():
        raise RuntimeError("down")

    monkeypatch.setattr(health_route, "_probe_database", _boom)
    assert health_route._database_ok() == (False, None)
