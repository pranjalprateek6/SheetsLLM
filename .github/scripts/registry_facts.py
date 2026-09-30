#!/usr/bin/env python3
"""Verify a PR's dependency changes against the npm registry.

Reads the dependency files that changed between BASE_SHA and HEAD_SHA, asks the
registry whether every new exact version exists, and checks that each lockfile
entry resolves to registry.npmjs.org with the integrity hash the registry
publishes. Writes a Markdown table to registry.md for the AI reviewer, so its
statements about package versions rest on the registry rather than on memory.

Only the standard library plus `npm view`. Never fails the workflow: a registry
outage is reported in the table, not raised.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
from urllib.parse import urlparse

# On Windows npm is npm.cmd, which CreateProcess will not find by bare name.
NPM = shutil.which("npm") or "npm"
DEP_FILES = ("package.json", "package-lock.json")
DEP_SECTIONS = ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies")
EXACT = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")
MAX_ENTRIES = 80
OFFICIAL_HOST = "registry.npmjs.org"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def show(sha: str, path: str) -> dict:
    """The file at `sha`, parsed, or {} when it did not exist there."""
    try:
        return json.loads(git("show", f"{sha}:{path}"))
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return {}


def npm_view(name: str, version: str) -> dict | None:
    """The registry's record for name@version.

    None means the registry answered and has no such version. A dict with an
    "error" key means the question could not be asked: those two must never be
    confused, because the first is a supply-chain finding and the second is a
    flaky network. A transient failure is retried before it is reported.
    """
    last_error = "npm failed"
    for attempt in range(3):
        try:
            out = subprocess.run(
                [NPM, "view", f"{name}@{version}", "dist.tarball", "dist.integrity", "--json"],
                capture_output=True, text=True, timeout=60,
            )
        except FileNotFoundError:
            return {"error": "npm not installed"}
        except subprocess.TimeoutExpired:
            last_error = "timeout"
            time.sleep(2 * (attempt + 1))
            continue

        stdout = out.stdout.strip()
        if out.returncode == 0:
            # An existing package with no such version answers with nothing.
            if not stdout:
                return None
            try:
                data = json.loads(stdout)
            except json.JSONDecodeError:
                return None
            # A spec matching several versions yields a list; an exact one, an object.
            if isinstance(data, list):
                data = data[0] if data else None
            if not isinstance(data, dict):
                return None
            return {"tarball": data.get("dist.tarball"), "integrity": data.get("dist.integrity")}

        # With --json, npm reports the failure as JSON on stdout.
        code = None
        try:
            code = (json.loads(stdout).get("error") or {}).get("code")
        except (json.JSONDecodeError, AttributeError):
            pass
        if code == "E404":
            return None  # the package itself is not on the registry
        tail = (out.stderr.strip().splitlines() or [""])[-1]
        last_error = code or tail[:80] or "npm failed"
        time.sleep(2 * (attempt + 1))
    return {"error": last_error}


def lockfile_changes(base: str, head: str, path: str) -> list[dict]:
    old, new = show(base, path).get("packages", {}), show(head, path).get("packages", {})
    rows = []
    for key, entry in new.items():
        if not key or not isinstance(entry, dict):
            continue  # the root entry describes the project itself
        before = old.get(key) or {}
        tracked = ("version", "resolved", "integrity")
        if all(before.get(k) == entry.get(k) for k in tracked):
            continue
        rows.append({
            "file": path,
            "name": key.rsplit("node_modules/", 1)[-1],
            "old": before.get("version") or "(new)",
            "new": entry.get("version") or "?",
            "resolved": entry.get("resolved"),
            "integrity": entry.get("integrity"),
        })
    return rows


def manifest_changes(base: str, head: str, path: str) -> list[dict]:
    old, new = show(base, path), show(head, path)
    rows = []
    for section in DEP_SECTIONS:
        before, after = old.get(section) or {}, new.get(section) or {}
        for name, spec in after.items():
            if before.get(name) == spec:
                continue
            rows.append({"file": path, "name": name, "old": before.get(name) or "(new)", "new": spec})
    return rows


def main() -> int:
    base, head = os.environ["BASE_SHA"], os.environ["HEAD_SHA"]
    changed = [p for p in git("diff", "--name-only", f"{base}...{head}").split("\n")
               if p.rsplit("/", 1)[-1] in DEP_FILES]
    if not changed:
        open("registry.md", "w").close()
        print("No dependency files changed.")
        return 0

    lock_rows, manifest_rows = [], []
    for path in changed:
        if path.endswith("package-lock.json"):
            lock_rows += lockfile_changes(base, head, path)
        else:
            manifest_rows += manifest_changes(base, head, path)

    # A manifest change that the lockfile already covers is the same fact twice.
    locked = {(r["name"], r["new"]) for r in lock_rows}
    manifest_rows = [r for r in manifest_rows if (r["name"], r["new"].lstrip("^~=v")) not in locked]

    truncated = len(lock_rows) > MAX_ENTRIES
    lock_rows = lock_rows[:MAX_ENTRIES]

    not_found, off_registry, mismatched, unverified = 0, 0, 0, 0
    lines = [
        "## Registry facts (verified by tooling at review time)",
        "",
        "Every dependency version below was checked against https://registry.npmjs.org with `npm view` "
        "when this review ran. This table is ground truth for which versions exist; it supersedes "
        "anything remembered about package release histories.",
        "",
        "| package | before | after | on registry | resolved from | integrity matches registry |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for r in lock_rows:
        rec = npm_view(r["name"], r["new"])
        host = urlparse(r["resolved"] or "").hostname or "(none)"
        if rec is None:
            not_found += 1
            exists, match = "**NOT FOUND**", "n/a"
        elif rec.get("error"):
            unverified += 1
            exists, match = "unverified (" + rec["error"] + ")", "n/a"
        else:
            exists = "yes"
            if r["integrity"] and rec.get("integrity"):
                if r["integrity"] == rec["integrity"]:
                    match = "yes"
                else:
                    mismatched += 1
                    match = "**NO**"
            else:
                match = "n/a"
        if host != OFFICIAL_HOST and host != "(none)":
            off_registry += 1
            host = f"**{host}**"
        lines.append(f"| {r['name']} | {r['old']} | {r['new']} | {exists} | {host} | {match} |")

    for r in manifest_rows:
        spec = r["new"]
        if EXACT.match(spec):
            rec = npm_view(r["name"], spec)
            if rec is None:
                not_found += 1
                exists = "**NOT FOUND**"
            elif rec.get("error"):
                unverified += 1
                exists = "unverified"
            else:
                exists = "yes"
        else:
            exists = "range, not checked"
        lines.append(f"| {r['name']} ({r['file']}) | {r['old']} | {spec} | {exists} | manifest only | n/a |")

    verified = len(lock_rows) + len(manifest_rows)
    lines.append("")
    if truncated:
        lines.append(f"Only the first {MAX_ENTRIES} lockfile entries were checked.")
    if not_found or off_registry or mismatched:
        lines.append(
            f"ATTENTION: {not_found} version(s) not on the registry, {off_registry} resolved from a "
            f"host other than {OFFICIAL_HOST}, {mismatched} integrity mismatch(es). Treat each as a "
            "supply-chain finding and name it."
        )
    elif unverified:
        lines.append(f"{unverified} entr(ies) could not be verified because the registry was unreachable. "
                     "Say so rather than guessing.")
    else:
        lines.append(f"All {verified} changed entries exist on the registry, resolve from "
                     f"{OFFICIAL_HOST}, and match its integrity hashes. Do not report them as suspicious.")

    open("registry.md", "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
