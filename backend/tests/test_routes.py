"""Route-level tests through the real ASGI app (TestClient) with the db,
storage, and LLM seams monkeypatched — covers the wiring the unit suites
can't: middleware, request parsing, the transform sync/async split, chat
branching, and upload sheet-selection + pending redeem.

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
from app import cache, db
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


_real_get_privacy_mode = db.get_privacy_mode


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
    """Wire /transform/op and /chat to a real local parquet; mock db writes."""
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


# ── What reaches the LLM ─────────────────────────────────────────────


class TestPrivacy:
    def _chat(self, client, monkeypatch, settings_row, llm):
        # The real lookup, so the default under test is the one routes get
        monkeypatch.setattr(db, "get_privacy_mode", _real_get_privacy_mode)
        monkeypatch.setattr(db, "get_user_settings", lambda uid: settings_row)
        _use_llm(monkeypatch, chat_module, llm)
        return client.post("/chat", json={"file_id": "f1", "message": "keep a > 1"})

    def test_prompt_has_no_sample_rows_when_strict(self, client, transform_seams, monkeypatch):
        llm = FakeLLM("SELECT * FROM data WHERE a > 1")
        resp = self._chat(client, monkeypatch, None, llm)
        assert resp.status_code == 200, resp.text
        prompt = llm.calls[0][1]
        assert "a (INTEGER)" in prompt and "b (VARCHAR)" in prompt
        assert "Sample rows:" not in prompt
        assert "e.g.:" not in prompt
        for value in ("x", "y", "z"):
            assert f"'{value}'" not in prompt and f" {value}," not in prompt

    def test_prompt_has_samples_when_off(self, client, transform_seams, monkeypatch):
        llm = FakeLLM("SELECT * FROM data WHERE a > 1")
        resp = self._chat(client, monkeypatch, {"privacy_mode": False}, llm)
        assert resp.status_code == 200, resp.text
        assert "Sample rows:" in llm.calls[0][1]


# ── /transform is retired ─────────────────────────────────────────────


def test_the_old_transform_endpoint_is_gone(client, transform_seams):
    # AI steps come through /chat; /transform enforced a cap no plan names
    resp = client.post("/transform", json={"file_id": "f1", "instruction": "keep a > 1"})
    assert resp.status_code in (404, 405)


# ── /chat ─────────────────────────────────────────────────────────────


class TestChat:
    def test_sql_message_transforms(self, client, transform_seams, monkeypatch):
        _use_llm(monkeypatch, chat_module, FakeLLM("SELECT * FROM data WHERE a > 1"))
        resp = client.post("/chat", json={"file_id": "f1", "message": "keep a > 1"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["type"] == "transform"
        assert body["preview"]["total_rows"] == 2

    def test_chat_transform_records_transforms_and_rows(self, client, transform_seams, monkeypatch):
        from app import usage

        recorded: list[dict] = []
        monkeypatch.setattr(usage, "record", lambda uid, **counters: recorded.append(counters))
        _use_llm(monkeypatch, chat_module, FakeLLM("SELECT * FROM data WHERE a > 1"))
        resp = client.post("/chat", json={"file_id": "f1", "message": "keep a > 1"})
        assert resp.status_code == 200
        assert {"chat_requests": 1} in recorded
        assert {"transforms": 1, "rows_processed": 2} in recorded

    def test_chat_answer_without_a_step_is_not_a_transform(self, client, transform_seams, monkeypatch):
        from app import usage

        recorded: list[dict] = []
        monkeypatch.setattr(usage, "record", lambda uid, **counters: recorded.append(counters))
        _use_llm(monkeypatch, chat_module, FakeLLM('{"insight": "Column a has 3 distinct values."}'))
        client.post("/chat", json={"file_id": "f1", "message": "how many?"})
        assert recorded == [{"chat_requests": 1}]

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

    # ── Questions answered by running a query ──────────────────────

    def test_question_is_answered_from_the_data_and_saves_no_step(self, client, transform_seams, monkeypatch):
        saved: list[dict] = []
        monkeypatch.setattr(db, "create_chat_message", lambda **kw: saved.append(kw))
        monkeypatch.setattr(db, "create_transformation", lambda **kw: pytest.fail("a question is not a step"))
        monkeypatch.setattr(db, "get_privacy_mode", lambda uid: True)
        _use_llm(monkeypatch, chat_module, FakeLLM('{"query": "SELECT COUNT(*) AS rows, MAX(a) AS biggest FROM data"}'))

        resp = client.post("/chat", json={"file_id": "f1", "message": "how many rows, and the biggest a?"})

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["type"] == "answer"
        assert body["message"] == "rows: 3 · biggest: 3"
        assert body["columns"] == ["rows", "biggest"]
        assert body["rows"] == [{"rows": 3, "biggest": 3}]
        assert body["total_rows"] == 1
        assert body["strict"] is True
        assert body["sent"]["mode"] == "strict"
        kept = [m for m in saved if m["role"] == "assistant"]
        assert kept[0]["message_type"] == "answer"
        assert kept[0]["metadata"]["rows"] == [{"rows": 3, "biggest": 3}]

    def test_question_sees_the_steps_so_far(self, client, transform_seams, monkeypatch):
        monkeypatch.setattr(db, "get_transformations", lambda fid: [
            {"step_number": 1, "sql_query": "SELECT * FROM data WHERE a > 1"},
        ])
        _use_llm(monkeypatch, chat_module, FakeLLM('{"query": "SELECT COUNT(*) AS n FROM data"}'))
        resp = client.post("/chat", json={"file_id": "f1", "message": "how many rows?"})
        assert resp.json()["message"] == "n: 2"

    def test_question_is_metered_as_one_ai_request(self, client, transform_seams, monkeypatch):
        from app import usage

        recorded: list[dict] = []
        monkeypatch.setattr(usage, "record", lambda uid, **counters: recorded.append(counters))
        _use_llm(monkeypatch, chat_module, FakeLLM('{"query": "SELECT COUNT(*) AS n FROM data"}'))
        client.post("/chat", json={"file_id": "f1", "message": "how many rows?"})
        assert recorded == [{"chat_requests": 1}]

    def test_question_retries_once_with_the_error(self, client, transform_seams, monkeypatch):
        llm = FakeLLM(
            '{"query": "SELECT COUNT(*) AS n FROM data WHERE nope > 1"}',
            '{"query": "SELECT COUNT(*) AS n FROM data WHERE a > 1"}',
        )
        _use_llm(monkeypatch, chat_module, llm)
        resp = client.post("/chat", json={"file_id": "f1", "message": "how many over 1?"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["message"] == "n: 2"
        assert len(llm.calls) == 2
        assert "nope" in llm.calls[1][1]

    def test_question_that_cannot_run_says_so(self, client, transform_seams, monkeypatch):
        _use_llm(monkeypatch, chat_module, FakeLLM(
            '{"query": "SELECT nope FROM data"}', '{"query": "SELECT still_nope FROM data"}',
        ))
        resp = client.post("/chat", json={"file_id": "f1", "message": "what is nope?"})
        assert resp.status_code == 400
        assert resp.json()["code"] == "ANSWER_FAILED"
        assert "nope" not in resp.json()["message"], "no engine text in the reply"

    def test_question_query_is_validated_read_only(self, client, transform_seams, monkeypatch):
        _use_llm(monkeypatch, chat_module, FakeLLM('{"query": "DROP TABLE data"}'))
        resp = client.post("/chat", json={"file_id": "f1", "message": "drop it"})
        assert resp.status_code == 400
        assert resp.json()["code"] == "INVALID_SQL"

    def test_get_history_requires_ownership(self, client, transform_seams):
        resp = client.get("/chat/ghost")
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

    def test_a_link_is_fetched_and_ingested_like_a_drop(self, client, upload_seams, monkeypatch):
        seen = {}

        def _fetch(url, **kw):
            seen["url"] = url
            return b"item,cost\nx,1\ny,2\n", "orders.csv"

        monkeypatch.setattr(upload_module, "fetch_bytes", _fetch)
        resp = client.post("/upload/url", json={"url": "docs.google.com/spreadsheets/d/1AbC/edit#gid=3"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert seen["url"] == "https://docs.google.com/spreadsheets/d/1AbC/export?format=csv&gid=3"
        assert body["name"] == "orders.csv"
        assert body["preview"]["columns"] == ["item", "cost"] and body["preview"]["total_rows"] == 2

    def test_a_bad_link_answers_with_its_reason(self, client, upload_seams, monkeypatch):
        from app.fetch_url import FetchError

        def _fetch(url, **kw):
            raise FetchError("PRIVATE_HOST", "That link points inside a private network.")

        monkeypatch.setattr(upload_module, "fetch_bytes", _fetch)
        resp = client.post("/upload/url", json={"url": "http://10.0.0.1/x.csv"})
        assert resp.status_code == 400 and resp.json()["code"] == "PRIVATE_HOST"
        assert client.post("/upload/url", json={"nope": 1}).status_code == 400

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

    def _ask(self, client, xlsx: bytes, name: str = "book.xlsx") -> dict:
        first = client.post(
            "/upload", content=xlsx,
            headers={"X-Filename": name, "Content-Type": "application/octet-stream"},
        )
        assert first.status_code == 200, first.text
        return first.json()

    def test_the_sheet_question_carries_row_counts_and_the_cap(self, client, upload_seams):
        body = self._ask(client, _multi_sheet_xlsx())
        assert body["sheet_rows"] == {"Sales": 1, "Costs": 1}
        assert body["max_sheets"] == upload_module.MAX_SHEETS

    def test_one_sheet_is_named_for_it_and_sized_as_kept(self, client, upload_seams, monkeypatch):
        from app import db

        made: list[dict] = []
        monkeypatch.setattr(db, "create_file", lambda **kw: made.append(kw) or kw)
        xlsx = _multi_sheet_xlsx()
        pending = self._ask(client, xlsx, "sales_q3.xlsx")["file_id"]
        r = client.post(f"/upload?pending_id={pending}&sheet_names=Costs")
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "sales_q3 - Costs.xlsx"
        assert made[0]["name"] == "sales_q3 - Costs.xlsx"
        # The sheet that was kept, not the whole workbook
        assert made[0]["size_bytes"] < len(xlsx)

    def test_several_sheets_become_files_and_count_as_one_upload(self, client, upload_seams, monkeypatch):
        from app import db, usage

        made: list[dict] = []
        counted: list[dict] = []
        monkeypatch.setattr(db, "create_file", lambda **kw: made.append(kw) or kw)
        monkeypatch.setattr(usage, "record", lambda user, **kw: counted.append(kw))
        pending = self._ask(client, _multi_sheet_xlsx(), "sales_q3.xlsx")["file_id"]
        r = client.post(f"/upload?pending_id={pending}&sheet_names=Sales&sheet_names=Costs")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["workbook"] == "sales_q3.xlsx" and body["failed"] == []
        assert [f["name"] for f in body["files"]] == ["sales_q3 - Sales.xlsx", "sales_q3 - Costs.xlsx"]
        assert [f["rows"] for f in body["files"]] == [1, 1]
        assert len({f["file_id"] for f in body["files"]}) == 2
        assert [m["name"] for m in made] == ["sales_q3 - Sales.xlsx", "sales_q3 - Costs.xlsx"]
        assert counted == [{"uploads": 1, "rows_processed": 2}]
        # The stash has served its purpose
        assert client.post(f"/upload?pending_id={pending}&sheet_names=Sales").status_code == 410

    def test_a_sheet_that_will_not_read_is_reported_and_the_rest_kept(self, client, upload_seams, monkeypatch):
        real = upload_module.convert_to_parquet

        def _convert(data, filename, *, sheet_name=None):
            if sheet_name == "Costs":
                raise upload_module.UnreadableFileError("That sheet has no table in it.")
            return real(data, filename, sheet_name=sheet_name)

        monkeypatch.setattr(upload_module, "convert_to_parquet", _convert)
        pending = self._ask(client, _multi_sheet_xlsx())["file_id"]
        body = client.post(f"/upload?pending_id={pending}&sheet_names=Sales&sheet_names=Costs").json()
        assert [f["sheet"] for f in body["files"]] == ["Sales"]
        assert body["failed"] == [{"sheet": "Costs", "message": "That sheet has no table in it."}]

    def test_an_unknown_sheet_or_too_many_is_400(self, client, upload_seams, monkeypatch):
        pending = self._ask(client, _multi_sheet_xlsx())["file_id"]
        r = client.post(f"/upload?pending_id={pending}&sheet_names=Sales&sheet_names=Nope")
        assert r.status_code == 400 and r.json()["code"] == "UNKNOWN_SHEET"
        monkeypatch.setattr(upload_module, "MAX_SHEETS", 1)
        r = client.post(f"/upload?pending_id={pending}&sheet_names=Sales&sheet_names=Costs")
        assert r.status_code == 400 and r.json()["code"] == "TOO_MANY_SHEETS"

    def test_empty_upload_400(self, client, upload_seams):
        resp = client.post(
            "/upload", content=b"",
            headers={"X-Filename": "x.csv",
                     "Content-Type": "application/octet-stream"},
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "EMPTY_FILE"


# ── /feedback ─────────────────────────────────────────────────────────


class TestFeedback:
    def test_feedback_recorded_as_event(self, client, monkeypatch):
        from app import events

        captured = {}

        def _record(user_id, event, **props):
            captured.update(user=user_id, event=event, **props)

        monkeypatch.setattr(events, "record", _record)
        resp = client.post("/feedback", json={
            "message": "  Love the recipes feature!  ",
            "email": "fan@example.com",
            "path": "/workspace",
        })
        assert resp.status_code == 200
        assert resp.json() == {"received": True}
        assert captured["event"] == "feedback"
        assert captured["message"] == "Love the recipes feature!"
        assert captured["email"] == "fan@example.com"
        assert captured["path"] == "/workspace"

    def test_empty_message_400(self, client):
        resp = client.post("/feedback", json={"message": "   "})
        assert resp.status_code == 400
        assert resp.json()["code"] == "MISSING_MESSAGE"

    def test_too_long_message_400(self, client):
        resp = client.post("/feedback", json={"message": "x" * 2001})
        assert resp.status_code == 400
        assert resp.json()["code"] == "MESSAGE_TOO_LONG"

    def test_feedback_rate_limited(self, client, monkeypatch):
        from app import events
        from app.routes import feedback as feedback_module

        monkeypatch.setattr(events, "record", lambda *a, **kw: None)
        for _ in range(feedback_module._FEEDBACK_RATE_MAX):
            assert client.post("/feedback", json={"message": "hi"}).status_code == 200
        resp = client.post("/feedback", json={"message": "hi again"})
        assert resp.status_code == 429
