"""Route-level tests through the real ASGI app (TestClient) with the db,
storage, and LLM seams monkeypatched — covers the wiring the unit suites
can't: middleware, request parsing, the transform sync/async split, chat
branching, upload sheet-selection + pending redeem, and jobs polling.

The bare TestClient (no context manager) deliberately skips lifespan, so
no startup sweep / eviction loop / Supabase calls happen here.
"""

from __future__ import annotations

import io
import types

import duckdb
import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import cache, jobs
from app.main import app
from app.routes import chat as chat_module
from app.routes import transform as transform_module
from app.routes import upload as upload_module


class FakeLLM:
    """Scripted LLM: returns queued responses in order."""

    def __init__(self, *responses: str):
        self.responses = list(responses)
        self.calls: list[tuple[str, str]] = []

    def generate_sql(self, system_prompt: str, user_message: str) -> str:
        self.calls.append((system_prompt, user_message))
        return self.responses.pop(0)


@pytest.fixture
def client():
    # Bare client: no lifespan, so no sweep/eviction Supabase traffic
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _anonymous_auth(monkeypatch):
    """Run every request as the 'anonymous' dev user."""
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)


@pytest.fixture(autouse=True)
def _no_usage(monkeypatch):
    from app import usage, events

    monkeypatch.setattr(usage, "enforce", lambda *a, **kw: None)
    monkeypatch.setattr(usage, "record", lambda *a, **kw: None)
    monkeypatch.setattr(events, "record", lambda *a, **kw: None)


@pytest.fixture(autouse=True)
def _clean_caches():
    with cache._sql_lock:
        cache._sql_cache.clear()
    with jobs._lock:
        jobs._jobs.clear()
    yield
    with cache._sql_lock:
        cache._sql_cache.clear()
    with jobs._lock:
        jobs._jobs.clear()


@pytest.fixture(autouse=True)
def _jobs_no_db(monkeypatch):
    """Job persistence fails open (no Supabase in tests)."""
    def _boom():
        raise RuntimeError("no supabase in tests")
    monkeypatch.setattr(jobs, "_table", _boom)


