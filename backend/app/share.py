"""Share links: a signed, expiring token that serves one file's cleaned CSV
to anyone who has it, with no sign-in. Nothing is stored; the token
carries the file, its owner and the expiry, signed with a server secret,
so a link can be checked without a lookup and cannot be minted or altered.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from app.config import SHARE_SECRET, SUPABASE_SERVICE_KEY

SHARE_TTL_SECONDS = 7 * 24 * 3600


def _secret() -> bytes:
    # A dedicated secret when set; else derived from the service key, which
    # every deployment has and nobody else does. Never the key itself.
    raw = SHARE_SECRET or hashlib.sha256(("share:" + SUPABASE_SERVICE_KEY).encode()).hexdigest()
    return raw.encode("utf-8")


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def make_token(file_id: str, user_id: str, *, ttl: int = SHARE_TTL_SECONDS, now: float | None = None) -> tuple[str, int]:
    """A token for this file, and when it stops working (unix seconds)."""
    expires = int((now if now is not None else time.time()) + ttl)
    payload = _b64(json.dumps({"f": file_id, "u": user_id, "e": expires}, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(), payload.encode("ascii"), hashlib.sha256).digest())
    return f"{payload}.{sig}", expires


def read_token(token: str, *, now: float | None = None) -> tuple[str, str] | None:
    """(file_id, user_id) for a token that is intact and not expired, else None."""
    try:
        payload, sig = token.split(".", 1)
        expected = _b64(hmac.new(_secret(), payload.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(_unb64(payload))
        if int(data["e"]) < (now if now is not None else time.time()):
            return None
        return str(data["f"]), str(data["u"])
    except Exception:
        return None
