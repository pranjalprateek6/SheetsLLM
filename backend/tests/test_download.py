"""Tests for the download route — the route is called directly with its
data seams monkeypatched, so no Supabase / no network. The streamed
formats exercise the real DuckDB COPY export against a temp Parquet."""

import json
import os
import types

import duckdb
import pytest

from app.engine import QueryTimeoutError
from app.routes import download as download_module

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _fake_request(user_id: str = "test-user"):
    return types.SimpleNamespace(state=types.SimpleNamespace(user_id=user_id))


@pytest.fixture
def source_parquet(tmp_path):
    """A real two-row Parquet file for the COPY export path."""
    path = tmp_path / "source.parquet"
    duckdb.connect().execute(
        f"COPY (SELECT 1 AS a, 'x' AS b UNION ALL SELECT 2, 'y') "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return str(path)


@pytest.fixture
def patched_route(monkeypatch, source_parquet):
    """Patch DB seams; exports run for real against the temp Parquet."""
    monkeypatch.setattr(
        download_module.db, "get_file",
        lambda file_id, user_id: {
            "id": file_id, "r2_key": "k", "name": "report.csv", "row_count": 2,
        },
    )
    monkeypatch.setattr(download_module.db, "get_transformations", lambda file_id: [])
    monkeypatch.setattr(download_module.db, "create_audit_entry", lambda **kw: {})
    monkeypatch.setattr(download_module, "get_local_parquet", lambda r2_key: source_parquet)


def _file_bytes(resp) -> bytes:
    with open(resp.path, "rb") as fh:
        data = fh.read()
    os.unlink(resp.path)
    return data


# ── Streamed formats (real COPY TO) ───────────────────────────────────


def test_download_csv_streams_from_disk(patched_route):
    resp = download_module.download(_fake_request(), file_id="f1", format="csv")
    assert resp.status_code == 200
    assert resp.media_type == "text/csv"
    assert 'filename="report.csv"' in resp.headers["content-disposition"]
    content = _file_bytes(resp)
    assert content.startswith(b"a,b")
    assert b"1,x" in content


def test_download_tsv_uses_tabs(patched_route):
    resp = download_module.download(_fake_request(), file_id="f1", format="tsv")
    assert resp.status_code == 200
    content = _file_bytes(resp)
    assert content.startswith(b"a\tb")


def test_download_json_is_record_array(patched_route):
    resp = download_module.download(_fake_request(), file_id="f1", format="json")
    assert resp.status_code == 200
    records = json.loads(_file_bytes(resp))
    assert records == [{"a": 1, "b": "x"}, {"a": 2, "b": "y"}]


def test_download_parquet_roundtrips(patched_route):
    resp = download_module.download(_fake_request(), file_id="f1", format="parquet")
    assert resp.status_code == 200
    path = str(resp.path).replace("\\", "/")
    rows = duckdb.connect().execute(
        f"SELECT * FROM read_parquet('{path}') ORDER BY a"
    ).fetchall()
    os.unlink(resp.path)
    assert rows == [(1, "x"), (2, "y")]


# ── XLSX (pandas path) ────────────────────────────────────────────────


def test_download_xlsx_returns_xlsx_content(patched_route):
    resp = download_module.download(_fake_request(), file_id="f1", format="xlsx")
    assert resp.status_code == 200
    assert resp.media_type == XLSX_MIME
    assert resp.body[:2] == b"PK"  # xlsx is a zip container
    assert 'filename="report.xlsx"' in resp.headers["content-disposition"]


def test_download_xlsx_rejects_over_excel_limit(patched_route, monkeypatch):
    monkeypatch.setattr(
        download_module.db, "get_file",
        lambda file_id, user_id: {
            "id": file_id, "r2_key": "k", "name": "big.csv", "row_count": 2_000_000,
        },
    )
    resp = download_module.download(_fake_request(), file_id="f1", format="xlsx")
    assert resp.status_code == 400
    assert json.loads(resp.body)["code"] == "TOO_MANY_ROWS_FOR_XLSX"


# ── Guards ────────────────────────────────────────────────────────────


def test_download_unknown_format_rejected(patched_route):
    resp = download_module.download(_fake_request(), file_id="f1", format="doc")
    assert resp.status_code == 400
    assert json.loads(resp.body)["code"] == "INVALID_FORMAT"


def test_download_missing_file_404(patched_route, monkeypatch):
    monkeypatch.setattr(download_module.db, "get_file", lambda file_id, user_id: None)
    resp = download_module.download(_fake_request(), file_id="nope", format="xlsx")
    assert resp.status_code == 404
    assert json.loads(resp.body)["code"] == "FILE_NOT_FOUND"


def test_download_rate_limited_after_burst(patched_route):
    for _ in range(download_module._DOWNLOAD_RATE_MAX):
        resp = download_module.download(_fake_request(), file_id="f1", format="csv")
        assert resp.status_code == 200
        os.unlink(resp.path)
    resp = download_module.download(_fake_request(), file_id="f1", format="csv")
    assert resp.status_code == 429
    assert json.loads(resp.body)["code"] == "RATE_LIMITED"


def test_download_export_failure_returns_json_500(patched_route, monkeypatch):
    def _boom(*a, **kw):
        raise RuntimeError("replay exploded")
    monkeypatch.setattr(download_module, "export_full_result_local", _boom)
    resp = download_module.download(_fake_request(), file_id="f1", format="csv")
    assert resp.status_code == 500
    body = json.loads(resp.body)
    assert body["code"] == "EXPORT_FAILED"
    assert "replay exploded" not in body["message"]  # no internals leaked


def test_download_timeout_returns_504(patched_route, monkeypatch):
    def _slow(*a, **kw):
        raise QueryTimeoutError("Query exceeded 30s time limit.")
    monkeypatch.setattr(download_module, "export_full_result_local", _slow)
    resp = download_module.download(_fake_request(), file_id="f1", format="csv")
    assert resp.status_code == 504
    assert json.loads(resp.body)["code"] == "QUERY_TIMEOUT"
