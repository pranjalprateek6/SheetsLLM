"""The scripted LLM used by tests and end-to-end runs."""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.llm import adapter, factory, fake
from app.llm.adapter import LlmError
from app.llm.fake import FakeLlm
from app import routes as routes_module


@pytest.fixture(autouse=True)
def _clean_call_log():
    fake.reset_calls()
    yield
    fake.reset_calls()


RULES = [
    {"match": "add column margin", "reply": 'SELECT *, "MRP" - "Landing Cost" AS "Margin" FROM data'},
    {"match": "__quota__", "reply": "__quota__"},
    {"match": "__invalid__", "reply": "__invalid__"},
]


# ── selection ─────────────────────────────────────────────────────────

def test_factory_returns_fake_when_configured(monkeypatch):
    monkeypatch.setattr(factory, "LLM_PROVIDER", "fake")
    monkeypatch.setattr(factory, "IS_PRODUCTION", False)
    assert isinstance(factory.get_llm(), FakeLlm)


def test_factory_refuses_fake_in_production(monkeypatch):
    monkeypatch.setattr(factory, "LLM_PROVIDER", "fake")
    monkeypatch.setattr(factory, "IS_PRODUCTION", True)
    with pytest.raises(ValueError, match="production"):
        factory.get_llm()


def test_shipped_rules_file_loads():
    rules = fake.load_rules()
    assert rules, "the default rules file must not be empty"
    assert all({"match", "reply"} <= set(r) for r in rules)


def test_rules_file_rejects_malformed_entries(tmp_path):
    bad = tmp_path / "rules.json"
    bad.write_text(json.dumps([{"match": "x"}]), encoding="utf-8")
    with pytest.raises(ValueError, match="rule 0"):
        fake.load_rules(bad)


# ── behaviour ─────────────────────────────────────────────────────────

def test_scripted_reply_is_matched_case_insensitively_and_logged():
    llm = FakeLlm(RULES)
    reply = llm.generate_sql("SYSTEM", "Schema: ...\n\nInstruction: Add Column Margin = MRP - Landing Cost")
    assert reply.startswith("SELECT *,")
    (call,) = fake.calls()
    assert call["matched"] == "add column margin"
    assert call["system_prompt_chars"] == len("SYSTEM")
    assert "Add Column Margin" in call["user_message"]


def test_unscripted_instruction_gets_a_clarification_not_sql():
    reply = FakeLlm(RULES).generate_sql("S", "do something nobody scripted")
    parsed = json.loads(reply)
    assert parsed["needs_clarification"] is True
    assert "question" in parsed


def test_quota_sentinel_raises_what_gemini_would():
    llm = FakeLlm(RULES)
    with pytest.raises(LlmError) as excinfo:
        llm.generate_sql("S", "__quota__")
    # Same marker the real client surfaces, so the routes' classification of
    # a quota failure is exercised for real, not for a made-up message.
    assert "RESOURCE_EXHAUSTED" in str(excinfo.value)
    assert adapter.is_retryable(excinfo.value)
    assert len(fake.calls()) == 1, "a failed call is still a call"


def test_the_match_latest_in_the_message_wins_over_history():
    """The chat route sends the conversation history before the current
    instruction, so a phrase from an earlier turn must not answer this one."""
    llm = FakeLlm(RULES)
    history_then_quota = (
        "Previous conversation:\nUser: add column margin\n"
        "Assistant: [executed SQL: SELECT ...]\n\nNew request:\nSchema ...\n__quota__"
    )
    with pytest.raises(LlmError):
        llm.generate_sql("S", history_then_quota)
    assert fake.calls()[-1]["matched"] == "__quota__"

    history_then_margin = (
        "Previous conversation:\nUser: __quota__\nAssistant: Chef is out of capacity\n\n"
        "New request:\nSchema ...\nadd column margin"
    )
    assert llm.generate_sql("S", history_then_margin).startswith("SELECT *,")
    assert fake.calls()[-1]["matched"] == "add column margin"


def test_invalid_sentinel_is_not_a_select():
    reply = FakeLlm(RULES).generate_sql("S", "__invalid__")
    assert not reply.strip().upper().startswith("SELECT")


def test_call_log_is_bounded():
    llm = FakeLlm(RULES)
    for i in range(fake.MAX_CALLS + 25):
        llm.generate_sql("S", f"unscripted {i}")
    recorded = fake.calls()
    assert len(recorded) == fake.MAX_CALLS
    assert recorded[-1]["user_message"].endswith(str(fake.MAX_CALLS + 24))


# ── the test-only route ───────────────────────────────────────────────

def test_calls_endpoint_lists_and_clears():
    from app.routes.fake_llm import router

    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    FakeLlm(RULES).generate_sql("S", "add column margin please")
    listed = client.get("/__fake_llm/calls").json()
    assert listed["count"] == 1
    assert listed["calls"][0]["matched"] == "add column margin"

    assert client.delete("/__fake_llm/calls").json() == {"count": 0}
    assert client.get("/__fake_llm/calls").json()["count"] == 0


@pytest.mark.parametrize("provider,expected", [("fake", 200), ("gemini", 404), ("openai", 404)])
def test_fake_router_is_registered_only_for_the_fake_provider(monkeypatch, provider, expected):
    monkeypatch.setattr(routes_module, "LLM_PROVIDER", provider)
    app = FastAPI()
    routes_module.register_routes(app)
    # Ask the app, not its route table: Starlette 1.7 stopped exposing .path
    # on included routes, which is how an earlier version of this test read
    # an empty set and failed in CI while passing locally.
    assert TestClient(app).get("/__fake_llm/calls").status_code == expected
