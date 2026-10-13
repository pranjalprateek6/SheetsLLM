"""The Chef regression set, the part of it that runs without a model.

Each case's own correct reply goes through the real validator and engine
and must meet its expectation, so the plumbing a right answer depends on
(the validator's allow-list, REPLACE and EXCLUDE, lookup views, the
question runner) cannot drift, and the expectations stay true of the
fixture. The prompts must still state every rule the cases rely on.
scripts/eval_chef.py runs the same cases against the real model."""
from __future__ import annotations

import pytest

from app.llm.prompts import SYSTEM_PROMPT, lookups_text
from evals import fixture, runner

CASES = runner.load_cases()


@pytest.fixture(scope="module")
def paths(tmp_path_factory):
    return fixture.build(tmp_path_factory.mktemp("chef"))


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_the_correct_reply_meets_its_expectation(case, paths):
    verdict = runner.evaluate(case, case["reply"], paths)
    assert verdict["ok"], verdict


def test_every_case_has_a_kind_and_a_reply():
    for case in CASES:
        assert case["kind"] in {"transform", "question", "insight", "clarify"}, case["id"]
        assert case["reply"].strip(), case["id"]
        assert case["instruction"].strip(), case["id"]


def test_a_wrong_reply_is_caught(paths):
    case = next(c for c in CASES if c["id"] == "dedupe")
    # kept every row: the instruction was not carried out
    assert not runner.evaluate(case, "SELECT * FROM data", paths)["ok"]
    # answered instead of changing the file
    assert not runner.evaluate(case, '{"query": "SELECT COUNT(*) AS n FROM data"}', paths)["ok"]
    # not a SELECT at all
    assert "rejected" in runner.evaluate(case, "DELETE FROM data", paths)["reason"]
    question = next(c for c in CASES if c["id"] == "top-region")
    # the right shape, the wrong region (empty regions were not left out)
    wrong = '{"query": "SELECT \\"Region\\" AS region, COUNT(*) AS n FROM data GROUP BY 1 ORDER BY 2 DESC"}'
    assert not runner.evaluate(question, wrong, paths)["ok"]


def test_the_user_message_names_the_columns_and_the_lookup(paths):
    schema = runner.schema_for(paths)
    plain = runner.user_message(CASES[0], schema, paths)
    assert "Instruction: remove duplicate rows" in plain
    for col in fixture.ORDER_COLUMNS:
        assert col in plain
    assert "a@x.com" not in plain, "strict mode never sends a value"
    join = next(c for c in CASES if c["id"] == "join-managers")
    with_lookup = runner.user_message(join, schema, paths)
    assert "managers" in with_lookup and "Manager" in with_lookup


@pytest.mark.parametrize("rule", runner.load_rules(), ids=[r["rule"] for r in runner.load_rules()])
def test_the_prompts_still_state_each_rule(rule):
    texts = {
        "chat": [runner.system_prompt()],
        "sql": [SYSTEM_PROMPT],
        "both": [runner.system_prompt(), SYSTEM_PROMPT],
        "lookups": [lookups_text({"managers": [{"name": "Region", "dtype": "VARCHAR"}]})],
        "strict": [runner.user_message({"instruction": "x"}, {"columns": []}, {}, privacy_mode=True)],
    }[rule["prompt"]]
    for text in texts:
        assert rule["phrase"] in text, f"the prompt no longer says: {rule['rule']}"
