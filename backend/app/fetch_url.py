"""Fetch a file from a link, safely.

A link is the second way in after a file drop: a CSV on a server, an
export someone shared, a Google Sheet shared with anyone who has the link,
or a file shared from Google Drive, OneDrive, SharePoint or Dropbox (each
share link is turned into its direct download).
The server fetches it, which is where the care goes: only http and https,
never a private or local address (so a link cannot read this server's own
network), redirects followed by hand with every hop checked, and the same
size cap as an upload, enforced while the bytes arrive.
"""

from __future__ import annotations

import ipaddress
import re
import socket
from urllib.parse import parse_qs, urljoin, urlparse

import httpx

from app.config import MAX_UPLOAD_MB, UPLOAD_MAX_BYTES

MAX_HOPS = 4
TIMEOUT_SECONDS = 30.0

_SHEETS = re.compile(r"^https?://docs\.google\.com/spreadsheets/d/([A-Za-z0-9_-]+)")
# A sheet published to the web: /d/e/<id>/pubhtml or /pub
_PUBLISHED = re.compile(r"^https?://docs\.google\.com/spreadsheets/d/e/([A-Za-z0-9_-]+)/pub(html)?")
# A Drive file: /file/d/<id>/..., /open?id=<id>, /uc?id=<id>
_DRIVE_FILE = re.compile(r"^https?://drive\.google\.com/file/d/([A-Za-z0-9_-]+)")
_DRIVE_ID = re.compile(r"^https?://drive\.google\.com/(open|uc)\b")

_BY_CONTENT_TYPE = {
    "text/csv": "csv",
    "text/tab-separated-values": "tsv",
    "application/json": "json",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "application/octet-stream": "csv",
    "text/plain": "csv",
}


class FetchError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def normalise_url(raw: str) -> str:
    """A fetchable URL from what someone pasted: a scheme added when it is
    missing, and a Google Sheets link turned into its CSV export (the sheet
    must be shared with anyone who has the link). The gid in the link picks
    the tab; without one the first tab comes."""
    url = (raw or "").strip()
    if not url:
        raise FetchError("BAD_URL", "Paste a link to a file.")
    if not re.match(r"^[a-z][a-z0-9+.-]*://", url, re.IGNORECASE):
        url = "https://" + url
    return _direct(url)


def _set_query(url: str, **params: str) -> str:
    """The URL with these query parameters set (replacing any already there)."""
    from urllib.parse import urlencode

    parsed = urlparse(url)
    query = {k: v[-1] for k, v in parse_qs(parsed.query, keep_blank_values=True).items()}
    query.update(params)
    return parsed._replace(query=urlencode(query)).geturl()


def _direct(url: str) -> str:
    """A share link turned into the link that downloads the file itself."""
    m = _PUBLISHED.match(url)
    if m:
        parsed = urlparse(url)
        gid = parse_qs(parsed.query).get("gid", [None])[0]
        return f"https://docs.google.com/spreadsheets/d/e/{m.group(1)}/pub?output=csv" + (f"&gid={gid}" if gid else "")
    m = _SHEETS.match(url)
    if m:
        parsed = urlparse(url)
        gid = parse_qs(parsed.query).get("gid", [None])[0]
        if not gid and parsed.fragment.startswith("gid="):
            gid = parsed.fragment[4:]
        return f"https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=csv" + (f"&gid={gid}" if gid else "")
    m = _DRIVE_FILE.match(url)
    if m:
        return f"https://drive.google.com/uc?export=download&id={m.group(1)}"
    if _DRIVE_ID.match(url):
        file_id = parse_qs(urlparse(url).query).get("id", [None])[0]
        if file_id and re.fullmatch(r"[A-Za-z0-9_-]+", file_id):
            return f"https://drive.google.com/uc?export=download&id={file_id}"
    host = (urlparse(url).hostname or "").lower()
    # Dropbox: dl=0 shows a preview page, dl=1 sends the file
    if host in ("www.dropbox.com", "dropbox.com"):
        return _set_query(url, dl="1")
    # SharePoint and OneDrive share links send the file with download=1
    if host.endswith(".sharepoint.com") or host in ("onedrive.live.com", "1drv.ms"):
        return _set_query(url, download="1")
    return url


