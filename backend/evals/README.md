# Chef regression set

Sixteen instructions a person types into Chef, each with the kind of reply it
should get, a reply a correct model gives, and what that reply must do to a
fixed file of twelve October orders (`fixture.py`).

Two things run on it.

**In CI, with no model** (`tests/test_chef_evals.py`): every case's own reply
goes through the real validator and engine and must meet its expectation, and
the prompts must still state every rule in `prompt_rules.json`. This catches a
validator or engine change that breaks a correct answer, and a prompt edit that
drops a rule.

**On demand, with the real model** (`scripts/eval_chef.py`): the same cases are
sent with the real prompts and the strict message, and what comes back is
scored the same way. This is the only test of the prompt itself. Run it before
merging a prompt change, and after a model change:

```bash
cd backend && PYTHONPATH=. .venv/Scripts/python.exe scripts/eval_chef.py
```

One request per case. `--limit N` and `--only id,id` keep a run inside a small
quota; `--loose` sends sample rows to tell a prompt problem from a missing
value. The scorecard is printed and written to `evals/last_run.json` (not
committed); the exit code is 1 when any case fails.

## Adding a case

Add an entry to `chef_cases.json`: `id`, `instruction`, `kind` (`transform`,
`question`, `insight` or `clarify`), the `reply` a correct model gives, and
`expect`. For a transform: `rows`, `columns_added`, `columns_removed`, `first`
(values in the first preview row), `no_empty_in`, `value_count`. For a
question: `answer_rows` and `first`. For an insight: `mentions`. Set
`"lookups": true` to attach the managers table under the alias `managers`.
The numbers come from the fixture; its docstring lists the ones that matter.
