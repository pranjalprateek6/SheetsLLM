"""Tier 4: schedules and the runner, lifecycle emails, shared recipes and
the share page's info."""
from __future__ import annotations

import asyncio
import datetime as dt
import types

import pytest
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

import app.main as main_module
from app import db, events, lifecycle, mail, schedules
from app.main import app
from app.routes import loops as loops_route
from app.share import make_token

NOW = dt.datetime(2026, 11, 5, 4, 0, tzinfo=dt.timezone.utc)
R1 = "11111111-1111-1111-1111-111111111111"


# ── schedules ────────────────────────────────────────────────────────


def test_a_schedule_needs_a_real_link_and_a_day_that_every_month_has():
    assert schedules.check_schedule({"url": "https://example.com/orders.csv", "day": 5})["day"] == 5
    for bad in ({"url": "https://example.com/x.csv", "day": 31}, {"url": "https://example.com/x.csv", "day": "x"},
                {"url": "not a link", "day": 5}, "nope"):
        with pytest.raises(schedules.ScheduleError):
            schedules.check_schedule(bad)


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr(main_module, "ALLOW_ANONYMOUS", True)
    st = types.SimpleNamespace(updates=[], events=[], scheduled=[])
    monkeypatch.setattr(db, "get_recipe", lambda rid, uid: {"id": rid, "user_id": uid, "name": "Orders",
                                                            "steps": [{"instruction": "Trim", "sql_query": "SELECT * FROM data"}],
                                                            "required_columns": [{"name": "Region"}]} if rid == R1 else None)
    monkeypatch.setattr(db, "update_recipe", lambda rid, uid, **u: st.updates.append(u) or {"id": rid})
    monkeypatch.setattr(db, "list_scheduled_recipes", lambda uid=None: list(st.scheduled))
    monkeypatch.setattr(events, "record", lambda uid, ev, **p: st.events.append((ev, p)))
    monkeypatch.setattr(schedules, "limit_for", lambda uid: 1)
    st.client = TestClient(app, raise_server_exceptions=False)
    return st


def test_setting_a_schedule_saves_it_and_the_free_plan_holds_one(api):
    r = api.client.put(f"/recipes/{R1}/schedule", json={"url": "https://example.com/o.csv", "day": 5})
    assert r.status_code == 200 and api.updates[-1] == {"schedule": {"url": "https://example.com/o.csv", "day": 5}}
    api.scheduled.append({"id": "other", "user_id": "anonymous"})
    r = api.client.put(f"/recipes/{R1}/schedule", json={"url": "https://example.com/o.csv", "day": 5})
    assert r.status_code == 402 and r.json()["code"] == "SCHEDULE_LIMIT_REACHED"
    assert api.client.delete(f"/recipes/{R1}/schedule").json()["schedule"] is None


def test_the_cron_route_needs_the_secret(monkeypatch, api):
    monkeypatch.setattr(loops_route, "CRON_SECRET", "s3cret")

    async def no_runs(now=None):
        return {"due": 0, "ran": 0, "failed": 0}

    monkeypatch.setattr(schedules, "run_due", no_runs)
    assert api.client.post("/schedules/run").status_code == 401
    assert api.client.post("/schedules/run", headers={"X-Cron-Secret": "s3cret"}).json()["due"] == 0


@pytest.fixture
def runner(monkeypatch):
    st = types.SimpleNamespace(mails=[], events=[])
    monkeypatch.setattr(db, "list_scheduled_recipes", lambda uid=None: [
        {"id": "r-due", "user_id": "u1", "name": "Orders", "schedule": {"url": "https://example.com/o.csv", "day": 5}},
        {"id": "r-later", "user_id": "u1", "name": "Payroll", "schedule": {"url": "https://example.com/p.csv", "day": 20}},
    ])
    monkeypatch.setattr(db, "user_events", lambda uid, names, limit=200: [])
    monkeypatch.setattr(db, "user_email", lambda uid: "one@example.com")
    monkeypatch.setattr(db, "get_user_settings", lambda uid: None)
    monkeypatch.setattr(mail, "send", lambda to, subject, text, headers=None, **kw: (st.mails.append((subject, text)), True)[1])
    monkeypatch.setattr(events, "record", lambda uid, ev, **p: st.events.append((ev, p)))
    import app.usage as usage

    monkeypatch.setattr(usage, "enforce", lambda *a, **k: None)
    import app.fetch_url as fetch_url

    monkeypatch.setattr(fetch_url, "fetch_bytes", lambda url: (b"Region\nNorth\n", "o.csv"))
    import app.routes.upload as upload_route

    async def ingest(**kw):
        st.ingested = kw
        return {"file_id": kw["file_id"], "preview": {"total_rows": 10}}

    monkeypatch.setattr(upload_route, "_ingest", ingest)
    import app.routes.recipes as recipes_route

    async def apply(request, recipe_id):
        body = await request.json()
        st.applied = (request.state.user_id, recipe_id, body)
        return {"preview": {"total_rows": 8}, "checks": [{"ok": True}, {"ok": False}]}

    monkeypatch.setattr(recipes_route, "apply_recipe", apply)
    return st


def test_the_runner_fetches_ingests_applies_and_mails_the_due_recipe(runner):
    out = asyncio.run(schedules.run_due(NOW))
    assert out["due"] == 1 and out["ran"] == 1
    assert runner.ingested["source_url"] == "https://example.com/o.csv" and runner.ingested["source"] == "url"
    assert runner.applied[0] == "u1" and runner.applied[1] == "r-due"
    subject, text = runner.mails[0]
    assert subject == "Orders ran on this month's file"
    assert "10 rows in, 8 rows out." in text and "1 of 2 checks failed" in text and "/s/" in text
    assert ("schedule_ran", {"recipe_id": "r-due", "ok": True}) in runner.events


