"""A recipe's history, and recipes as files."""
from __future__ import annotations

import json
import uuid

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app import db, events, recipe_versions, usage
from app.main import app
from app.recipes import RecipeError

STEPS = [
    {"step_number": 1, "instruction": "Remove duplicate rows", "sql_query": "SELECT DISTINCT * FROM data"},
    {"step_number": 2, "instruction": "Drop rows where Region is empty", "sql_query": 'SELECT * FROM data WHERE "Region" IS NOT NULL'},
]


class Store:
    """recipes and recipe_versions, in memory, through the db functions."""

    def __init__(self, monkeypatch, *, migrated: bool = True):
        self.recipes: dict[str, dict] = {}
        self.versions: list[dict] = []
        self.migrated = migrated

        def need():
            if not self.migrated:
                raise db.MigrationMissing("Run migration 019")

        def create_recipe(**kw):
            rid = str(uuid.uuid4())
            row = {"id": rid, "checks": [], "required_lookups": [], "description": None, **kw}
            row.setdefault("required_lookups", [])
            self.recipes[rid] = row
            return dict(row)

        def update_recipe(rid, uid, **up):
            r = self.recipes.get(rid)
            if not r or r["user_id"] != uid:
                return None
            r.update(up)
            return dict(r)

        def list_versions(rid, uid, limit=50):
            need()
            rows = sorted((v for v in self.versions if v["recipe_id"] == rid and v["user_id"] == uid), key=lambda v: -v["version"])
            return [dict(v) for v in rows[:limit]]

        def get_version(rid, uid, n):
            need()
            return next((dict(v) for v in self.versions if v["recipe_id"] == rid and v["user_id"] == uid and v["version"] == n), None)

        def add_version(**row):
            need()
            self.versions.append({"created_at": "2026-10-18T10:00:00Z", **row})
            return row

        def prune(rid, uid, below):
            self.versions = [v for v in self.versions if not (v["recipe_id"] == rid and v["version"] < below)]

        monkeypatch.setattr(db, "create_recipe", create_recipe)
        monkeypatch.setattr(db, "update_recipe", update_recipe)
        monkeypatch.setattr(db, "get_recipe", lambda rid, uid: (dict(self.recipes[rid]) if rid in self.recipes and self.recipes[rid]["user_id"] == uid else None))
        monkeypatch.setattr(db, "list_recipes", lambda uid: [r for r in self.recipes.values() if r["user_id"] == uid])
        monkeypatch.setattr(db, "save_recipe_checks", lambda rid, uid, checks: update_recipe(rid, uid, checks=checks))
        monkeypatch.setattr(db, "list_recipe_versions", list_versions)
        monkeypatch.setattr(db, "get_recipe_version", get_version)
        monkeypatch.setattr(db, "add_recipe_version", add_version)
        monkeypatch.setattr(db, "prune_recipe_versions", prune)


@pytest.fixture
def store(monkeypatch):
    monkeypatch.setattr(events, "record", lambda *a, **k: None)
    return Store(monkeypatch)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    monkeypatch.setattr(usage, "recipe_limit", lambda uid: 0)
    return TestClient(app, raise_server_exceptions=False)


def _recipe(store: Store, **kw) -> dict:
    return store.recipes[db.create_recipe(user_id="anonymous", name="Monthly orders", steps=STEPS, required_columns=[{"name": "Region", "type": "VARCHAR"}], **kw)["id"]]


# ── recording ─────────────────────────────────────────────────────────

def test_a_saved_recipe_is_version_one(store):
    r = _recipe(store)
    assert recipe_versions.record("anonymous", r, "saved") == 1
    assert [(v["version"], v["reason"]) for v in store.versions] == [(1, "saved")]


def test_a_recipe_from_before_history_keeps_its_old_state_first(store):
    r = _recipe(store)
    before = dict(r)
    after = db.update_recipe(r["id"], "anonymous", name="Monthly orders, cleaned")
    assert recipe_versions.record("anonymous", after, "renamed", before=before) == 2
    assert [(v["version"], v["reason"], v["name"]) for v in store.versions] == [
        (1, "earliest", "Monthly orders"),
        (2, "renamed", "Monthly orders, cleaned"),
    ]


def test_only_the_last_fifty_are_kept(store, monkeypatch):
    monkeypatch.setattr(recipe_versions, "KEEP", 3)
    r = _recipe(store)
    for _ in range(5):
        recipe_versions.record("anonymous", r, "saved")
    assert sorted(v["version"] for v in store.versions) == [3, 4, 5]


def test_without_the_migration_a_change_still_goes_through(monkeypatch):
    monkeypatch.setattr(events, "record", lambda *a, **k: None)
    s = Store(monkeypatch, migrated=False)
    r = _recipe(s)
    assert recipe_versions.record("anonymous", r, "saved") is None


# ── the file ─────────────────────────────────────────────────────────

def test_a_recipe_survives_export_and_import():
    recipe = {
        "name": "Monthly orders", "description": "October's cleanup", "steps": STEPS,
        "required_columns": [{"name": "Region", "type": "VARCHAR"}],
        "checks": [{"type": "unique", "column": "Order ID"}],
        "required_lookups": [{"alias": "managers", "lookup_file_id": str(uuid.uuid4()), "lookup_file_name": "regions.csv"}],
    }
    out = recipe_versions.to_file(recipe)
    assert out["format"] == "sheetsllm-recipe" and out["lookups"] == ["managers"]
    # The file names no file of this account
    assert "lookup_file_id" not in json.dumps(out)
    back = recipe_versions.from_file(json.loads(json.dumps(out)))
    assert [s["instruction"] for s in back["steps"]] == [s["instruction"] for s in STEPS]
    assert back["checks"][0]["type"] == "unique"
    assert back["required_lookups"] == [{"alias": "managers", "lookup_file_id": None, "lookup_file_name": None}]


