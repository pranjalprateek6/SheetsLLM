"""Backend for phases 2 to 6: history deltas, redo, file states, recipe list
fields, chat errors and receipts, the usage payload, the waitlist, exports."""

from __future__ import annotations

import asyncio
import datetime as dt
import types

import duckdb
import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import cache, db, events, usage
from app.llm.errors import is_quota_error
from app.llm.prompts import sent_receipt
from app.main import app
from app.routes import billing as billing_route
from app.routes import chat as chat_module
from app.routes import download as download_module
from app.routes import files as files_module
from app.routes import transform as transform_module
from app.routes.chat import done_message
from app.routes.files import with_deltas

F1 = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def parquet(tmp_path):
    path = tmp_path / "data.parquet"
    duckdb.connect().execute(
        "COPY (SELECT * FROM (VALUES (1, 'x'), (2, 'y'), (2, 'y'), (3, 'z')) t(a, b)) "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return str(path)


@pytest.fixture
def seams(monkeypatch, parquet):
    """A file with an in-memory step store, chat log, audit log and events."""
    st = types.SimpleNamespace(steps=[], messages=[], audit=[], events=[], usage=[])
    file_rec = {"id": F1, "user_id": "anonymous", "r2_key": "k", "name": "d.csv", "row_count": 4,
                "column_count": 2, "schema_json": {"columns": [{"name": "a", "dtype": "INTEGER"},
                                                               {"name": "b", "dtype": "VARCHAR"}]}}
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    monkeypatch.setattr(db, "get_file", lambda fid, uid: file_rec if fid == F1 else None)
    monkeypatch.setattr(db, "get_transformations", lambda fid: list(st.steps))
    monkeypatch.setattr(db, "get_next_step_number", lambda fid: len(st.steps) + 1)
    monkeypatch.setattr(db, "create_transformation", lambda **kw: st.steps.append(kw) or kw)
    monkeypatch.setattr(db, "update_file", lambda *a, **kw: {})
    monkeypatch.setattr(db, "create_audit_entry", lambda **kw: st.audit.append(kw) or kw)
    monkeypatch.setattr(db, "create_chat_message", lambda **kw: st.messages.append(kw) or kw)
    monkeypatch.setattr(db, "get_chat_messages", lambda fid, limit=None: [])
    monkeypatch.setattr(db, "get_upload_row_count", lambda fid: 4)
    monkeypatch.setattr(db, "get_privacy_mode", lambda uid: True)
    for target in (cache, transform_module, chat_module, files_module, download_module):
        monkeypatch.setattr(target, "get_local_parquet", lambda key: parquet, raising=False)
    monkeypatch.setattr(usage, "enforce", lambda *a, **kw: None)
    monkeypatch.setattr(usage, "record", lambda uid, **c: st.usage.append(c))
    monkeypatch.setattr(events, "record", lambda uid, name, **p: st.events.append((name, p)))
    with cache._sql_lock:
        cache._sql_cache.clear()
    st.client = TestClient(app, raise_server_exceptions=False)
    st.file = file_rec
    return st


class LLM:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []

    def generate_sql(self, system, user):
        self.calls.append(user)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


# ── 5.2 history: deltas, source, original rows ───────────────────────


def test_with_deltas_compares_each_step_to_the_one_before():
    steps = [
        {"step_number": 1, "columns_after": ["a", "b", "Profit"], "explain": None},
        {"step_number": 2, "columns_after": None, "explain": "recipe: Monthly"},
        {"step_number": 3, "columns_after": ["a", "Profit"], "explain": "op: drop_column"},
    ]
    out = with_deltas(steps, ["a", "b"])
    assert (out[0]["columns_added"], out[0]["columns_removed"]) == (["Profit"], [])
    assert out[1]["columns_added"] is None  # not recorded, so unknown, never guessed
    assert (out[2]["columns_added"], out[2]["columns_removed"]) == ([], ["b"])
    assert [s["source"] for s in out] == ["llm", "recipe", "op"]


def test_history_has_deltas_and_original_rows(seams):
    seams.steps.append({"step_number": 1, "instruction": "x", "sql_query": "SELECT *, 1 AS c FROM data",
                        "columns_after": ["a", "b", "c"], "row_count_after": 4})
    body = seams.client.get(f"/files/{F1}/history").json()
    assert body["original_row_count"] == 4
    assert body["base_columns"] == ["a", "b"]
    assert body["steps"][0]["columns_added"] == ["c"]


# ── 5.3 redo ─────────────────────────────────────────────────────────


def test_post_step_validates_and_replays(seams):
    resp = seams.client.post(f"/files/{F1}/steps", json={"instruction": "Remove duplicate rows",
                                                         "sql": "SELECT DISTINCT * FROM data"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["preview"]["total_rows"] == 3
    assert seams.steps[0]["explain"] == "redo" and seams.steps[0]["sent"] == {"source": "redo"}
    assert seams.usage == [{"transforms": 1, "rows_processed": 3}]


def test_post_step_rejects_non_select(seams):
    resp = seams.client.post(f"/files/{F1}/steps", json={"instruction": "x", "sql": "DROP TABLE data"})
    assert resp.status_code == 400 and resp.json()["code"] == "INVALID_SQL"
    assert seams.steps == []


def test_post_step_unknown_file_404(seams):
    resp = seams.client.post("/files/undefined/steps", json={"instruction": "x", "sql": "SELECT 1"})
    assert resp.status_code == 404


# ── 2.5 file states in a fixed number of queries ─────────────────────


class _Recording:
    """A fake Supabase client that counts queries and serves fixed rows."""

    def __init__(self, tables):
        self.tables = tables
        self.queries = 0

    def table(self, name):
        client = self

        class Q:
            def __getattr__(self, attr):
                return lambda *a, **k: self

            def execute(self):
                client.queries += 1
                return types.SimpleNamespace(data=client.tables.get(name, []), count=None)
        return Q()


def test_file_states_take_two_queries_for_any_number_of_files(monkeypatch):
    ids = [f"00000000-0000-0000-0000-{i:012d}" for i in range(50)]
    fake = _Recording({
        "transformations": [
            {"file_id": ids[0], "step_number": 1, "explain": None},
            {"file_id": ids[0], "step_number": 2, "explain": "recipe: Monthly orders"},
        ],
        "audit_log": [
            {"file_id": ids[0], "action": "upload", "metadata": {"row_count": 10000}, "created_at": "2026-09-01"},
            {"file_id": ids[0], "action": "download", "metadata": {}, "created_at": "2026-09-03"},
            {"file_id": ids[0], "action": "download", "metadata": {}, "created_at": "2026-09-02"},
        ],
    })
    monkeypatch.setattr(db, "get_client", lambda: fake)
    states = db.file_states(ids)
    assert fake.queries == 2
    assert states[ids[0]] == {"step_count": 2, "recipe_name": "Monthly orders",
                              "last_exported_at": "2026-09-03", "original_row_count": 10000}
    assert states[ids[1]]["step_count"] == 0


# ── 2.3 recipe list fields ───────────────────────────────────────────


def test_list_includes_source_name_and_required_columns(seams, monkeypatch):
    monkeypatch.setattr(db, "list_recipes", lambda uid: [{
        "id": "r1", "name": "Monthly", "steps": [{}, {}], "source_file_id": F1,
        "required_columns": [{"name": "a", "dtype": "INTEGER"}, {"name": "b", "dtype": "VARCHAR"}],
    }])
    monkeypatch.setattr(db, "file_names", lambda ids: {F1: "orders_oct.csv"})
    r = seams.client.get("/recipes").json()["recipes"][0]
    assert r["source_file_name"] == "orders_oct.csv"
    assert r["required_columns"] == ["a", "b"]
    assert r["steps"] == 2


# ── 6.1 chat errors, persisted, with codes ───────────────────────────


def test_quota_maps_to_LLM_QUOTA_and_is_kept_in_the_chat(seams, monkeypatch):
    monkeypatch.setattr(chat_module, "get_llm",
                        lambda: LLM(Exception("429 RESOURCE_EXHAUSTED: daily quota exceeded")))
    resp = seams.client.post("/chat", json={"file_id": F1, "message": "add a column"})
    assert resp.status_code == 503 and resp.json()["code"] == "LLM_QUOTA"
    assert "recipes" in resp.json()["message"]
    assert seams.messages[-1]["message_type"] == "error"
    assert seams.messages[-1]["metadata"] == {"code": "LLM_QUOTA"}
    assert ("llm_quota_hit", {}) in seams.events


def test_other_llm_failure_is_LLM_FAILED_and_kept(seams, monkeypatch):
    monkeypatch.setattr(chat_module, "get_llm", lambda: LLM(Exception("connection reset")))
    resp = seams.client.post("/chat", json={"file_id": F1, "message": "add a column"})
    assert resp.status_code == 502 and resp.json()["code"] == "LLM_FAILED"
    assert seams.messages[-1]["metadata"] == {"code": "LLM_FAILED"}


def test_invalid_sql_is_kept_in_the_chat(seams, monkeypatch):
    monkeypatch.setattr(chat_module, "get_llm", lambda: LLM("DROP TABLE data"))
    resp = seams.client.post("/chat", json={"file_id": F1, "message": "drop it"})
    assert resp.json()["code"] == "INVALID_SQL"
    assert seams.messages[-1]["metadata"] == {"code": "INVALID_SQL"}


def test_usage_cap_answer_says_which_cap_and_when_it_resets(seams, monkeypatch):
    def capped(uid, action):
        raise usage.UsageLimitExceeded(action, 200, 200)
    monkeypatch.setattr(usage, "enforce", capped)
    body = seams.client.post("/chat", json={"file_id": F1, "message": "x"}).json()
    assert body["code"] == "USAGE_LIMIT_EXCEEDED"
    assert (body["action"], body["used"], body["limit"]) == ("chat_requests", 200, 200)
    assert body["resets_at"].endswith("-01")


# ── 4.2 the receipt, and the "Done" message ──────────────────────────


def test_step_records_what_was_sent_in_strict_mode(seams, monkeypatch):
    monkeypatch.setattr(chat_module, "get_llm", lambda: LLM("SELECT DISTINCT * FROM data"))
    body = seams.client.post("/chat", json={"file_id": F1, "message": "dedupe"}).json()
    assert body["sent"] == {"source": "llm", "mode": "strict", "columns_sent": ["a", "b"],
                            "sample_rows_sent": 0, "values_per_column": 0}
    assert seams.steps[0]["sent"] == body["sent"]
    assert seams.messages[-1]["metadata"]["sent"] == body["sent"]
    assert body["message"] == "Done. 4 → 3 rows"
    assert ("chat_sent", {"kind": "transform"}) in seams.events


def test_step_records_samples_when_off(seams, monkeypatch):
    monkeypatch.setattr(db, "get_privacy_mode", lambda uid: False)
    monkeypatch.setattr(chat_module, "get_llm", lambda: LLM("SELECT DISTINCT * FROM data"))
    body = seams.client.post("/chat", json={"file_id": F1, "message": "dedupe"}).json()
    assert body["sent"]["mode"] == "samples"
    assert body["sent"]["sample_rows_sent"] == 3
    assert body["sent"]["values_per_column"] == 3


def test_receipt_never_holds_values():
    schema = {"columns": [{"name": "salary", "dtype": "BIGINT", "sample_values": ["93000"]}],
              "samples": [["93000"]]}
    receipt = sent_receipt(schema, privacy_mode=False)
    assert "93000" not in str(receipt)


def test_cache_hit_records_no_ai_call(seams, monkeypatch):
    llm = LLM("SELECT DISTINCT * FROM data")
    monkeypatch.setattr(transform_module, "get_llm", lambda: llm)
    schema = {"columns": [{"name": "a", "dtype": "INTEGER"}]}
    first, second = {}, {}
    transform_module._generate_or_cache_sql("u1", "dedupe", schema, meta=first)
    transform_module._generate_or_cache_sql("u1", "dedupe", schema, meta=second)
    assert first == {} and second == {"cache": True}
    assert len(llm.calls) == 1


def test_done_message():
    assert done_message(4982, 4120, ["a"], ["a"]) == "Done. 4,982 → 4,120 rows"
    assert done_message(10, 10, ["a", "Notes"], ["a", "Profit"]) == "Done. 10 rows · +Profit · −Notes"


def test_insight_in_strict_mode_says_so(seams, monkeypatch):
    monkeypatch.setattr(chat_module, "get_llm", lambda: LLM('{"insight": "a has 3 values."}'))
    body = seams.client.post("/chat", json={"file_id": F1, "message": "how many a?"}).json()
    assert body["type"] == "insight" and body["strict"] is True


def test_quota_classifier():
    assert is_quota_error(Exception("429 RESOURCE_EXHAUSTED"))
    assert is_quota_error(Exception("You exceeded your current quota"))
    assert not is_quota_error(Exception("connection reset by peer"))


# ── 6.2 one meter, and the reset date ────────────────────────────────


def test_resets_at_rolls_the_year():
    assert usage.resets_at(dt.datetime(2026, 12, 15, tzinfo=dt.timezone.utc)) == "2027-01-01"
    assert usage.resets_at(dt.datetime(2026, 10, 9, tzinfo=dt.timezone.utc)) == "2026-11-01"


def test_summary_has_one_ai_meter(monkeypatch):
    monkeypatch.setattr(usage.db, "get_subscription", lambda uid: None)
    monkeypatch.setattr(usage.db, "get_usage", lambda uid, m: {"chat_requests": 143, "transforms": 9})
    monkeypatch.setattr(usage.db, "count_audit_actions", lambda *a: 0)
    monkeypatch.setattr(usage.db, "list_recipes", lambda uid: [])
    s = usage.summary("u1")
    assert s["ai_requests"] == {"used": 143, "limit": usage.TIER_LIMITS["free"]["chat_requests"]}
    assert s["resets_at"].endswith("-01")


# ── 6.3 the waitlist ─────────────────────────────────────────────────


def _req(user_id, body):
    async def _json():
        return body
    return types.SimpleNamespace(state=types.SimpleNamespace(user_id=user_id), json=_json)


def test_waitlist_event_recorded(monkeypatch):
    got = []
    monkeypatch.setattr(events, "record", lambda uid, name, **p: got.append((uid, name, p)))
    resp = asyncio.run(billing_route.join_waitlist(_req("u1", {"reason": "recipes"})))
    assert resp == {"joined": True}
    assert got == [("u1", "waitlist_joined", {"reason": "recipes"})]


def test_waitlist_ignores_unknown_reasons(monkeypatch):
    got = []
    monkeypatch.setattr(events, "record", lambda uid, name, **p: got.append(p))
    asyncio.run(billing_route.join_waitlist(_req("u1", {"reason": "<script>"})))
    assert got == [{"reason": None}]


def test_waitlist_needs_a_real_user():
    resp = asyncio.run(billing_route.join_waitlist(_req("anonymous", {})))
    assert resp.status_code == 401


# ── Exports are recorded; previews are not ───────────────────────────


def test_export_is_recorded_with_its_steps(seams):
    seams.client.get(f"/download?file_id={F1}&format=csv")
    assert [a["action"] for a in seams.audit] == ["download"]
    assert ("export_completed", {"format": "csv", "steps": 0}) in seams.events


def test_preview_is_not_an_export(seams):
    resp = seams.client.get(f"/download?file_id={F1}&format=json&purpose=preview")
    assert resp.status_code == 200
    assert seams.audit == []
    assert not any(name == "export_completed" for name, _ in seams.events)
