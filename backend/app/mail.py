"""Sending an email, through Resend's HTTP API when a key is set.

Without RESEND_API_KEY nothing is sent: send() says so and returns False,
so the rest of the app works the same with or without email. One
provider, one function, no SDK.
"""

from __future__ import annotations

import logging

import httpx

from app.config import REMINDER_FROM, RESEND_API_KEY

logger = logging.getLogger("sheetsllm.mail")

_ENDPOINT = "https://api.resend.com/emails"


def configured() -> bool:
    return bool(RESEND_API_KEY and REMINDER_FROM)


def send(
    to: str, subject: str, text: str, *, headers: dict[str, str] | None = None, client: httpx.Client | None = None
) -> bool:
    """True when the provider accepted the message."""
    if not configured():
        logger.info("mail: not configured, would send to %s: %s", to, subject)
        return False
    own = client is None
    client = client or httpx.Client(timeout=20.0)
    try:
        resp = client.post(
            _ENDPOINT,
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json={"from": REMINDER_FROM, "to": [to], "subject": subject, "text": text, **({"headers": headers} if headers else {})},
        )
        if resp.status_code >= 300:
            logger.warning("mail: provider answered %s for %s", resp.status_code, to)
            return False
        return True
    except httpx.HTTPError as exc:
        logger.warning("mail: send failed for %s: %s", to, exc)
        return False
    finally:
        if own:
            client.close()
