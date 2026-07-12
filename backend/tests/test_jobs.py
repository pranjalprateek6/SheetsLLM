"""Job store: in-memory lifecycle, Supabase write-through, restart recovery."""

from __future__ import annotations

import time
import uuid
from types import SimpleNamespace

import pytest

from app import jobs


# ── Fakes ─────────────────────────────────────────────────────────────


class FakeQuery:
    """Chainable stand-in for a postgrest query builder."""

    def __init__(self, table: "FakeTable", op: str, payload=None):
        self.table = table
        self.op = op
        self.payload = payload
        self.filters: list[tuple] = []

    def eq(self, col, val):
        self.filters.append(("eq", col, val))
        return self

    def lt(self, col, val):
        self.filters.append(("lt", col, val))
        return self

    def in_(self, col, vals):
        self.filters.append(("in", col, vals))
        return self

    def limit(self, n):
        return self

    def execute(self):
        self.table.calls.append(self)
        if self.op == "select":
            return SimpleNamespace(data=list(self.table.rows))
        return SimpleNamespace(data=[])


class FakeTable:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.calls: list[FakeQuery] = []

    def insert(self, payload):
        return FakeQuery(self, "insert", payload)

    def update(self, payload):
        return FakeQuery(self, "update", payload)

    def select(self, *_cols):
        return FakeQuery(self, "select")

    def delete(self):
        return FakeQuery(self, "delete")

    def ops(self, op):
        return [c for c in self.calls if c.op == op]


@pytest.fixture(autouse=True)
def _clean_store():
    with jobs._lock:
        jobs._jobs.clear()
    yield
    with jobs._lock:
        jobs._jobs.clear()


@pytest.fixture
def fake_table(monkeypatch):
    table = FakeTable()
    monkeypatch.setattr(jobs, "_table", lambda: table)
    return table


@pytest.fixture
def no_db(monkeypatch):
    """Simulate pre-migration / Supabase-down: every DB call raises."""
    def _boom():
        raise RuntimeError("supabase unavailable")
    monkeypatch.setattr(jobs, "_table", _boom)


def _db_row(job_id, status="processing", user_id="u1", **extra):
    row = {
        "id": job_id,
        "user_id": user_id,
        "action": "transform",
        "status": status,
        "progress": 30,
        "result": None,
        "error": None,
        "metadata": {"file_id": "f1"},
        "created_at": "2026-07-12T10:00:00+00:00",
        "updated_at": "2026-07-12T10:01:00+00:00",
    }
    row.update(extra)
    return row


# ── In-memory lifecycle (fail-open when Supabase is unavailable) ─────


class TestInMemoryLifecycle:
    def test_full_lifecycle_without_db(self, no_db):
        job_id = jobs.create_job("u1", "transform", metadata={"file_id": "f1"})
        job = jobs.get_job(job_id, user_id="u1")
        assert job["status"] == "processing"
        assert job["metadata"] == {"file_id": "f1"}

        jobs.update_job(job_id, progress=50)
        assert jobs.get_job(job_id)["progress"] == 50

        jobs.complete_job(job_id, {"rows": 10})
        job = jobs.get_job(job_id)
        assert job["status"] == "completed"
        assert job["progress"] == 100
        assert job["result"] == {"rows": 10}

    def test_fail_job_without_db(self, no_db):
        job_id = jobs.create_job("u1", "transform")
        jobs.fail_job(job_id, "boom")
        job = jobs.get_job(job_id)
        assert job["status"] == "failed"
        assert job["error"] == "boom"

    def test_ownership_enforced(self, no_db):
        job_id = jobs.create_job("u1", "transform")
        assert jobs.get_job(job_id, user_id="u2") is None
        assert jobs.get_job(job_id, user_id="u1") is not None

    def test_unknown_job_returns_none(self, no_db):
        assert jobs.get_job("nope") is None

    def test_sweep_and_evict_fail_open(self, no_db):
        jobs.sweep_orphaned()  # must not raise
        assert jobs.evict_expired() == 0

    def test_evict_removes_old_completed(self, no_db):
        job_id = jobs.create_job("u1", "transform")
        jobs.complete_job(job_id, {"ok": True})
        with jobs._lock:
            jobs._jobs[job_id]["updated_at"] = time.time() - jobs._JOB_TTL - 1
        assert jobs.evict_expired() == 1
        assert jobs.get_job(job_id) is None


