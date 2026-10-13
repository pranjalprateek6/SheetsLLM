"""A file from a link: what is accepted, what is refused, and why."""

from __future__ import annotations

import socket

import httpx
import pytest

from app import fetch_url
from app.fetch_url import FetchError, fetch_bytes, normalise_url


def _public(monkeypatch, mapping=None):
    mapping = mapping or {}

    def _resolve(host, port, *a, **kw):
        ip = mapping.get(host, "93.184.216.34")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]

    monkeypatch.setattr(socket, "getaddrinfo", _resolve)


# ── The link as pasted ───────────────────────────────────────────────


def test_a_google_sheet_link_becomes_its_csv_export():
    assert normalise_url("https://docs.google.com/spreadsheets/d/1AbC_d-9/edit?usp=sharing") == "https://docs.google.com/spreadsheets/d/1AbC_d-9/export?format=csv"
    assert normalise_url("https://docs.google.com/spreadsheets/d/1AbC/edit#gid=42") == "https://docs.google.com/spreadsheets/d/1AbC/export?format=csv&gid=42"
    assert normalise_url("docs.google.com/spreadsheets/d/1AbC/edit?gid=7") == "https://docs.google.com/spreadsheets/d/1AbC/export?format=csv&gid=7"


def test_a_bare_host_gets_https_and_blank_is_refused():
    assert normalise_url(" example.com/orders.csv ") == "https://example.com/orders.csv"
    with pytest.raises(FetchError) as exc:
        normalise_url("   ")
    assert exc.value.code == "BAD_URL"


# ── Where it may point ───────────────────────────────────────────────


@pytest.mark.parametrize("url", [
    "http://localhost:8000/health", "http://127.0.0.1/x.csv", "http://10.0.0.5/x.csv",
    "http://192.168.1.1/x.csv", "http://169.254.169.254/latest/meta-data", "http://backend.local/x",
])
def test_private_and_local_addresses_are_refused(monkeypatch, url):
    _public(monkeypatch, {"10.0.0.5": "10.0.0.5", "192.168.1.1": "192.168.1.1", "169.254.169.254": "169.254.169.254", "127.0.0.1": "127.0.0.1"})
    with pytest.raises(FetchError) as exc:
        fetch_bytes(url, client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"a,b\n"))))
    assert exc.value.code == "PRIVATE_HOST"


def test_a_public_name_that_resolves_privately_is_refused(monkeypatch):
    _public(monkeypatch, {"evil.example": "10.1.2.3"})
    with pytest.raises(FetchError) as exc:
        fetch_bytes("https://evil.example/x.csv", client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"a\n"))))
    assert exc.value.code == "PRIVATE_HOST"


def test_only_http_and_https(monkeypatch):
    _public(monkeypatch)
    with pytest.raises(FetchError) as exc:
        fetch_bytes("ftp://example.com/x.csv", client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200))))
    assert exc.value.code == "BAD_URL"


# ── The fetch ────────────────────────────────────────────────────────


def test_bytes_and_a_name_from_the_link(monkeypatch):
    _public(monkeypatch)
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"a,b\n1,2\n", headers={"content-type": "text/csv"})))
    data, name = fetch_bytes("https://example.com/exports/orders_oct.csv", client=client)
    assert data == b"a,b\n1,2\n" and name == "orders_oct.csv"


def test_a_name_from_the_header_or_the_content_type(monkeypatch):
    _public(monkeypatch)
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"x", headers={"content-disposition": 'attachment; filename="report.xlsx"'})))
    assert fetch_bytes("https://example.com/download?id=9", client=client)[1] == "report.xlsx"
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"x", headers={"content-type": "application/json; charset=utf-8"})))
    assert fetch_bytes("https://example.com/api/rows", client=client)[1] == "rows.json"
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"x", headers={"content-type": "text/csv"})))
    assert fetch_bytes("https://docs.google.com/spreadsheets/d/1A/export?format=csv", client=client)[1] == "sheet.csv"


def test_redirects_are_followed_by_hand_and_each_hop_checked(monkeypatch):
    _public(monkeypatch, {"internal.example": "10.0.0.9"})
    hops = []

    def handler(request: httpx.Request):
        hops.append(str(request.url))
        if request.url.host == "example.com":
            return httpx.Response(302, headers={"location": "https://cdn.example/file.csv"})
        return httpx.Response(200, content=b"ok\n")

    client = httpx.Client(transport=httpx.MockTransport(handler))
    data, name = fetch_bytes("https://example.com/go", client=client)
    assert data == b"ok\n" and name == "file.csv" and len(hops) == 2

    def to_private(request: httpx.Request):
        return httpx.Response(302, headers={"location": "http://internal.example/secret.csv"}) if request.url.host == "example.com" else httpx.Response(200, content=b"no")

    with pytest.raises(FetchError) as exc:
        fetch_bytes("https://example.com/go", client=httpx.Client(transport=httpx.MockTransport(to_private)))
    assert exc.value.code == "PRIVATE_HOST"


def test_too_large_is_stopped_while_it_arrives(monkeypatch):
    _public(monkeypatch)
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"x" * 2000)))
    with pytest.raises(FetchError) as exc:
        fetch_bytes("https://example.com/big.csv", max_bytes=1000, client=client)
    assert exc.value.code == "TOO_LARGE"
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"x", headers={"content-length": "5000000000"})))
    with pytest.raises(FetchError) as exc:
        fetch_bytes("https://example.com/big.csv", max_bytes=1000, client=client)
    assert exc.value.code == "TOO_LARGE"


def test_not_found_and_empty_say_so(monkeypatch):
    _public(monkeypatch)
    with pytest.raises(FetchError) as exc:
        fetch_bytes("https://example.com/x.csv", client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(404))))
    assert exc.value.code == "FETCH_FAILED" and "404" in str(exc.value)
    with pytest.raises(FetchError) as exc:
        fetch_bytes("https://example.com/x.csv", client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b""))))
    assert exc.value.code == "EMPTY"


def test_hop_limit(monkeypatch):
    _public(monkeypatch)
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(302, headers={"location": "https://example.com/again"})))
    with pytest.raises(FetchError) as exc:
        fetch_bytes("https://example.com/start", client=client)
    assert "redirected too many times" in str(exc.value)
    assert fetch_url.MAX_HOPS == 4