def test_a_link_that_fails_says_so_by_email(runner, monkeypatch):
    import app.fetch_url as fetch_url

    def broken(url):
        raise fetch_url.FetchError("FETCH_FAILED", "The link answered 404.")

    monkeypatch.setattr(fetch_url, "fetch_bytes", broken)
    out = asyncio.run(schedules.run_due(NOW))
    assert out["failed"] == 1
    assert runner.mails[0][0] == "Orders didn't run this month" and "404" in runner.mails[0][1]


def test_a_recipe_that_fails_to_fit_says_so(runner, monkeypatch):
    import app.routes.recipes as recipes_route

    async def misfit(request, recipe_id):
        return JSONResponse(status_code=400, content={"code": "RECIPE_INCOMPATIBLE", "message": "missing Region"})

    monkeypatch.setattr(recipes_route, "apply_recipe", misfit)
    asyncio.run(schedules.run_due(NOW))
    assert "missing Region" in runner.mails[0][1]


# ── lifecycle ────────────────────────────────────────────────────────


def ev(name, **props):
    return {"event": name, "properties": props}


def test_each_lifecycle_email_is_due_once_and_only_one_a_day():
    assert lifecycle.kinds_due([], [ev("export_completed", steps=3)]) == [("keep_steps", {"steps": 3})]
    assert lifecycle.kinds_due([], [ev("export_completed", steps=0)]) == []
    assert lifecycle.kinds_due([ev("recipe_saved")], [ev("export_completed", steps=3)]) == []
    assert lifecycle.kinds_due([ev("recipe_saved")], [ev("recipe_saved", recipe_id="r1")])[0][0] == "month_two"
    assert lifecycle.kinds_due([ev("recipe_applied")], [ev("recipe_applied")])[0][0] == "schedule_it"
    sent = [ev("lifecycle_mail_sent", kind="schedule_it")]
    assert lifecycle.kinds_due(sent, [ev("recipe_applied")]) == []
    two = lifecycle.kinds_due([], [ev("export_completed", steps=1), ev("recipe_saved")])
    assert len(two) == 1


def test_the_lifecycle_pass_mails_and_records(monkeypatch):
    monkeypatch.setattr(db, "list_events", lambda since, names, limit=20000: [
        {"user_id": "u1", "event": "export_completed", "properties": {"steps": 2}},
        {"user_id": "anonymous", "event": "export_completed", "properties": {"steps": 2}},
    ])
    monkeypatch.setattr(db, "user_events", lambda uid, names, limit=2000: [])
    monkeypatch.setattr(db, "user_email", lambda uid: "one@example.com")
    monkeypatch.setattr(db, "get_user_settings", lambda uid: None)
    sent, recorded = [], []
    monkeypatch.setattr(mail, "send", lambda to, subject, text, headers=None, **kw: (sent.append((to, subject, headers)), True)[1])
    monkeypatch.setattr(events, "record", lambda uid, ev, **p: recorded.append((uid, ev, p)))
    assert lifecycle.run_daily(now=NOW) == {"sent": 1}
    assert sent[0][0] == "one@example.com" and sent[0][1] == "Keep those steps for next month"
    assert "List-Unsubscribe" in sent[0][2]
    assert recorded == [("u1", "lifecycle_mail_sent", {"kind": "keep_steps"})]


# ── shared recipes and the share page ────────────────────────────────


def test_a_shared_recipe_shows_steps_and_imports_into_another_account(api, monkeypatch):
    token = api.client.post(f"/recipes/{R1}/share").json()["token"]
    public = api.client.get(f"/shared-recipes/{token}").json()
    assert public["name"] == "Orders" and public["steps"][0]["instruction"] == "Trim"
    assert public["required_columns"] == ["Region"]
    file_token, _ = make_token(R1, "anonymous")
    assert api.client.get(f"/shared-recipes/{file_token}").status_code == 404, "a file link is not a recipe link"

    created = []
    monkeypatch.setattr(db, "list_recipes", lambda uid: [])
    monkeypatch.setattr(db, "create_recipe", lambda **kw: created.append(kw) or {"id": "new", "name": kw["name"]})
    r = api.client.post("/recipes/import", json={"token": token})
    assert r.status_code == 200 and created[0]["name"] == "Orders" and created[0]["source_file_id"] is None
    assert api.client.post("/recipes/import", json={"token": "garbage"}).status_code == 404


def test_the_share_page_info_names_the_file_and_its_steps(monkeypatch):
    f = "22222222-2222-2222-2222-222222222222"
    monkeypatch.setattr(db, "get_file", lambda fid, uid: {"id": f, "name": "orders.csv", "row_count": 900, "column_count": 7} if fid == f else None)
    monkeypatch.setattr(db, "get_transformations", lambda fid: [{"instruction": "Trim Email"}, {"instruction": "Remove duplicates"}])
    token, expires = make_token(f, "u1")
    body = TestClient(app).get(f"/shared/{token}/info").json()
    assert body == {"name": "orders.csv", "rows": 900, "columns": 7, "steps": ["Trim Email", "Remove duplicates"], "expires_at": expires}
    assert TestClient(app).get("/shared/garbage/info").status_code == 404
