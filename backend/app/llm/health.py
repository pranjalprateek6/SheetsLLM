"""What the AI provider has been doing lately, so a failure can say whose
fault it is. In memory, per process: the last failure and its kind, the
last success. "Chef didn't answer" becomes "Google's model is overloaded
right now" when that is what happened, and the status page can say the
same without a second call to the provider.
"""

from __future__ import annotations

import datetime as _dt
import threading

# A failure older than this, with nothing since, no longer counts against the provider
STALE_AFTER_SECONDS = 10 * 60

_lock = threading.Lock()
_last_failure: tuple[str, _dt.datetime] | None = None
_last_success: _dt.datetime | None = None


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def note_failure(kind: str) -> None:
    """kind is quota, unavailable or other."""
    global _last_failure
    with _lock:
        _last_failure = (kind, _now())


def note_success() -> None:
    global _last_success
    with _lock:
        _last_success = _now()


def reset() -> None:
    global _last_failure, _last_success
    with _lock:
        _last_failure = None
        _last_success = None


def state(now: _dt.datetime | None = None) -> dict:
    """ok, and when it last went wrong and why. ok means no failure since
    the last success, or the last failure is old enough to forget."""
    now = now or _now()
    with _lock:
        failure, success = _last_failure, _last_success
    if failure is None:
        return {"ok": True, "kind": None, "since": None, "last_ok": success.isoformat() if success else None}
    kind, at = failure
    recovered = success is not None and success >= at
    stale = (now - at).total_seconds() > STALE_AFTER_SECONDS
    return {
        "ok": recovered or stale,
        "kind": None if (recovered or stale) else kind,
        "since": None if (recovered or stale) else at.isoformat(),
        "last_ok": success.isoformat() if success else None,
    }