# ── Write-through persistence ─────────────────────────────────────────


class TestWriteThrough:
    def test_create_inserts_row(self, fake_table):
        job_id = jobs.create_job("u1", "transform", metadata={"file_id": "f1"})
        inserts = fake_table.ops("insert")
        assert len(inserts) == 1
        assert inserts[0].payload["id"] == job_id
        assert inserts[0].payload["status"] == "processing"
        assert inserts[0].payload["metadata"] == {"file_id": "f1"}

    def test_update_writes_changed_fields(self, fake_table):
        job_id = jobs.create_job("u1", "transform")
        jobs.update_job(job_id, progress=70)
        updates = fake_table.ops("update")
        assert updates[-1].payload["progress"] == 70
        assert "status" not in updates[-1].payload
        assert ("eq", "id", job_id) in updates[-1].filters

    def test_complete_persists_result(self, fake_table):
        job_id = jobs.create_job("u1", "transform")
        jobs.complete_job(job_id, {"rows": 5})
        payload = fake_table.ops("update")[-1].payload
        assert payload["status"] == "completed"
        assert payload["result"] == {"rows": 5}

    def test_update_unknown_job_skips_db(self, fake_table):
        jobs.update_job("nope", progress=10)
        assert fake_table.ops("update") == []

    def test_sweep_marks_processing_failed(self, fake_table):
        jobs.sweep_orphaned()
        sweep = fake_table.ops("update")[-1]
        assert sweep.payload["status"] == "failed"
        assert sweep.payload["error"] == jobs.LOST_JOB_ERROR
        assert ("eq", "status", "processing") in sweep.filters

    def test_evict_deletes_old_rows(self, fake_table):
        jobs.evict_expired()
        deletes = fake_table.ops("delete")
        assert len(deletes) == 1
        kinds = [f[0] for f in deletes[0].filters]
        assert "in" in kinds and "lt" in kinds


# ── Restart recovery (memory miss → DB fallback) ──────────────────────


class TestRestartRecovery:
    def test_orphaned_processing_job_marked_failed(self, monkeypatch):
        jid = str(uuid.uuid4())
        table = FakeTable(rows=[_db_row(jid, status="processing")])
        monkeypatch.setattr(jobs, "_table", lambda: table)

        job = jobs.get_job(jid, user_id="u1")
        assert job["status"] == "failed"
        assert job["error"] == jobs.LOST_JOB_ERROR
        # And the persisted copy was flipped too, guarded on status
        mark = table.ops("update")[-1]
        assert mark.payload["status"] == "failed"
        assert ("eq", "id", jid) in mark.filters
        assert ("eq", "status", "processing") in mark.filters

    def test_completed_job_survives_restart(self, monkeypatch):
        jid = str(uuid.uuid4())
        table = FakeTable(rows=[
            _db_row(jid, status="completed", progress=100, result={"rows": 9}),
        ])
        monkeypatch.setattr(jobs, "_table", lambda: table)

        job = jobs.get_job(jid, user_id="u1")
        assert job["status"] == "completed"
        assert job["result"] == {"rows": 9}
        assert job["job_id"] == jid
        # ISO timestamps normalized to epoch floats like memory jobs
        assert isinstance(job["created_at"], float)
        assert table.ops("update") == []  # nothing to flip

    def test_recovered_job_cached_in_memory(self, monkeypatch):
        jid = str(uuid.uuid4())
        table = FakeTable(rows=[_db_row(jid, status="processing")])
        monkeypatch.setattr(jobs, "_table", lambda: table)

        first = jobs.get_job(jid, user_id="u1")
        assert first["status"] == "failed"
        selects_after_first = len(table.ops("select"))

        # Second poll must be served from memory — no further DB reads
        second = jobs.get_job(jid, user_id="u1")
        assert second["status"] == "failed"
        assert len(table.ops("select")) == selects_after_first

    def test_non_uuid_job_id_skips_db(self, monkeypatch):
        table = FakeTable(rows=[])
        monkeypatch.setattr(jobs, "_table", lambda: table)
        assert jobs.get_job("not-a-uuid") is None
        assert table.ops("select") == []

    def test_db_fallback_enforces_ownership(self, monkeypatch):
        jid = str(uuid.uuid4())
        table = FakeTable(rows=[_db_row(jid, user_id="someone-else")])
        monkeypatch.setattr(jobs, "_table", lambda: table)
        assert jobs.get_job(jid, user_id="u1") is None