@pytest.fixture
def source_parquet(tmp_path):
    path = tmp_path / "data.parquet"
    duckdb.connect().execute(
        f"COPY (SELECT * FROM (VALUES (1, 'x'), (2, 'y'), (3, 'z')) t(a, b)) "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return str(path)


def _file_rec(row_count: int = 3) -> dict:
    return {
        "id": "f1", "user_id": "anonymous", "r2_key": "k",
        "name": "data.csv", "row_count": row_count, "column_count": 2,
        "schema_json": {"columns": [{"name": "a", "dtype": "BIGINT"},
                                    {"name": "b", "dtype": "VARCHAR"}]},
    }


@pytest.fixture
def transform_seams(monkeypatch, source_parquet):
    """Wire /transform and /chat to a real local parquet; mock db writes."""
    from app import db

    monkeypatch.setattr(db, "get_file", lambda fid, uid: _file_rec() if fid == "f1" else None)
    monkeypatch.setattr(db, "get_transformations", lambda fid: [])
    monkeypatch.setattr(db, "get_next_step_number", lambda fid: 1)
    monkeypatch.setattr(db, "create_transformation", lambda **kw: {})
    monkeypatch.setattr(db, "update_file", lambda *a, **kw: {})
    monkeypatch.setattr(db, "create_audit_entry", lambda **kw: {})
    monkeypatch.setattr(db, "get_privacy_mode", lambda uid: False)
    monkeypatch.setattr(db, "get_chat_messages", lambda fid, limit=None: [])
    monkeypatch.setattr(db, "create_chat_message", lambda **kw: {})

    monkeypatch.setattr(cache, "get_local_parquet", lambda r2_key: source_parquet)
    monkeypatch.setattr(transform_module, "get_local_parquet", lambda r2_key: source_parquet)
    monkeypatch.setattr(chat_module, "get_local_parquet", lambda r2_key: source_parquet)


def _use_llm(monkeypatch, module, llm: FakeLLM):
    monkeypatch.setattr(module, "get_llm", lambda: llm)


# ── /transform ────────────────────────────────────────────────────────


class TestTransform:
    def test_sync_transform_returns_preview(self, client, transform_seams, monkeypatch):
        _use_llm(monkeypatch, transform_module, FakeLLM("SELECT * FROM data WHERE a > 1"))
        resp = client.post("/transform", json={"file_id": "f1", "instruction": "keep a > 1"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["step_number"] == 1
        assert body["preview"]["total_rows"] == 2
        assert body["sql"] == "SELECT * FROM data WHERE a > 1"

    def test_async_transform_creates_completing_job(self, client, transform_seams, monkeypatch):
        from app import db

        monkeypatch.setattr(db, "get_file", lambda fid, uid: _file_rec(row_count=200_000))
        _use_llm(monkeypatch, transform_module, FakeLLM("SELECT * FROM data WHERE a > 1"))

        resp = client.post("/transform", json={"file_id": "f1", "instruction": "big"})
        assert resp.status_code == 200
        job_id = resp.json()["job_id"]
        assert resp.json()["status"] == "processing"

        # TestClient runs BackgroundTasks before returning — poll is terminal
        poll = client.get(f"/jobs/{job_id}")
        assert poll.status_code == 200
        assert poll.json()["status"] == "completed"
        assert poll.json()["result"]["preview"]["total_rows"] == 2

    def test_clarification_short_circuits(self, client, transform_seams, monkeypatch):
        _use_llm(monkeypatch, transform_module, FakeLLM(
            '{"needs_clarification": true, "question": "Which column?", "suggestions": ["a", "b"]}'
        ))
        resp = client.post("/transform", json={"file_id": "f1", "instruction": "sort it"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["needs_clarification"] is True
        assert body["question"] == "Which column?"

    def test_execution_retry_uses_fixed_sql(self, client, transform_seams, monkeypatch):
        llm = FakeLLM(
            "SELECT nope FROM data",              # first attempt: bad column
            "SELECT * FROM data WHERE a > 2",     # retry: fixed
        )
        _use_llm(monkeypatch, transform_module, llm)
        resp = client.post("/transform", json={"file_id": "f1", "instruction": "filter"})
        assert resp.status_code == 200
        assert resp.json()["sql"] == "SELECT * FROM data WHERE a > 2"
        assert len(llm.calls) == 2

    def test_unknown_file_404(self, client, transform_seams):
        resp = client.post("/transform", json={"file_id": "ghost", "instruction": "x"})
        assert resp.status_code == 404
        assert resp.json()["code"] == "FILE_NOT_FOUND"

    def test_missing_instruction_400(self, client, transform_seams):
        resp = client.post("/transform", json={"file_id": "f1"})
        assert resp.status_code == 400
        assert resp.json()["code"] == "MISSING_INSTRUCTION"

    def test_invalid_json_400(self, client, transform_seams):
        resp = client.post("/transform", content=b"not json",
                           headers={"Content-Type": "application/json"})
        assert resp.status_code == 400
        assert resp.json()["code"] == "INVALID_JSON"

    def test_non_select_sql_rejected(self, client, transform_seams, monkeypatch):
        _use_llm(monkeypatch, transform_module, FakeLLM("DROP TABLE data"))
        resp = client.post("/transform", json={"file_id": "f1", "instruction": "drop it"})
        assert resp.status_code == 400
        assert resp.json()["code"] == "INVALID_SQL"


# ── /chat ─────────────────────────────────────────────────────────────


class TestChat:
    def test_sql_message_transforms(self, client, transform_seams, monkeypatch):
        _use_llm(monkeypatch, chat_module, FakeLLM("SELECT * FROM data WHERE a > 1"))
        resp = client.post("/chat", json={"file_id": "f1", "message": "keep a > 1"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["type"] == "transform"
        assert body["preview"]["total_rows"] == 2

    def test_insight_message_returns_text(self, client, transform_seams, monkeypatch):
        _use_llm(monkeypatch, chat_module, FakeLLM(
            '{"insight": "Column a has 3 distinct values."}'
        ))
        resp = client.post("/chat", json={"file_id": "f1", "message": "how many?"})
        assert resp.status_code == 200
        assert resp.json()["type"] == "insight"
        assert "distinct" in resp.json()["message"]

    def test_clarification_message(self, client, transform_seams, monkeypatch):
        _use_llm(monkeypatch, chat_module, FakeLLM(
            '{"needs_clarification": true, "question": "Sort by which column?"}'
        ))
        resp = client.post("/chat", json={"file_id": "f1", "message": "sort"})
        assert resp.status_code == 200
        assert resp.json()["type"] == "clarification"

    def test_unknown_file_404(self, client, transform_seams):
        resp = client.post("/chat", json={"file_id": "ghost", "message": "x"})
        assert resp.status_code == 404

    def test_get_history_requires_ownership(self, client, transform_seams):
        resp = client.get("/chat/ghost")
        assert resp.status_code == 404


# ── /jobs ─────────────────────────────────────────────────────────────


class TestJobs:
    def test_unknown_job_404(self, client):
        resp = client.get("/jobs/does-not-exist")
        assert resp.status_code == 404
        assert resp.json()["code"] == "JOB_NOT_FOUND"

    def test_foreign_job_hidden(self, client):
        job_id = jobs.create_job("someone-else", "transform")
        resp = client.get(f"/jobs/{job_id}")
        assert resp.status_code == 404


# ── /download (wiring; format logic covered in test_download.py) ─────


class TestDownload:
    def test_csv_download_via_http(self, client, transform_seams, monkeypatch):
        from app.routes import download as download_module

        monkeypatch.setattr(download_module, "get_local_parquet",
                            lambda r2_key: cache.get_local_parquet(r2_key))
        resp = client.get("/download", params={"file_id": "f1", "format": "csv"})
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/csv")
        assert resp.content.startswith(b"a,b")

    def test_invalid_format_400(self, client, transform_seams):
        resp = client.get("/download", params={"file_id": "f1", "format": "exe"})
        assert resp.status_code == 400
        assert resp.json()["code"] == "INVALID_FORMAT"


# ── /upload (sheet selection + pending redeem) ────────────────────────


def _multi_sheet_xlsx() -> bytes:
    from openpyxl import Workbook

    wb = Workbook()
    ws1 = wb.active
    ws1.title = "Sales"
    ws1.append(["region", "amount"])
    ws1.append(["north", 100])
    ws2 = wb.create_sheet("Costs")
    ws2.append(["item", "cost"])
    ws2.append(["ads", 50])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture
def upload_seams(monkeypatch, tmp_path):
    """Mock storage + metadata writes; conversion and schema run for real."""
    from app import db, storage

    stored: dict[str, bytes] = {}
    monkeypatch.setattr(storage, "upload_parquet",
                        lambda key, data: stored.__setitem__(key, data))
    monkeypatch.setattr(storage, "delete_object", lambda key: None)

    def _local(r2_key: str) -> str:
        p = tmp_path / "stored.parquet"
        p.write_bytes(stored[r2_key])
        return str(p)

    monkeypatch.setattr(cache, "get_local_parquet", _local)
    monkeypatch.setattr(db, "create_file", lambda **kw: kw)
    monkeypatch.setattr(db, "create_audit_entry", lambda **kw: {})
    monkeypatch.setattr(upload_module, "generate_insights", lambda p: None)

    # Isolate the pending-upload stash
    with cache._pending_lock:
        cache._pending_uploads.clear()
    yield
    with cache._pending_lock:
        cache._pending_uploads.clear()


class TestUpload:
    def test_multisheet_then_pending_redeem(self, client, upload_seams):
        xlsx = _multi_sheet_xlsx()

        first = client.post(
            "/upload", content=xlsx,
            headers={"X-Filename": "book.xlsx",
                     "Content-Type": "application/octet-stream"},
        )
        assert first.status_code == 200
        body = first.json()
        assert body["requires_sheet_selection"] is True
        assert body["sheets"] == ["Sales", "Costs"]
        pending_id = body["file_id"]

        # Redeem with an EMPTY body — bytes come from the stash
        second = client.post(f"/upload?pending_id={pending_id}&sheet_name=Costs")
        assert second.status_code == 200
        result = second.json()
        assert result["file_id"] == pending_id
        assert result["preview"]["columns"] == ["item", "cost"]
        assert result["preview"]["total_rows"] == 1

    def test_pending_redeem_expired_410(self, client, upload_seams):
        resp = client.post(
            "/upload?pending_id=11111111-2222-3333-4444-555555555555&sheet_name=Costs"
        )
        assert resp.status_code == 410
        assert resp.json()["code"] == "PENDING_UPLOAD_EXPIRED"

    def test_csv_upload_full_flow(self, client, upload_seams):
        resp = client.post(
            "/upload", content=b"a,b\n1,x\n2,y\n",
            headers={"X-Filename": "small.csv",
                     "Content-Type": "application/octet-stream"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["preview"]["total_rows"] == 2
        assert [c["name"] for c in body["schema"]["columns"]] == ["a", "b"]

    def test_empty_upload_400(self, client, upload_seams):
        resp = client.post(
            "/upload", content=b"",
            headers={"X-Filename": "x.csv",
                     "Content-Type": "application/octet-stream"},
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "EMPTY_FILE"
