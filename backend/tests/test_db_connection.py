"""A pooled Supabase connection the server closed is sent again: always when
no answer came back, and only for a request safe to repeat when the answer
was cut off partway."""

import gzip

import httpx
import pytest

from app import db
from app.db import _RetryClosedConnection, _retry_closed_connections


@pytest.fixture(autouse=True)
def _no_backoff(monkeypatch):
    monkeypatch.setattr(_RetryClosedConnection, "BACKOFF_SECONDS", 0)


class _Flaky(httpx.BaseTransport):
    """Drops the connection before answering, `failures` times."""

    def __init__(self, failures: int):
        self.failures = failures
        self.calls = 0

    def handle_request(self, request):
        self.calls += 1
        if self.calls <= self.failures:
            raise httpx.RemoteProtocolError("Server disconnected", request=request)
        return httpx.Response(200, json={"ok": True}, request=request)


class _CutOff(httpx.SyncByteStream):
    def __iter__(self):
        yield b'{"o'
        raise httpx.RemoteProtocolError("Server disconnected")


class _CutOffOnce(httpx.BaseTransport):
    """Answers, then drops the connection partway through the first body."""

    def __init__(self):
        self.calls = 0

    def handle_request(self, request):
        self.calls += 1
        if self.calls == 1:
            return httpx.Response(200, headers={"content-type": "application/json"}, stream=_CutOff(), request=request)
        return httpx.Response(200, json={"ok": True}, request=request)


def test_a_closed_connection_is_sent_again():
    inner = _Flaky(failures=1)
    client = httpx.Client(transport=_RetryClosedConnection(inner))
    assert client.post("https://x.test/rest/v1/files", json={"a": 1}).json() == {"ok": True}
    assert inner.calls == 2


def test_several_drops_in_a_row_are_ridden_out():
    inner = _Flaky(failures=2)
    client = httpx.Client(transport=_RetryClosedConnection(inner))
    assert client.get("https://x.test/rest/v1/files").json() == {"ok": True}
    assert inner.calls == 3


def test_it_does_not_retry_forever():
    inner = _Flaky(failures=_RetryClosedConnection.ATTEMPTS)
    client = httpx.Client(transport=_RetryClosedConnection(inner))
    with pytest.raises(httpx.RemoteProtocolError):
        client.get("https://x.test/rest/v1/files")
    assert inner.calls == _RetryClosedConnection.ATTEMPTS


def test_a_read_cut_off_partway_is_sent_again():
    inner = _CutOffOnce()
    client = httpx.Client(transport=_RetryClosedConnection(inner))
    r = client.get("https://x.test/rest/v1/files")
    assert r.json() == {"ok": True}
    assert r.elapsed.total_seconds() >= 0
    assert inner.calls == 2


def test_a_write_cut_off_partway_is_not_sent_twice():
    # The server answered, so the insert happened: sending it again could add it twice
    inner = _CutOffOnce()
    client = httpx.Client(transport=_RetryClosedConnection(inner))
    with pytest.raises(httpx.RemoteProtocolError):
        client.post("https://x.test/rest/v1/files", json={"a": 1})
    assert inner.calls == 1


def test_a_compressed_body_still_reads():
    body = gzip.compress(b'{"ok": true}')

    class _Gzip(httpx.BaseTransport):
        def handle_request(self, request):
            return httpx.Response(200, headers={"content-encoding": "gzip", "content-type": "application/json"}, content=body, request=request)

    client = httpx.Client(transport=_RetryClosedConnection(_Gzip()))
    assert client.get("https://x.test/rest/v1/files").json() == {"ok": True}


def test_wrapping_twice_keeps_one_layer():
    client = httpx.Client()
    _retry_closed_connections(client)
    _retry_closed_connections(client)
    assert isinstance(client._transport, _RetryClosedConnection)
    assert not isinstance(client._transport._inner, _RetryClosedConnection)


def test_the_database_storage_and_auth_clients_all_retry(monkeypatch):
    monkeypatch.setattr(db, "_client", None)
    monkeypatch.setattr(db, "SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setattr(db, "SUPABASE_SERVICE_KEY", "a.b.c")
    client = db.get_client()
    for session in (client.postgrest.session, client.storage.session, client.auth._http_client):
        assert isinstance(session._transport, _RetryClosedConnection)
    assert client.auth.admin._http_client is client.auth._http_client
