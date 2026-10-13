"""Run the Chef regression set against the real model.

    cd backend
    PYTHONPATH=. .venv/Scripts/python.exe scripts/eval_chef.py            # every case
    PYTHONPATH=. .venv/Scripts/python.exe scripts/eval_chef.py --only dedupe,top-region
    PYTHONPATH=. .venv/Scripts/python.exe scripts/eval_chef.py --limit 5 --loose

Reads the provider from the environment like the server does (LLM_PROVIDER,
GEMINI_API_KEY, GEMINI_MODEL). Each case is one request, so on the free
Gemini tier the whole set is most of a day's quota; --limit and --only
exist for that. The scorecard goes to stdout and evals/last_run.json;
the exit code is 1 when any case fails, so it can gate a prompt change.

--loose sends sample rows (privacy mode off) instead of the strict
message, to see whether a failure is the prompt or the missing values.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from evals import fixture, runner  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Score the configured model on the Chef regression set")
    ap.add_argument("--only", help="comma-separated case ids")
    ap.add_argument("--limit", type=int, help="run at most this many cases")
    ap.add_argument("--loose", action="store_true", help="send sample rows (privacy mode off)")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "evals" / "last_run.json"))
    args = ap.parse_args()

    from app.llm.factory import get_llm

    cases = runner.load_cases()
    if args.only:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        unknown = wanted - {c["id"] for c in cases}
        if unknown:
            print(f"unknown case ids: {sorted(unknown)}", file=sys.stderr)
            return 2
        cases = [c for c in cases if c["id"] in wanted]
    if args.limit:
        cases = cases[: args.limit]

    llm = get_llm()
    with tempfile.TemporaryDirectory() as tmp:
        paths = fixture.build(tmp)
        schema = runner.schema_for(paths)
        results = []
        width = max(len(c["id"]) for c in cases)
        print(f"{len(cases)} cases, provider {type(llm).__name__}, {'loose' if args.loose else 'strict'} message\n")
        for case in cases:
            message = runner.user_message(case, schema, paths, privacy_mode=not args.loose)
            started = time.monotonic()
            try:
                reply = llm.generate_sql(runner.system_prompt(), message)
                verdict = runner.evaluate(case, reply, paths)
            except Exception as exc:  # a provider error is a failed case, not a crashed run
                reply = ""
                verdict = {"ok": False, "kind": "error", "reason": f"{type(exc).__name__}: {str(exc)[:160]}"}
            took = time.monotonic() - started
            results.append({"id": case["id"], "instruction": case["instruction"], "ok": verdict["ok"],
                            "reason": verdict.get("reason"), "reply": reply, "seconds": round(took, 1)})
            mark = "PASS" if verdict["ok"] else "FAIL"
            print(f"  {mark}  {case['id']:<{width}}  {verdict.get('reason', '')[:100]}")
            if not verdict["ok"] and reply:
                print(f"        reply: {reply.strip()[:220]}")

    passed = sum(1 for r in results if r["ok"])
    print(f"\n{passed}/{len(results)} passed")
    Path(args.out).write_text(json.dumps({
        "ran_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "provider": type(llm).__name__,
        "strict": not args.loose,
        "passed": passed,
        "total": len(results),
        "results": results,
    }, indent=2), encoding="utf-8")
    print(f"written to {args.out}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
