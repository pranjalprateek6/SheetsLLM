"""A scripted LLM for tests and end-to-end runs. Never touches the network.

Enabled with LLM_PROVIDER=fake. Replies come from a JSON file, by default
app/llm/fake_replies.json, overridable with FAKE_LLM_REPLIES=<path>: a list of
{"match": <substring>, "reply": <text>} rules matched against the lower-cased
user message. The route builds that message as the conversation history
followed by the current instruction, so of all the rules that match, the one
whose phrase occurs latest in the message is the one about this turn; earlier
occurrences belong to history. Two sentinel replies stand in for provider behaviour
the routes have to handle:

  "__quota__"    raises LlmError carrying the same "429 RESOURCE_EXHAUSTED"
                 text Gemini produces once the daily pool is gone
  "__invalid__"  returns a statement that is not a SELECT, which the SQL
                 validator must reject

A message no rule matches gets a clarification, so an unscripted instruction
never writes a step by accident. Every call is kept (bounded) so an end-to-end
test can assert how many LLM calls a path cost, through GET /__fake_llm/calls.
"""
from __future__ import annotations

import json
import os
import threading
from collections import deque
from pathlib import Path

from .adapter import LlmClient, LlmError

DEFAULT_REPLIES = Path(__file__).with_name("fake_replies.json")
MAX_CALLS = 500

QUOTA = "__quota__"
INVALID = "__invalid__"

NO_MATCH_REPLY = json.dumps({
    "needs_clarification": True,
    "question": "The fake LLM has no scripted reply for that instruction.",
})

_calls: deque[dict] = deque(maxlen=MAX_CALLS)
_lock = threading.Lock()


def load_rules(path: str | os.PathLike | None = None) -> list[dict]:
    """The rule list from `path`, FAKE_LLM_REPLIES, or the shipped default."""
    source = Path(path or os.getenv("FAKE_LLM_REPLIES") or DEFAULT_REPLIES)
    with open(source, encoding="utf-8") as fh:
        rules = json.load(fh)
    if not isinstance(rules, list):
        raise ValueError(f"{source}: expected a list of rules")
    for i, rule in enumerate(rules):
        if not isinstance(rule, dict) or "match" not in rule or "reply" not in rule:
            raise ValueError(f"{source}: rule {i} needs 'match' and 'reply'")
    return rules


def calls() -> list[dict]:
    with _lock:
        return list(_calls)


def reset_calls() -> None:
    with _lock:
        _calls.clear()


class FakeLlm(LlmClient):
    def __init__(self, rules: list[dict] | None = None):
        self.rules = rules if rules is not None else load_rules()

    def generate_sql(self, system_prompt: str, user_message: str) -> str:
        needle = user_message.lower()
        reply, matched, best = NO_MATCH_REPLY, None, -1
        for rule in self.rules:
            pos = needle.rfind(str(rule["match"]).lower())
            if pos > best:
                best, reply, matched = pos, str(rule["reply"]), rule["match"]

        # The user message is what the route built, schema block included, so
        # a test can also assert what was (not) sent. The system prompt is
        # long and static; its length is enough to notice a change.
        with _lock:
            _calls.append({
                "user_message": user_message,
                "system_prompt_chars": len(system_prompt),
                "matched": matched,
                "reply": reply,
            })

        if reply == QUOTA:
            raise LlmError("Fake request failed: 429 RESOURCE_EXHAUSTED: daily quota exceeded")
        if reply == INVALID:
            return "DROP TABLE data"
        return reply