def _resolve_public(host: str) -> str:
    """The address ``host`` resolves to, refused when any answer is a
    private, loopback or otherwise internal address, so a link cannot
    reach this server's own network. The request then connects to this
    exact address (not to the name again), so a name that changes its
    answer between the check and the connect gains nothing."""
    if not host or host.lower() in ("localhost",) or host.endswith(".local"):
        raise FetchError("PRIVATE_HOST", "That link points inside a private network.")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise FetchError("BAD_HOST", "That address could not be found.")
    if not infos:
        raise FetchError("BAD_HOST", "That address could not be found.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise FetchError("PRIVATE_HOST", "That link points inside a private network.")
    return infos[0][4][0]


def _pinned(parsed, ip: str) -> str:
    """The same URL with the host replaced by the validated address."""
    literal = f"[{ip}]" if ":" in ip else ip
    netloc = f"{literal}:{parsed.port}" if parsed.port else literal
    return parsed._replace(netloc=netloc).geturl()


def _filename(url: str, response: httpx.Response) -> str:
    disposition = response.headers.get("content-disposition", "")
    m = re.search(r"filename\*?=(?:UTF-8'')?\"?([^\";]+)\"?", disposition, re.IGNORECASE)
    name = m.group(1).strip() if m else ""
    if not name:
        name = urlparse(url).path.rsplit("/", 1)[-1] or ""
        if "docs.google.com" in url:
            name = "sheet"
    if "." not in name:
        ctype = response.headers.get("content-type", "").split(";")[0].strip().lower()
        name = (name or "download") + "." + _BY_CONTENT_TYPE.get(ctype, "csv")
    return name[:120]


def fetch_bytes(url: str, *, max_bytes: int = UPLOAD_MAX_BYTES, client: httpx.Client | None = None) -> tuple[bytes, str]:
    """The bytes at ``url`` and a file name for them. Raises FetchError with
    a code the route can answer with."""
    own = client is None
    client = client or httpx.Client(follow_redirects=False, timeout=TIMEOUT_SECONDS, headers={"User-Agent": "SheetsLLM/1.0 (+https://sheets-llm.vercel.app)"})
    try:
        for _ in range(MAX_HOPS):
            parsed = urlparse(url)
            if parsed.scheme not in ("http", "https"):
                raise FetchError("BAD_URL", "Only http and https links can be fetched.")
            host = parsed.hostname or ""
            ip = _resolve_public(host)
            # Connect to the checked address; the name goes in the Host
            # header and the TLS handshake, so the certificate is still
            # verified against it
            host_header = f"{host}:{parsed.port}" if parsed.port else host
            with client.stream(
                "GET", _pinned(parsed, ip), headers={"Host": host_header}, extensions={"sni_hostname": host}
            ) as response:
                if response.status_code in (301, 302, 303, 307, 308) and response.headers.get("location"):
                    url = urljoin(url, response.headers["location"])
                    continue
                if response.status_code != 200:
                    raise FetchError("FETCH_FAILED", f"The link answered {response.status_code}. Check that it is public.")
                length = response.headers.get("content-length")
                if length and length.isdigit() and int(length) > max_bytes:
                    raise FetchError("TOO_LARGE", f"That file is over {MAX_UPLOAD_MB} MB.")
                chunks: list[bytes] = []
                seen = 0
                for chunk in response.iter_bytes():
                    seen += len(chunk)
                    if seen > max_bytes:
                        raise FetchError("TOO_LARGE", f"That file is over {MAX_UPLOAD_MB} MB.")
                    chunks.append(chunk)
                data = b"".join(chunks)
                if not data:
                    raise FetchError("EMPTY", "The link answered with an empty file.")
                ctype = response.headers.get("content-type", "").split(";")[0].strip().lower()
                if ctype in ("text/html", "application/xhtml+xml") or data[:512].lstrip().lower().startswith((b"<!doctype html", b"<html")):
                    raise FetchError(
                        "NOT_A_FILE",
                        "That link opens a web page, not a file. Share it with anyone who has the link, "
                        "or use the file's download link.",
                    )
                return data, _filename(url, response)
        raise FetchError("FETCH_FAILED", "The link redirected too many times.")
    except httpx.HTTPError as exc:
        raise FetchError("FETCH_FAILED", "The link could not be fetched. Check it opens in a browser.") from exc
    finally:
        if own:
            client.close()