@pytest.mark.parametrize("data,says", [
    ({"format": "something-else"}, "isn't a SheetsLLM recipe"),
    ({"format": "sheetsllm-recipe", "format_version": 99, "steps": STEPS}, "newer version"),
    ({"format": "sheetsllm-recipe", "format_version": 1, "steps": []}, "no steps"),
    ({"format": "sheetsllm-recipe", "format_version": 1, "steps": [{"instruction": "x", "sql_query": "DROP TABLE data"}]}, "failed validation"),
    ({"format": "sheetsllm-recipe", "format_version": 1, "steps": [{"instruction": "x", "sql_query": "DELETE FROM data"}]}, "failed validation"),
    ({"format": "sheetsllm-recipe", "format_version": 1, "steps": [{"instruction": "x", "sql_query": "SELECT * FROM read_csv('/etc/passwd')"}]}, "failed validation"),
    ({"format": "sheetsllm-recipe", "format_version": 1, "steps": [{"instruction": "x"}]}, "no SQL"),
    ({"format": "sheetsllm-recipe", "format_version": 1, "steps": STEPS * 60}, "up to 100 steps"),
    ({"format": "sheetsllm-recipe", "format_version": 1, "steps": STEPS, "checks": [{"type": "nope", "column": "a"}]}, "type must be"),
])
def test_a_bad_or_unsafe_file_is_refused(data, says):
    with pytest.raises(RecipeError, match=says):
        recipe_versions.from_file(data)


# ── the routes ────────────────────────────────────────────────────────

def test_export_then_import_makes_a_new_recipe_with_its_first_version(store, client):
    r = _recipe(store, description="October")
    exported = client.get(f"/recipes/{r['id']}/export")
    assert exported.status_code == 200
    body = exported.json()
    body["checks"] = [{"type": "not_empty", "column": "Region"}]
    imported = client.post("/recipes/import-file", content=json.dumps(body))
    assert imported.status_code == 200, imported.text
    new_id = imported.json()["recipe_id"]
    assert new_id != r["id"]
    assert store.recipes[new_id]["checks"] == [{"type": "not_empty", "column": "Region"}]
    assert [(v["recipe_id"], v["reason"]) for v in store.versions] == [(new_id, "imported")]


def test_import_refuses_garbage_and_honours_the_cap(store, client, monkeypatch):
    assert client.post("/recipes/import-file", content=b"not json").json()["code"] == "INVALID_RECIPE_FILE"
    assert client.post("/recipes/import-file", content=b"x" * (600 * 1024)).status_code == 413
    _recipe(store)
    monkeypatch.setattr(usage, "recipe_limit", lambda uid: 1)
    good = recipe_versions.to_file({"name": "x", "steps": STEPS})
    r = client.post("/recipes/import-file", content=json.dumps(good))
    assert r.status_code == 402 and r.json()["code"] == "RECIPE_LIMIT_REACHED"


def test_history_lists_versions_and_restores_one(store, client):
    r = _recipe(store)
    recipe_versions.record("anonymous", r, "saved")
    one_step = db.update_recipe(r["id"], "anonymous", steps=STEPS[:1])
    recipe_versions.record("anonymous", one_step, "steps_edited")

    listed = client.get(f"/recipes/{r['id']}/versions").json()["versions"]
    assert [(v["version"], v["label"], len(v["steps"])) for v in listed] == [(2, "Steps reordered or removed", 1), (1, "Saved", 2)]
    assert listed[0]["matches_current"] is True and listed[1]["matches_current"] is False

    back = client.post(f"/recipes/{r['id']}/versions/1/restore")
    assert back.status_code == 200, back.text
    assert back.json()["restored"] == 1 and back.json()["version"] == 3
    assert len(store.recipes[r["id"]]["steps"]) == 2
    newest = client.get(f"/recipes/{r['id']}/versions").json()["versions"][0]
    assert newest["label"] == "Restored version 1" and newest["matches_current"] is True

    assert client.post(f"/recipes/{r['id']}/versions/9/restore").status_code == 404
    assert client.get(f"/recipes/{uuid.uuid4()}/versions").status_code == 404


def test_history_says_when_the_migration_is_missing(client, monkeypatch):
    monkeypatch.setattr(events, "record", lambda *a, **k: None)
    s = Store(monkeypatch, migrated=False)
    r = _recipe(s)
    resp = client.get(f"/recipes/{r['id']}/versions")
    assert resp.status_code == 200 and resp.json() == {"recipe_id": r["id"], "versions": [], "kept": False}


def test_renaming_through_the_api_keeps_the_old_name(store, client, monkeypatch):
    monkeypatch.setattr(db, "create_audit_entry", lambda **kw: {})
    r = _recipe(store)
    assert client.patch(f"/recipes/{r['id']}", json={"name": "Orders, cleaned"}).status_code == 200
    assert [(v["reason"], v["name"]) for v in store.versions] == [("earliest", "Monthly orders"), ("renamed", "Orders, cleaned")]
    # A description-only edit is not a new version
    assert client.patch(f"/recipes/{r['id']}", json={"description": "x"}).status_code == 200
    assert len(store.versions) == 2
