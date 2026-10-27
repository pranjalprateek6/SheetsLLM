"""Queries take turns, so two heavy ones never share the instance's memory;
work that already has a turn never waits on itself."""

import threading
import time

import pytest

from app import engine


@pytest.fixture
def one_turn(monkeypatch):
    monkeypatch.setattr(engine, "_turns", threading.BoundedSemaphore(1))
    monkeypatch.setattr(engine, "DUCKDB_QUEUE_WAIT_SECONDS", 5)


def test_two_queries_never_run_at_once(one_turn):
    running, most = [0], [0]
    lock = threading.Lock()

    def query():
        with lock:
            running[0] += 1
            most[0] = max(most[0], running[0])
        time.sleep(0.05)
        with lock:
            running[0] -= 1

    threads = [threading.Thread(target=engine._run_with_timeout, args=(query,)) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert most[0] == 1


def test_work_holding_a_turn_runs_its_own_queries(one_turn):
    @engine.one_at_a_time
    def insights():
        return engine._run_with_timeout(lambda: engine._run_with_timeout(lambda: "done", timeout=2), timeout=2)

    assert insights() == "done"


def test_a_query_that_waits_too_long_says_the_server_is_busy(one_turn, monkeypatch):
    monkeypatch.setattr(engine, "DUCKDB_QUEUE_WAIT_SECONDS", 0.1)
    release = threading.Event()
    holder = threading.Thread(target=engine._run_with_timeout, args=(release.wait,), kwargs={"timeout": 5})
    holder.start()
    time.sleep(0.05)
    with pytest.raises(engine.QueryTimeoutError, match="busy"):
        engine._run_with_timeout(lambda: None)
    release.set()
    holder.join()
    assert engine._run_with_timeout(lambda: "free again") == "free again"


def test_a_query_past_its_time_gives_its_turn_back_when_it_stops(one_turn):
    stop = threading.Event()
    with pytest.raises(engine.QueryTimeoutError):
        engine._run_with_timeout(lambda: stop.wait(5), timeout=0.1)
    stop.set()
    assert engine._run_with_timeout(lambda: "next", timeout=2) == "next"


def test_each_connection_spills_inside_its_budget():
    con = engine.get_connection()
    limit = con.execute("SELECT current_setting('max_memory')").fetchone()[0]
    temp = con.execute("SELECT current_setting('max_temp_directory_size')").fetchone()[0]
    con.close()
    want = engine.duckdb.connect().execute(f"SET max_memory='{engine.DUCKDB_MEMORY_LIMIT}'; SELECT current_setting('max_memory')").fetchone()[0]
    assert limit == want
    assert temp


def test_the_shipped_budget_leaves_room_on_a_512_mb_instance(monkeypatch):
    import importlib

    from app import config

    for name in ("DUCKDB_MEMORY_LIMIT", "DUCKDB_QUERIES_AT_ONCE"):
        monkeypatch.delenv(name, raising=False)
    try:
        fresh = importlib.reload(config)
        assert fresh.DUCKDB_MEMORY_LIMIT == "200MB"
        assert fresh.DUCKDB_QUERIES_AT_ONCE == 1
    finally:
        monkeypatch.undo()
        importlib.reload(config)
