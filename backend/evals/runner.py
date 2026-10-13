"""Score what Chef said against what the case expects.

A case (chef_cases.json) is an instruction, the kind of reply it should
get, a reply a correct model gives, and what that reply must do to the
fixture file. The same scoring runs in two places:

  - CI (tests/test_chef_evals.py) feeds each case's own reply through the
    real validator and engine, so the plumbing a correct answer depends on
    cannot drift, and the expectations stay true of the fixture.
  - scripts/eval_chef.py asks the configured model with the real prompts
    and scores what comes back, which is the only test of the prompt itself.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app import lookups
from app.answers import extract_query, run_question
from app.engine import get_schema_from_local, replay_transformations_local
from app.llm.prompts import CHAT_SYSTEM_PROMPT, build_user_message
from app.routes.chat import _is_clarification, _is_insight_response
from app.sql_validator import SQLValidationError, validate_sql

CASES = Path(__file__).with_name("chef_cases.json")
RULES = Path(__file__).with_name("prompt_rules.json")


def load_cases(path: Path = CASES) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        cases = json.load(fh)
    ids = [c["id"] for c in cases]
    assert len(ids) == len(set(ids)), "duplicate case id"
    return cases


def load_rules(path: Path = RULES) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def classify(reply: str) -> tuple[str, Any]:
    """What kind of reply this is, and its payload: ("clarify", dict),
    ("insight", text), ("question", sql) or ("transform", sql)."""
    clarification = _is_clarification(reply)
    if clarification:
        return "clarify", clarification
    insight = _is_insight_response(reply)
    if insight:
        return "insight", insight.get("insight", "")
    query = extract_query(reply)
    if query is not None:
        return "question", query
    return "transform", reply.strip().strip("`").removeprefix("sql").strip()


def _lookup_views(paths: dict[str, str]) -> dict[str, lookups.LookupView]:
    return {"managers": lookups.LookupView("managers", "managers", "managers.csv", paths["managers"], [])}


def schema_for(paths: dict[str, str]) -> dict:
    return get_schema_from_local(paths["orders"])


def user_message(case: dict, schema: dict, paths: dict[str, str], *, privacy_mode: bool = True) -> str:
    """The exact message the chat route would send for this case."""
    lookup_schemas = None
    if case.get("lookups"):
        lookups.set_current(_lookup_views(paths))
        try:
            lookup_schemas = lookups.schemas()
        finally:
            lookups.clear()
    return build_user_message(case["instruction"], schema, privacy_mode=privacy_mode, lookups=lookup_schemas)


def system_prompt() -> str:
    return CHAT_SYSTEM_PROMPT


def _fail(reason: str, **detail) -> dict:
    return {"ok": False, "reason": reason, **detail}


def evaluate(case: dict, reply: str, paths: dict[str, str]) -> dict:
    """{"ok": bool, "kind": str, "reason": str, ...} for this reply."""
    kind, payload = classify(reply)
    want = case["kind"]
    expect = case.get("expect") or {}
    if kind != want:
        return _fail(f"expected a {want}, got a {kind}", kind=kind, reply=reply[:200])

    if kind == "clarify":
        return {"ok": True, "kind": kind, "reason": "asked: " + str(payload.get("question", ""))[:80]}

    if kind == "insight":
        missing = [m for m in expect.get("mentions", []) if m.lower() not in str(payload).lower()]
        if missing:
            return _fail(f"insight does not mention {missing}", kind=kind, reply=reply[:200])
        return {"ok": True, "kind": kind, "reason": "insight mentions " + ", ".join(expect.get("mentions", []))}

    try:
        sql = validate_sql(payload)
    except SQLValidationError as exc:
        return _fail(f"SQL rejected: {exc}", kind=kind, reply=reply[:200])

    if case.get("lookups"):
        lookups.set_current(_lookup_views(paths))
    try:
        if kind == "question":
            try:
                result = run_question(paths["orders"], [], sql)
            except Exception as exc:
                return _fail(f"query failed: {str(exc)[:160]}", kind=kind, sql=sql)
            return _check_answer(expect, result, sql)
        try:
            out = replay_transformations_local(paths["orders"], [{"step_number": 1, "sql_query": sql}], preview_limit=100)
        except Exception as exc:
            return _fail(f"step failed: {str(exc)[:160]}", kind=kind, sql=sql)
        return _check_transform(expect, out, sql, paths)
    finally:
        lookups.clear()


def _check_answer(expect: dict, result: dict, sql: str) -> dict:
    rows = result["rows"]
    if "answer_rows" in expect and result["total_rows"] != expect["answer_rows"]:
        return _fail(f"answer has {result['total_rows']} rows, expected {expect['answer_rows']}", kind="question", sql=sql, rows=rows[:5])
    for col, value in (expect.get("first") or {}).items():
        if not rows:
            return _fail("answer is empty", kind="question", sql=sql)
        got = rows[0].get(col)
        if got is None and col not in rows[0]:
            return _fail(f"answer has no column {col!r}; columns are {list(rows[0])}", kind="question", sql=sql)
        if not _same(got, value):
            return _fail(f"first row {col}={got!r}, expected {value!r}", kind="question", sql=sql, rows=rows[:5])
    return {"ok": True, "kind": "question", "reason": f"{result['total_rows']} row answer" + (f", first {expect['first']}" if expect.get("first") else "")}


def _check_transform(expect: dict, out: dict, sql: str, paths: dict[str, str]) -> dict:
    columns = out["columns"]
    base = [c["name"] for c in schema_for(paths)["columns"]]
    if "rows" in expect and out["total_rows"] != expect["rows"]:
        return _fail(f"{out['total_rows']} rows after, expected {expect['rows']}", kind="transform", sql=sql)
    added = [c for c in columns if c not in base]
    removed = [c for c in base if c not in columns]
    if "columns_added" in expect and sorted(added) != sorted(expect["columns_added"]):
        return _fail(f"columns added {added}, expected {expect['columns_added']}", kind="transform", sql=sql)
    if "columns_removed" in expect and sorted(removed) != sorted(expect["columns_removed"]):
        return _fail(f"columns removed {removed}, expected {expect['columns_removed']}", kind="transform", sql=sql)
    if "columns_added" not in expect and "columns_removed" not in expect and (added or removed):
        return _fail(f"columns changed: added {added}, removed {removed}", kind="transform", sql=sql)
    preview = out["preview"]
    for col, value in (expect.get("first") or {}).items():
        got = preview[0].get(col) if preview else None
        if not _same(got, value):
            return _fail(f"first row {col}={got!r}, expected {value!r}", kind="transform", sql=sql)
    if "no_empty_in" in expect:
        col = expect["no_empty_in"]
        empties = [r for r in preview if r.get(col) in (None, "")]
        if empties:
            return _fail(f"{len(empties)} rows still empty in {col}", kind="transform", sql=sql)
    if "value_count" in expect:
        vc = expect["value_count"]
        n = sum(1 for r in preview if _same(r.get(vc["column"]), vc["value"]))
        if n != vc["count"]:
            return _fail(f"{n} rows have {vc['column']}={vc['value']!r}, expected {vc['count']}", kind="transform", sql=sql)
    return {"ok": True, "kind": "transform", "reason": f"{out['total_rows']} rows, {len(columns)} columns" + (f", added {added}" if added else "")}


def _same(got: Any, want: Any) -> bool:
    if isinstance(want, (int, float)) and not isinstance(want, bool):
        try:
            return abs(float(got) - float(want)) < 1e-6
        except (TypeError, ValueError):
            return False
    return str(got) == str(want)
