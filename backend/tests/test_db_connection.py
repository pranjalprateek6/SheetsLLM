"""A pooled Supabase connection the server closed is retried, once."""

import httpx
import pytest

from app.db import _RetryClosedConnection, _retry_closed_connections


class _Flaky(httpx.BaseTransport):
    def __init__(self, failures: int):
        self.failures = failures
        self.calls = 0

    def handle_request(self, request):
        self.calls += 1
        if self.calls <= self.failures:
            raise httpx.RemoteProtocolError("Server disconnected", request=request)
        return httpx.Response(200, json={"ok": True}, request=request)


def test_a_closed_connection_is_retried_once():
    inner = _Flaky(failures=1)
    client = httpx.Client(transport=_RetryClosedConnection(inner))
    assert client.post("https://x.test/rest/v1/files", json={"a": 1}).json() == {"ok": True}
    assert inner.calls == 2


def test_it_does_not_retry_forever():
    inner = _Flaky(failures=2)
    client = httpx.Client(transport=_RetryClosedConnection(inner))
    with pytest.raises(httpx.RemoteProtocolError):
        client.get("https://x.test/rest/v1/files")
    assert inner.calls == 2


def test_wrapping_twice_keeps_one_layer():
    client = httpx.Client()
    _retry_closed_connections(client)
    _retry_closed_connections(client)
    assert isinstance(client._transport, _RetryClosedConnection)
    assert not isinstance(client._transport._inner, _RetryClosedConnection)
