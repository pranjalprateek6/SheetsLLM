"""Lookup tables: a second file beside the one being cleaned.

"Add each region's manager from this other file" needs the other file in
the same query. A lookup is a link from a file to another file the user
owns, under a short alias (managers). For the length of a request the
engine shows every lookup of the open file as a view by that alias, as its
own steps have left it, so a step, a question, an export, a recipe run and
a share link all see it without any of them knowing how.

The alias is the only new name a query learns; it is checked here so it
can never shadow the engine's own names or carry anything but letters.
"""

from __future__ import annotations

import contextvars
import re
from dataclasses import dataclass, field
from pathlib import Path
import logging

from app import db

logger = logging.getLogger(__name__)
from app.cache import get_local_parquet

ALIAS_RE = re.compile(r"^[a-z][a-z0-9_]{0,29}$")
RESERVED = {"data", "raw", "cur", "r", "d", "l"}
MAX_LOOKUPS = 5
MAX_LOOKUP_ROWS = 200_000


class LookupError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass
class LookupView:
    alias: str
    file_id: str
    name: str
    local_path: str | Path
    steps: list[dict] = field(default_factory=list)


# The lookups of the file this request is about. A ContextVar, so a handler
# sets it once and every thread the request fans out to (to_thread, the
# query timeout's worker) sees the same value, while other requests do not.
_current: contextvars.ContextVar[dict[str, LookupView]] = contextvars.ContextVar("lookups", default={})


def current() -> dict[str, LookupView]:
    return _current.get()


def set_current(lookups: dict[str, LookupView]) -> contextvars.Token:
    return _current.set(dict(lookups))


def clear() -> None:
    _current.set({})


def check_alias(alias: object) -> str:
    """A usable alias, or a LookupError that says what is wrong with it."""
    text = str(alias or "").strip().lower()
    if not text:
        raise LookupError("BAD_ALIAS", "Give the lookup a short name, like managers.")
    if not ALIAS_RE.match(text):
        raise LookupError("BAD_ALIAS", "A lookup name is letters, digits and underscores, starting with a letter, up to 30 long.")
    if text in RESERVED or text.startswith("step_") or text.startswith("raw__"):
        raise LookupError("BAD_ALIAS", f"{text} is a name the engine uses. Pick another.")
    return text


def suggest_alias(file_name: str, taken: set[str] = frozenset()) -> str:
    """A name from a file name: orders_oct.csv becomes orders_oct."""
    stem = re.sub(r"\.[^.]+$", "", file_name or "").lower()
    stem = re.sub(r"[^a-z0-9]+", "_", stem).strip("_")[:28] or "lookup"
    if not stem[0].isalpha():
        stem = "t_" + stem
    alias = stem
    n = 2
    while alias in taken or alias in RESERVED:
        alias = f"{stem}_{n}"
        n += 1
    return alias


def load(file_id: str, user_id: str) -> dict[str, LookupView]:
    """The file's lookups, each with its Parquet on disk and its own steps.
    A lookup the user no longer owns is skipped, not fatal."""
    out: dict[str, LookupView] = {}
    try:
        links = db.list_lookups(file_id)
    except Exception as exc:  # the table is missing (migration 015 not applied) or the DB is away
        logger.warning("lookups unavailable for %s: %s", file_id, exc)
        return out
    for link in links:
        rec = db.get_file(link["lookup_file_id"], user_id)
        if not rec:
            continue
        try:
            path = get_local_parquet(rec["r2_key"])
        except Exception:
            continue
        out[link["alias"]] = LookupView(
            alias=link["alias"], file_id=rec["id"], name=rec.get("name", ""),
            local_path=path, steps=db.get_transformations(rec["id"]),
        )
    return out


def use(file_id: str, user_id: str) -> dict[str, LookupView]:
    """Load the file's lookups and make them the request's. Returns them."""
    lookups = load(file_id, user_id)
    set_current(lookups)
    return lookups


def schemas(lookups: dict[str, LookupView] | None = None) -> dict[str, list[dict]]:
    """{alias: [{name, dtype}]} for each lookup, from a DESCRIBE of its view."""
    from app.engine import get_connection

    lookups = current() if lookups is None else lookups
    if not lookups:
        return {}
    con = get_connection()
    out: dict[str, list[dict]] = {}
    for alias in lookups:
        try:
            rows = con.execute(f"DESCRIBE SELECT * FROM {alias}").fetchall()
            out[alias] = [{"name": str(r[0]), "dtype": str(r[1])} for r in rows]
        except Exception:
            out[alias] = []
    return out


def aliases_in(sql: str, aliases: list[str] | set[str]) -> list[str]:
    """Which of these aliases a query names as a table."""
    return [a for a in aliases if re.search(rf"\b{re.escape(a)}\b", sql or "", re.IGNORECASE)]


def required_for(steps: list[dict], lookups: dict[str, LookupView]) -> list[dict]:
    """What a recipe made of these steps needs: each lookup any step names."""
    needed = []
    seen: set[str] = set()
    for step in steps:
        for alias in aliases_in(step.get("sql_query", ""), list(lookups)):
            if alias not in seen:
                seen.add(alias)
                lv = lookups[alias]
                needed.append({"alias": alias, "lookup_file_id": lv.file_id, "lookup_file_name": lv.name})
    return needed
