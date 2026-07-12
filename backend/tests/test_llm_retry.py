"""LLM retry/backoff — bounded retry on transient provider failures only."""

from __future__ import annotations

import pytest

from app.llm import adapter
from app.llm.adapter import call_with_retry, is_retryable


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr(adapter.time, "sleep", sleeps.append)
    return sleeps


class _CodeError(Exception):
    def __init__(self, code: int):
        self.code = code
        super().__init__(f"error {code}")


class _ResponseError(Exception):
    """Mimics httpx.HTTPStatusError's .response.status_code shape."""

    def __init__(self, status_code: int):
        self.response = type("R", (), {"status_code": status_code})()
        super().__init__(f"http {status_code}")


# ── is_retryable ──────────────────────────────────────────────────────


@pytest.mark.parametrize("code", [429, 500, 502, 503])
def test_retryable_codes(code):
    assert is_retryable(_CodeError(code))
    assert is_retryable(_ResponseError(code))


@pytest.mark.parametrize("code", [400, 401, 403, 404])
def test_non_retryable_codes(code):
    assert not is_retryable(_CodeError(code))
    assert not is_retryable(_ResponseError(code))


def test_retryable_by_message():
    assert is_retryable(Exception("RESOURCE_EXHAUSTED: quota"))
    assert is_retryable(Exception("model is UNAVAILABLE right now"))
    assert not is_retryable(Exception("invalid api key"))


# ── call_with_retry ───────────────────────────────────────────────────


def test_transient_failure_then_success(_no_sleep):
    calls = []

    def _fn():
        calls.append(1)
        if len(calls) == 1:
            raise _CodeError(429)
        return "ok"

    assert call_with_retry(_fn) == "ok"
    assert len(calls) == 2
    assert _no_sleep == [2.0]  # backed off once


def test_non_retryable_raises_immediately(_no_sleep):
    calls = []

    def _fn():
        calls.append(1)
        raise _CodeError(401)

    with pytest.raises(_CodeError):
        call_with_retry(_fn)
    assert len(calls) == 1
    assert _no_sleep == []


def test_bounded_attempts(_no_sleep):
    calls = []

    def _fn():
        calls.append(1)
        raise _CodeError(503)

    with pytest.raises(_CodeError):
        call_with_retry(_fn)
    assert len(calls) == 2  # one retry, then surface the error


def test_success_needs_no_retry(_no_sleep):
    assert call_with_retry(lambda: 42) == 42
    assert _no_sleep == []
