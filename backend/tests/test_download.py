"""Tests for the download route's format branches — the route is called
directly with its data seams monkeypatched, so no Supabase / no network."""

import json
import types

import duckdb
import pytest

from app.routes import download as download_module

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _fake_request(user_id: str = "test-user"):
    return types.SimpleNamespace(state=types.SimpleNamespace(user_id=user_id))


@pytest.fixture
def patched_route(monkeypatch):
    """Patch DB + replay seams so the route runs against an in-memory result."""
    monkeypatch.setattr(
        download_module.db, "get_file",
        lambda file_id, user_id: {"id": file_id, "r2_key": "k", "name": "report.csv"},
    )
    monkeypatch.setattr(download_module.db, "get_transformations", lambda file_id: [])
    monkeypatch.setattr(download_module.db, "create_audit_entry", lambda **kw: {})
    monkeypatch.setattr(download_module, "get_local_parquet", lambda r2_key: "unused")

    def _fake_replay(local_path, steps):
        return duckdb.connect().execute(
            "SELECT 1 AS a, 'x' AS b UNION ALL SELECT 2, 'y'"
        )

    monkeypatch.setattr(download_module, "execute_full_result_local", _fake_replay)


def test_download_xlsx_returns_xlsx_content(patched_route):
    resp = download_module.download(_fake_request(), file_id="f1", format="xlsx")
    assert resp.status_code == 200
    assert resp.media_type == XLSX_MIME
    assert len(resp.body) > 0
    assert resp.body[:2] == b"PK"  # xlsx is a zip container
    assert 'filename="report.xlsx"' in resp.headers["content-disposition"]


def test_download_csv_still_works(patched_route):
    resp = download_module.download(_fake_request(), file_id="f1", format="csv")
    assert resp.status_code == 200
    assert resp.media_type == "text/csv"
    assert resp.body.startswith(b"a,b")


def test_download_unknown_format_rejected(patched_route):
    resp = download_module.download(_fake_request(), file_id="f1", format="doc")
    assert resp.status_code == 400
    assert json.loads(resp.body)["code"] == "INVALID_FORMAT"


def test_download_missing_file_404(patched_route, monkeypatch):
    monkeypatch.setattr(download_module.db, "get_file", lambda file_id, user_id: None)
    resp = download_module.download(_fake_request(), file_id="nope", format="xlsx")
    assert resp.status_code == 404
    assert json.loads(resp.body)["code"] == "FILE_NOT_FOUND"
